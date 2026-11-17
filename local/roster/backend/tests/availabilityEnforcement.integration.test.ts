import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("strict availability across roster mutations", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `availability-test-${suffix}`;
  const otherStoreId = `availability-other-${suffix}`;
  const employeeId = `availability-employee-${suffix}`;
  let roleId = "";

  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.shiftRole.deleteMany({ where: { storeId: { in: [storeId, otherStoreId] } } });
    await prisma.$disconnect();
  });

  it("blocks unavailable create/copy and preserves existing shifts when availability changes", async () => {
    const baseSettings = { storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30,
      minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK" as const, weeklyHourWarning: 38, dailyHourWarning: 10 };
    await service.saveSettings(baseSettings);
    const role = await prisma.shiftRole.create({ data: { storeId, code: `qa-${suffix}`, nameZh: "QA role", colorToken: "#334155" } });
    roleId = role.id;
    const period = await service.createPeriod({ storeId, startDate: "2037-10-05", endDate: "2037-10-11", cycleType: "WEEK" }, "qa-account");
    const mutation = {
      storeId, rosterPeriodId: period.id, date: "2037-10-07",
      startAt: "2037-10-07T10:00:00.000Z", endAt: "2037-10-07T15:00:00.000Z",
      breakMinutes: 30, shiftRoleId: roleId,
      assignments: [{ employeeId, employeeNameSnapshot: "QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }],
    };
    await expect(service.createShift(mutation, "qa-account")).rejects.toMatchObject({ status: 422 });
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-07"], entries: [{ date: "2037-10-07", status: "AVAILABLE", startAt: "2037-10-07T09:00:00.000Z", endAt: "2037-10-07T17:00:00.000Z" }] });
    const shift = await service.createShift(mutation, "qa-account");
    await service.saveSettings({ storeId: otherStoreId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const otherRole = await prisma.shiftRole.create({ data: { storeId: otherStoreId, code: `qa-${suffix}`, nameZh: "Other store QA role", colorToken: "#334155" } });
    const otherPeriod = await service.createPeriod({ storeId: otherStoreId, startDate: "2037-10-05", endDate: "2037-10-11", cycleType: "WEEK" }, "qa-account");
    await service.replaceAvailability({ storeId: otherStoreId, employeeId, dates: ["2037-10-07"], entries: [{ date: "2037-10-07", status: "AVAILABLE", startAt: "2037-10-07T09:00:00.000Z", endAt: "2037-10-07T17:00:00.000Z" }] });
    await expect(service.createShift({ ...mutation, storeId: otherStoreId, rosterPeriodId: otherPeriod.id, shiftRoleId: otherRole.id }, "qa-account")).rejects.toMatchObject({ status: 409 });
    const otherShift = await service.createShift({ ...mutation, storeId: otherStoreId, rosterPeriodId: otherPeriod.id, shiftRoleId: otherRole.id, startAt: "2037-10-07T16:00:00.000Z", endAt: "2037-10-07T17:00:00.000Z", breakMinutes: 0 }, "qa-account");
    await expect(service.repositionShift(otherShift.id, { storeId: otherStoreId, date: "2037-10-07", startAt: "2037-10-07T11:00:00.000Z", endAt: "2037-10-07T12:00:00.000Z", targetStartDate: "2037-10-05", targetEndDate: "2037-10-11", version: otherShift.version }, "qa-account", [employeeId])).rejects.toMatchObject({ status: 409 });
    await expect(service.updateShift(shift.id, { ...mutation, startAt: "2037-10-07T08:00:00.000Z", version: shift.version }, "qa-account")).rejects.toMatchObject({ status: 422 });
    const versionBeforeBatch = (await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version;
    await prisma.employeeAvailability.deleteMany({ where: { storeId, employeeId, date: new Date("2037-10-07") } });
    await expect(service.batchUpdate(storeId, [{ id: shift.id, version: shift.version }], { publicNote: "Must not save" }, "qa-account", [employeeId]))
      .rejects.toMatchObject({ status: 422, validation: { code: "EMPLOYEE_UNAVAILABLE", employeeId } });
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).version).toBe(shift.version);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(versionBeforeBatch);
    await prisma.employeeAvailability.create({ data: { storeId, employeeId, date: new Date("2037-10-07"), status: "AVAILABLE",
      startAt: new Date("2037-10-07T09:00:00.000Z"), endAt: new Date("2037-10-07T17:00:00.000Z") } });
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: false } });
    await expect(service.batchUpdate(storeId, [{ id: shift.id, version: shift.version }], { publicNote: "Must not save" }, "qa-account", [employeeId]))
      .rejects.toMatchObject({ status: 422, validation: { code: "INACTIVE_SHIFT_ROLE" } });
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).version).toBe(shift.version);
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: true } });
    await expect(service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-07"], entries: [] })).rejects.toMatchObject({ status: 422, validation: { code: "EMPLOYEE_UNAVAILABLE", employeeId, employeeName: "QA employee", start: "2037-10-07T10:00:00.000Z", end: "2037-10-07T15:00:00.000Z" } });
    expect(await prisma.employeeAvailability.count({ where: { storeId, employeeId, date: new Date("2037-10-07T00:00:00.000Z") } })).toBe(1);
    const preview = await service.previewCopyPeriod({ storeId, sourcePeriodId: period.id, targetStartDate: "2037-10-12", activeEmployeeIds: [employeeId] });
    expect(preview).toMatchObject({ shiftCount: 1, readyShifts: 0, unavailableAssignments: 1, canCopy: false });
    await expect(service.copyPeriod({ storeId, sourcePeriodId: period.id, targetStartDate: "2037-10-12", activeEmployeeIds: [employeeId], expectedSourcePeriodVersion: 1 }, "qa-account")).rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
    expect(preview.issues[0]?.employeeName).toBe("QA employee");
    await expect(service.copyPeriod({ storeId, sourcePeriodId: period.id, targetStartDate: "2037-10-12", activeEmployeeIds: [employeeId] }, "qa-account")).rejects.toMatchObject({ status: 422 });
    expect(await prisma.shift.count({ where: { storeId } })).toBe(1);
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);
    const narrowed = await service.saveSettings({ ...baseSettings, minimumShiftMinutes: 360, version: 1 });
    await expect(service.batchUpdate(storeId, [{ id: shift.id, version: shift.version }], { publicNote: "Must not save" }, "qa-account", [employeeId]))
      .rejects.toMatchObject({ status: 400, validation: { code: "MIN_SHIFT_DURATION" } });
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).version).toBe(shift.version);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(versionBeforeBatch);
    const laterOpening = await service.saveSettings({ ...baseSettings, openingTime: "11:00", version: narrowed.version });
    await expect(service.batchUpdate(storeId, [{ id: shift.id, version: shift.version }], { publicNote: "Must not save" }, "qa-account", [employeeId]))
      .rejects.toMatchObject({ status: 400, validation: { code: "OUTSIDE_OPERATING_HOURS" } });
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).version).toBe(shift.version);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(versionBeforeBatch);
    await service.saveSettings({ ...baseSettings, version: laterOpening.version });
    expect(await service.batchUpdate(storeId, [{ id: shift.id, version: shift.version }], { publicNote: "Validated batch" }, "qa-account", [employeeId]))
      .toEqual({ updated: 1 });
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).toMatchObject({ version: shift.version + 1, publicNote: "Validated batch" });
    const targetRole = await prisma.shiftRole.create({ data: { storeId, code: `batch-${suffix}`, nameZh: "Validated role", colorToken: "#475569" } });
    expect(await service.batchUpdate(storeId, [{ id: shift.id, version: shift.version + 1 }], { shiftRoleId: targetRole.id, formalRoleName: "Official validated role" }, "qa-account", [employeeId]))
      .toEqual({ updated: 1 });
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).toMatchObject({ version: shift.version + 2,
      shiftRoleId: targetRole.id, roleNameSnapshot: "Official validated role", roleColorSnapshot: "#475569" });
  });

  it("detects conflicts between shifts in one copied batch and writes no target period", async () => {
    const sourcePeriod = await prisma.rosterPeriod.findFirstOrThrow({ where: { storeId } });
    const sourceShift = await prisma.shift.findFirstOrThrow({ where: { storeId } });
    await prisma.shift.create({ data: {
      rosterPeriodId: sourcePeriod.id, storeId, date: sourceShift.date,
      startAt: new Date("2037-10-07T14:00:00.000Z"), endAt: new Date("2037-10-07T16:00:00.000Z"),
      breakMinutes: 0, shiftRoleId: roleId, roleNameSnapshot: "QA role", roleColorSnapshot: "#334155",
      createdByAccountId: "qa-account", updatedByAccountId: "qa-account",
      assignments: { create: { employeeId, employeeNameSnapshot: "QA employee", employeeTypeSnapshot: "REGULAR" } },
    } });
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-14"], entries: [{
      date: "2037-10-14", status: "AVAILABLE", startAt: "2037-10-14T09:00:00.000Z", endAt: "2037-10-14T17:00:00.000Z",
    }] });
    const targetStartDate = "2037-10-12";
    const preview = await service.previewCopyPeriod({ storeId, sourcePeriodId: sourcePeriod.id, targetStartDate, activeEmployeeIds: [employeeId] });
    expect(preview).toMatchObject({ shiftCount: 2, readyShifts: 1, availableAssignments: 1, conflictingAssignments: 1, canCopy: false });
    expect(preview.issues.some((issue) => issue.code === "SHIFT_OVERLAP" && issue.employeeId === employeeId)).toBe(true);
    await expect(service.copyPeriod({ storeId, sourcePeriodId: sourcePeriod.id, targetStartDate, activeEmployeeIds: [employeeId] }, "qa-account")).rejects.toMatchObject({ validation: { code: "SHIFT_OVERLAP", employeeId } });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);
  });

  it("does not copy a source week containing an unassigned shift", async () => {
    const sourcePeriod = await prisma.rosterPeriod.findFirstOrThrow({ where: { storeId } });
    const unassigned = await prisma.shift.create({ data: {
      rosterPeriodId: sourcePeriod.id, storeId, date: new Date("2037-10-06"),
      startAt: new Date("2037-10-06T10:00:00.000Z"), endAt: new Date("2037-10-06T11:00:00.000Z"),
      breakMinutes: 0, shiftRoleId: roleId, roleNameSnapshot: "QA role", roleColorSnapshot: "#334155",
      createdByAccountId: "qa-account", updatedByAccountId: "qa-account",
    } });
    const input = { storeId, sourcePeriodId: sourcePeriod.id, targetStartDate: "2037-10-12", activeEmployeeIds: [employeeId] };
    const preview = await service.previewCopyPeriod(input);
    expect(preview.issues).toContainEqual(expect.objectContaining({ code: "INVALID_ASSIGNMENTS", shiftId: unassigned.id }));
    expect(preview.canCopy).toBe(false);
    await expect(service.copyPeriod(input, "qa-account")).rejects.toMatchObject({ status: 422, validation: { code: "INVALID_ASSIGNMENTS", shiftId: unassigned.id } });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);
  });
});
