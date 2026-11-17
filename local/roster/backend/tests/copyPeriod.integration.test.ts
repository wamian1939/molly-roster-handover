import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("atomic Copy Week", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `copy-week-${suffix}`;
  const malformedStoreId = `copy-week-malformed-${suffix}`;
  const employeeId = `copy-week-employee-${suffix}`;

  afterAll(async () => {
    const stores = { in: [storeId, malformedStoreId] };
    await prisma.rosterPeriod.deleteMany({ where: { storeId: stores } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId: stores } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId: stores } });
    await prisma.shiftRole.deleteMany({ where: { storeId: stores } });
    await prisma.$disconnect();
  });

  it("blocks an empty source week in preview before the rejected commit", async () => {
    await expect(service.createPeriod({ storeId, startDate: "2038-04-06", endDate: "2038-04-12", cycleType: "WEEK" }, "qa-account"))
      .rejects.toMatchObject({ status: 400, validation: { code: "INVALID_TIME_RANGE" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId, startDate: new Date("2038-04-06") } })).toBe(0);
    const source = await service.createPeriod({ storeId, startDate: "2038-04-05", endDate: "2038-04-11", cycleType: "WEEK" }, "qa-account");
    const input = { storeId, sourcePeriodId: source.id, targetStartDate: "2038-04-12", activeEmployeeIds: [] };
    const preview = await service.previewCopyPeriod(input);
    expect(preview).toMatchObject({ shiftCount: 0, readyShifts: 0, canCopy: false });
    expect(preview.issues).toContainEqual(expect.objectContaining({ code: "NO_SOURCE_SHIFTS", severity: "BLOCKING_ERROR" }));
    await expect(service.copyPeriod({ ...input, expectedSourcePeriodVersion: preview.sourcePeriodVersion }, "qa-account"))
      .rejects.toMatchObject({ status: 422 });
    expect(await prisma.rosterPeriod.count({ where: { storeId, startDate: new Date("2038-04-12") } })).toBe(0);
  });

  it("does not copy or publish a malformed one-day WEEK source", async () => {
    await service.saveSettings({ storeId: malformedStoreId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId: malformedStoreId, code: `malformed-${suffix}`, nameZh: "QA", colorToken: "#334155" } });
    const source = await prisma.rosterPeriod.create({ data: { storeId: malformedStoreId, startDate: new Date("2038-05-03"),
      endDate: new Date("2038-05-03"), cycleType: "WEEK", createdByAccountId: "qa-account" } });
    const employee = `malformed-employee-${suffix}`;
    for (const date of ["2038-05-03", "2038-05-10"]) await service.replaceAvailability({ storeId: malformedStoreId, employeeId: employee,
      dates: [date], entries: [{ date, status: "AVAILABLE", startAt: `${date}T08:00:00.000Z`, endAt: `${date}T12:00:00.000Z` }] });
    const malformedShift = await prisma.shift.create({ data: { rosterPeriodId: source.id, storeId: malformedStoreId, date: new Date("2038-05-03"),
      startAt: new Date("2038-05-03T09:00:00.000Z"), endAt: new Date("2038-05-03T10:00:00.000Z"), breakMinutes: 0,
      shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-account", updatedByAccountId: "qa-account", assignments: { create: {
        employeeId: employee, employeeNameSnapshot: "QA employee", employeeTypeSnapshot: "REGULAR" } } } });
    const snapshot = { employeeId: employee, employeeNameSnapshot: "QA employee", employeeTypeSnapshot: "REGULAR",
      employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    const malformedCreate = { storeId: malformedStoreId, date: "2038-05-03", startAt: "2038-05-03T10:00:00.000Z",
      endAt: "2038-05-03T11:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id, assignments: [snapshot] };
    await expect(service.createShift({ ...malformedCreate, rosterPeriodId: source.id }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    await expect(service.createShiftWithPeriod({ ...malformedCreate, targetStartDate: "2038-05-03", targetEndDate: "2038-05-09" }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    await expect(service.updateShift(malformedShift.id, { ...malformedCreate, rosterPeriodId: source.id, version: malformedShift.version }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    await expect(service.batchUpdate(malformedStoreId, [{ id: malformedShift.id, version: malformedShift.version }],
      { publicNote: "Must not save" }, "qa-account", [employee]))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: malformedShift.id } })).toMatchObject({ version: 1, publicNote: null });
    const input = { storeId: malformedStoreId, sourcePeriodId: source.id, targetStartDate: "2038-05-10", activeEmployeeIds: [employee] };
    const preview = await service.previewCopyPeriod(input);
    expect(preview.canCopy).toBe(false);
    expect(preview.issues).toContainEqual(expect.objectContaining({ code: "INVALID_TIME_RANGE" }));
    await expect(service.copyPeriod({ ...input, expectedSourcePeriodVersion: source.version }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    const dayInput = { storeId: malformedStoreId, sourceDate: "2038-05-03", targetDate: "2038-05-10", activeEmployeeIds: [employee] };
    const dayPreview = await service.previewCopyDay(dayInput);
    expect(dayPreview).toMatchObject({ shiftCount: 1, readyShifts: 0, canCopy: false });
    expect(dayPreview.issues).toContainEqual(expect.objectContaining({ code: "INVALID_TIME_RANGE" }));
    await expect(service.copyDay(dayInput, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId: malformedStoreId } })).toBe(1);
    const repeatInput = { storeId: malformedStoreId, sourceShiftId: malformedShift.id, targetDates: ["2038-05-10"], activeEmployeeIds: [employee] };
    const repeatPreview = await service.previewRepeatShift(repeatInput);
    expect(repeatPreview).toMatchObject({ shiftCount: 1, readyShifts: 0, canCopy: false });
    await expect(service.repeatShift({ ...repeatInput, expectedSourcePeriodVersion: repeatPreview.sourcePeriodVersion,
      expectedTargetPeriodVersions: repeatPreview.targetPeriodVersions }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    await expect(service.publishPeriod(malformedStoreId, source.id, source.version,
      { accountId: "qa-account", displayName: "QA" }, { id: malformedStoreId, name: "QA" }, [snapshot]))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId: malformedStoreId } })).toBe(1);
    expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: source.id } })).toBe(0);
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: source.id } })).toMatchObject({ status: "DRAFT", version: 1 });

    const validSource = await service.createPeriod({ storeId: malformedStoreId, startDate: "2038-05-17", endDate: "2038-05-23", cycleType: "WEEK" }, "qa-account");
    await service.replaceAvailability({ storeId: malformedStoreId, employeeId: employee, dates: ["2038-05-17", "2038-05-18", "2038-05-24"],
      entries: [{ date: "2038-05-17", status: "AVAILABLE", startAt: "2038-05-17T08:00:00.000Z", endAt: "2038-05-17T12:00:00.000Z" },
        { date: "2038-05-18", status: "AVAILABLE", startAt: "2038-05-18T08:00:00.000Z", endAt: "2038-05-18T12:00:00.000Z" },
        { date: "2038-05-24", status: "AVAILABLE", startAt: "2038-05-24T08:00:00.000Z", endAt: "2038-05-24T12:00:00.000Z" }] });
    const validShift = await service.createShift({ storeId: malformedStoreId, rosterPeriodId: validSource.id, date: "2038-05-17",
      startAt: "2038-05-17T09:00:00.000Z", endAt: "2038-05-17T10:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id,
      assignments: [snapshot] }, "qa-account");
    await expect(service.batchUpdate(malformedStoreId,
      [{ id: validShift.id, version: validShift.version }, { id: malformedShift.id, version: malformedShift.version }],
      { publicNote: "Must not partly save" }, "qa-account", [employee]))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: validShift.id } })).toMatchObject({ version: validShift.version, publicNote: null });
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: validSource.id } })).toMatchObject({ version: 2 });
    const invalidTarget = await prisma.rosterPeriod.create({ data: { storeId: malformedStoreId, startDate: new Date("2038-05-24"),
      endDate: new Date("2038-05-24"), cycleType: "WEEK", createdByAccountId: "qa-account" } });
    await expect(service.repositionShift(validShift.id, { storeId: malformedStoreId, date: "2038-05-24",
      startAt: "2038-05-24T09:00:00.000Z", endAt: "2038-05-24T10:00:00.000Z", version: validShift.version,
      targetStartDate: "2038-05-24", targetEndDate: "2038-05-30" }, "qa-account", [employee]))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: validShift.id } })).version).toBe(validShift.version);
    const targetInput = { storeId: malformedStoreId, sourceDate: "2038-05-17", targetDate: "2038-05-24", activeEmployeeIds: [employee] };
    const targetPreview = await service.previewCopyDay(targetInput);
    expect(targetPreview).toMatchObject({ shiftCount: 1, readyShifts: 0, canCopy: false });
    expect(targetPreview.issues).toContainEqual(expect.objectContaining({ code: "INVALID_TIME_RANGE" }));
    await expect(service.copyDay(targetInput, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    const targetRepeat = { storeId: malformedStoreId, sourceShiftId: validShift.id, targetDates: ["2038-05-24"], activeEmployeeIds: [employee] };
    const targetRepeatPreview = await service.previewRepeatShift(targetRepeat);
    expect(targetRepeatPreview).toMatchObject({ readyShifts: 0, canCopy: false });
    await expect(service.repeatShift({ ...targetRepeat, expectedSourcePeriodVersion: targetRepeatPreview.sourcePeriodVersion,
      expectedTargetPeriodVersions: targetRepeatPreview.targetPeriodVersions }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    expect(await prisma.shift.count({ where: { storeId: malformedStoreId } })).toBe(2);
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: invalidTarget.id } })).toMatchObject({ version: 1, status: "DRAFT" });
    const repaired = await service.repositionShift(malformedShift.id, { storeId: malformedStoreId, date: "2038-05-18",
      startAt: "2038-05-18T09:00:00.000Z", endAt: "2038-05-18T10:00:00.000Z", version: malformedShift.version,
      targetStartDate: "2038-05-17", targetEndDate: "2038-05-23" }, "qa-account", [employee]);
    expect(repaired).toMatchObject({ id: malformedShift.id, rosterPeriodId: validSource.id, date: "2038-05-18" });
    expect(await prisma.shift.count({ where: { rosterPeriodId: source.id } })).toBe(0);
  });

  it("copies snapshots and wall-clock times across Sydney DST into one draft period", async () => {
    await service.saveSettings({ storeId, timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    await expect(service.createPeriod({ storeId, startDate: "2026-11-03", endDate: "2026-11-09", cycleType: "WEEK" }, "qa-account"))
      .rejects.toMatchObject({ status: 400, validation: { code: "INVALID_TIME_RANGE" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId, startDate: new Date("2026-11-03") } })).toBe(0);
    const role = await prisma.shiftRole.create({ data: { storeId, code: `copy-week-${suffix}`, nameZh: "Front", colorToken: "#334155" } });
    const source = await service.createPeriod({ storeId, startDate: "2026-09-28", endDate: "2026-10-04", cycleType: "WEEK" }, "qa-account");
    for (const [date, startAt, endAt] of [
      ["2026-09-30", "2026-09-29T23:00:00.000Z", "2026-09-30T07:00:00.000Z"],
      ["2026-10-07", "2026-10-06T22:00:00.000Z", "2026-10-07T06:00:00.000Z"],
    ]) await service.replaceAvailability({ storeId, employeeId, dates: [date], entries: [{ date, status: "AVAILABLE", startAt, endAt }] });
    const original = await service.createShift({ storeId, rosterPeriodId: source.id, date: "2026-09-30", startAt: "2026-09-29T23:00:00.000Z", endAt: "2026-09-30T07:00:00.000Z", breakMinutes: 30, shiftRoleId: role.id, publicNote: "customer", internalNote: "manager", assignments: [{ employeeId, employeeNameSnapshot: "Original Name", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime", officialScoreSnapshot: 82, tierSnapshot: "T2", officialScoreRoundId: "closed-round", officialScoreClosedAt: "2026-09-01T00:00:00.000Z" }] }, "qa-account");
    await prisma.shiftRole.update({ where: { id: role.id }, data: { colorToken: "#047857" } });
    const input = { storeId, sourcePeriodId: source.id, targetStartDate: "2026-10-05", activeEmployeeIds: [employeeId] };
    const unverified = { ...input, formalRoleIds: [] };
    expect((await service.previewCopyPeriod(unverified)).issues).toContainEqual(expect.objectContaining({ code: "UNVERIFIED_SHIFT_ROLE", shiftId: original.id }));
    await expect(service.copyPeriod(unverified, "qa-account")).rejects.toMatchObject({ status: 422, validation: { code: "UNVERIFIED_SHIFT_ROLE" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId, startDate: new Date("2026-10-05") } })).toBe(0);
    const preview = await service.previewCopyPeriod(input);
    expect(preview).toMatchObject({ shiftCount: 1, readyShifts: 1, issues: [], canCopy: true });
    const currentAssignment = { employeeId, employeeNameSnapshot: "Current Name", employeeTypeSnapshot: "TRAINING", employmentTypeSnapshot: "PartTime",
      officialScoreSnapshot: 94.5, tierSnapshot: "T1", officialScoreRoundId: "new-closed-round", officialScoreClosedAt: "2026-10-01T00:00:00.000Z" };
    const target = await service.copyPeriod({ ...input, currentAssignments: [currentAssignment], formalRoleIds: [role.id], formalRoleNames: { [role.id]: "Official Front" }, expectedSourcePeriodVersion: preview.sourcePeriodVersion }, "qa-account");
    expect(target).toMatchObject({ status: "DRAFT", startDate: "2026-10-05", endDate: "2026-10-11" });
    const copied = await prisma.shift.findFirstOrThrow({ where: { rosterPeriodId: target.id }, include: { assignments: true } });
    expect(copied).toMatchObject({ breakMinutes: 30, shiftRoleId: role.id, roleNameSnapshot: "Official Front", roleColorSnapshot: "#047857", publicNote: "customer", internalNote: "manager" });
    expect(copied.startAt.toISOString()).toBe("2026-10-06T22:00:00.000Z");
    expect(copied.endAt.toISOString()).toBe("2026-10-07T06:00:00.000Z");
    expect(copied.assignments).toHaveLength(1);
    expect(copied.assignments[0]).toMatchObject({ employeeId, employeeNameSnapshot: "Current Name", employeeTypeSnapshot: "TRAINING", employmentTypeSnapshot: "PartTime", tierSnapshot: "T1", officialScoreRoundId: "new-closed-round" });
    expect(copied.assignments[0]?.officialScoreSnapshot?.toString()).toBe("94.5");
    expect(copied.assignments[0]?.officialScoreClosedAt?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(copied.id).not.toBe(original.id);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: original.id } })).roleNameSnapshot).toBe("Front");
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: original.id } })).roleColorSnapshot).toBe("#334155");
    expect((await prisma.shiftAssignment.findFirstOrThrow({ where: { shiftId: original.id } })).employeeNameSnapshot).toBe("Original Name");
    expect(await prisma.shift.count({ where: { storeId } })).toBe(2);
    const misalignedTarget = { ...input, targetStartDate: "2026-10-13" };
    const misalignedPreview = await service.previewCopyPeriod(misalignedTarget);
    expect(misalignedPreview).toMatchObject({ canCopy: false, readyShifts: 0 });
    expect(misalignedPreview.issues).toContainEqual(expect.objectContaining({ code: "INVALID_TIME_RANGE" }));
    await expect(service.copyPeriod({ ...misalignedTarget, expectedSourcePeriodVersion: misalignedPreview.sourcePeriodVersion }, "qa-account"))
      .rejects.toMatchObject({ status: 400, validation: { code: "INVALID_TIME_RANGE" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId, startDate: new Date("2026-10-13") } })).toBe(0);
    await prisma.shift.update({ where: { id: original.id }, data: { date: new Date("2026-09-27") } });
    const invalidSource = { ...input, targetStartDate: "2026-10-12" };
    const blockedPreview = await service.previewCopyPeriod(invalidSource);
    expect(blockedPreview).toMatchObject({ shiftCount: 1, readyShifts: 0, canCopy: false });
    expect(blockedPreview.issues).toContainEqual(expect.objectContaining({ code: "SHIFT_PERIOD_MISMATCH", shiftId: original.id }));
    await expect(service.copyPeriod(invalidSource, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "SHIFT_PERIOD_MISMATCH", shiftId: original.id } });
    expect(await prisma.rosterPeriod.count({ where: { storeId, startDate: new Date("2026-10-12") } })).toBe(0);
    await prisma.shift.update({ where: { id: original.id }, data: { date: new Date("2026-09-30") } });
  });
});
