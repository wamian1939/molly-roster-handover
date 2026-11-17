import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("atomic Copy Day", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `copy-day-${suffix}`;
  const dstStoreId = `copy-day-dst-${suffix}`;
  const fallbackStoreId = `copy-day-fallback-${suffix}`;
  const batchStoreId = `copy-day-batch-${suffix}`;
  const integrityStoreId = `copy-day-integrity-${suffix}`;
  const employeeId = `copy-day-employee-${suffix}`;
  let roleId = "";
  let dstRoleId = "";
  let sourcePeriodId = "";

  afterAll(async () => {
    const storeScope = { in: [storeId, dstStoreId, fallbackStoreId, batchStoreId, integrityStoreId] };
    await prisma.rosterPeriod.deleteMany({ where: { storeId: storeScope } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId: storeScope } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId: storeScope } });
    await prisma.shiftRole.deleteMany({ where: { storeId: storeScope } });
    await prisma.$disconnect();
  });

  it("previews, atomically copies into a draft, and preserves shift details", async () => {
    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId, code: `copy-day-${suffix}`, nameZh: "Copy Day", colorToken: "#334155" } });
    roleId = role.id;
    const sourcePeriod = await service.createPeriod({ storeId, startDate: "2037-11-02", endDate: "2037-11-08", cycleType: "WEEK" }, "qa-account");
    sourcePeriodId = sourcePeriod.id;
    for (const date of ["2037-11-03", "2037-11-10"]) await service.replaceAvailability({ storeId, employeeId, dates: [date], entries: [{ date, status: "AVAILABLE", startAt: `${date}T09:00:00.000Z`, endAt: `${date}T17:00:00.000Z` }] });
    const shift = await service.createShift({
      storeId, rosterPeriodId: sourcePeriod.id, date: "2037-11-03", startAt: "2037-11-03T09:00:00.000Z", endAt: "2037-11-03T17:00:00.000Z",
      breakMinutes: 30, shiftRoleId: roleId, publicNote: "front", internalNote: "manager only",
      assignments: [{ employeeId, employeeNameSnapshot: "QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }],
    }, "qa-account");
    await prisma.shiftRole.update({ where: { id: roleId }, data: { colorToken: "#047857" } });
    const input = { storeId, sourceDate: "2037-11-03", targetDate: "2037-11-10", activeEmployeeIds: [employeeId] };
    const unverified = { ...input, formalRoleIds: [] };
    expect((await service.previewCopyDay(unverified)).issues).toContainEqual(expect.objectContaining({ code: "UNVERIFIED_SHIFT_ROLE", shiftId: shift.id }));
    await expect(service.copyDay(unverified, "qa-account")).rejects.toMatchObject({ status: 422, validation: { code: "UNVERIFIED_SHIFT_ROLE" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);
    expect(await service.previewCopyDay(input)).toMatchObject({ policy: "ALL_OR_NOTHING", shiftCount: 1, readyShifts: 1, availableAssignments: 1, canCopy: true });
    await expect(service.copyDay({ ...input, expectedSourcePeriodVersion: 1, expectedTargetPeriodVersion: null }, "qa-account")).rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);
    const currentAssignment = { employeeId, employeeNameSnapshot: "Current QA employee", employeeTypeSnapshot: "TRAINING", employmentTypeSnapshot: "PartTime",
      officialScoreSnapshot: 96, tierSnapshot: "T1", officialScoreRoundId: "current-closed-round", officialScoreClosedAt: "2037-11-09T00:00:00.000Z" };
    expect(await service.copyDay({ ...input, currentAssignments: [currentAssignment], formalRoleIds: [roleId], formalRoleNames: { [roleId]: "Official Copy Day" } }, "qa-account")).toMatchObject({ created: 1, period: { status: "DRAFT" } });
    const copied = await prisma.shift.findFirstOrThrow({ where: { storeId, date: new Date("2037-11-10T00:00:00.000Z") }, include: { assignments: true } });
    expect(copied).toMatchObject({ breakMinutes: 30, shiftRoleId: roleId, roleNameSnapshot: "Official Copy Day", roleColorSnapshot: "#047857", publicNote: "front", internalNote: "manager only" });
    expect(copied.startAt.toISOString()).toBe("2037-11-10T09:00:00.000Z");
    expect(copied.endAt.toISOString()).toBe("2037-11-10T17:00:00.000Z");
    expect(copied.assignments.map((assignment) => assignment.employeeId)).toEqual([employeeId]);
    expect(copied.assignments[0]).toMatchObject({ employeeNameSnapshot: "Current QA employee", employeeTypeSnapshot: "TRAINING", employmentTypeSnapshot: "PartTime", tierSnapshot: "T1", officialScoreRoundId: "current-closed-round" });
    expect(copied.assignments[0]?.officialScoreSnapshot?.toString()).toBe("96");
    expect(copied.assignments[0]?.officialScoreClosedAt?.toISOString()).toBe("2037-11-09T00:00:00.000Z");
    expect(await prisma.shift.findUnique({ where: { id: shift.id } })).not.toBeNull();
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).roleNameSnapshot).toBe("Copy Day");
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).roleColorSnapshot).toBe("#334155");
    const repeatInput = { storeId, sourceShiftId: shift.id, targetDates: ["2037-11-17"], activeEmployeeIds: [employeeId], formalRoleIds: [] };
    const repeatPreview = await service.previewRepeatShift(repeatInput);
    expect(repeatPreview.issues).toContainEqual(expect.objectContaining({ code: "UNVERIFIED_SHIFT_ROLE", shiftId: shift.id }));
    await expect(service.repeatShift({ ...repeatInput, expectedSourcePeriodVersion: repeatPreview.sourcePeriodVersion,
      expectedTargetPeriodVersions: repeatPreview.targetPeriodVersions }, "qa-account"))
      .rejects.toMatchObject({ status: 422, validation: { code: "UNVERIFIED_SHIFT_ROLE" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(2);
    await expect(service.copyDay({ ...input, expectedTargetPeriodVersion: 1 }, "qa-account")).rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
    expect(await prisma.shift.count({ where: { storeId } })).toBe(2);
  });

  it("blocks unavailable and overlapping copies without partial writes", async () => {
    const unavailable = { storeId, sourceDate: "2037-11-03", targetDate: "2037-11-17", activeEmployeeIds: [employeeId] };
    const preview = await service.previewCopyDay(unavailable);
    expect(preview.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "EMPLOYEE_UNAVAILABLE", employeeId })]));
    await expect(service.copyDay(unavailable, "qa-account")).rejects.toMatchObject({ validation: { code: "EMPLOYEE_UNAVAILABLE", employeeId } });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(2);

    const overlap = { storeId, sourceDate: "2037-11-03", targetDate: "2037-11-10", activeEmployeeIds: [employeeId] };
    expect((await service.previewCopyDay(overlap)).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "SHIFT_OVERLAP", employeeId })]));
    await expect(service.copyDay(overlap, "qa-account")).rejects.toMatchObject({ validation: { code: "SHIFT_OVERLAP", employeeId } });
    expect(await prisma.shift.count({ where: { storeId } })).toBe(2);
    expect(sourcePeriodId).toBeTruthy();
  });

  it("rejects impossible target dates without normalizing them or writing a period", async () => {
    const invalid = { storeId, sourceDate: "2037-11-03", targetDate: "2037-11-31", activeEmployeeIds: [employeeId] };
    const before = await prisma.rosterPeriod.count({ where: { storeId } });
    await expect(service.previewCopyDay(invalid)).rejects.toMatchObject({ status: 400 });
    await expect(service.copyDay(invalid, "qa-account")).rejects.toMatchObject({ status: 400 });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(before);
    expect(await prisma.shift.count({ where: { storeId } })).toBe(2);
  });

  it("preserves Sydney local clock time across the DST change", async () => {
    await service.saveSettings({ storeId: dstStoreId, timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    dstRoleId = (await prisma.shiftRole.create({ data: { storeId: dstStoreId, code: `copy-day-dst-${suffix}`, nameZh: "DST Copy Day", colorToken: "#334155" } })).id;
    const sourcePeriod = await service.createPeriod({ storeId: dstStoreId, startDate: "2026-09-28", endDate: "2026-10-04", cycleType: "WEEK" }, "qa-account");
    for (const [date, startAt, endAt] of [
      ["2026-09-30", "2026-09-29T23:00:00.000Z", "2026-09-30T07:00:00.000Z"],
      ["2026-10-07", "2026-10-06T22:00:00.000Z", "2026-10-07T06:00:00.000Z"],
    ]) await service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: [date], entries: [{ date, status: "AVAILABLE", startAt, endAt }] });
    await service.createShift({
      storeId: dstStoreId, rosterPeriodId: sourcePeriod.id, date: "2026-09-30", startAt: "2026-09-29T23:00:00.000Z", endAt: "2026-09-30T07:00:00.000Z",
      breakMinutes: 30, shiftRoleId: dstRoleId,
      assignments: [{ employeeId, employeeNameSnapshot: "QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }],
    }, "qa-account");
    const input = { storeId: dstStoreId, sourceDate: "2026-09-30", targetDate: "2026-10-07", activeEmployeeIds: [employeeId] };
    expect((await service.previewCopyDay(input)).canCopy).toBe(true);
    await service.copyDay(input, "qa-account");
    const copied = await prisma.shift.findFirstOrThrow({ where: { storeId: dstStoreId, date: new Date("2026-10-07T00:00:00.000Z") } });
    expect(copied.startAt.toISOString()).toBe("2026-10-06T22:00:00.000Z");
    expect(copied.endAt.toISOString()).toBe("2026-10-07T06:00:00.000Z");
  });

  it("copies both repeated clock occurrences to another fall-back day and blocks a normal-day zero-duration copy", async () => {
    await service.saveSettings({ storeId: fallbackStoreId, timezone: "Australia/Sydney", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK",
      weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId: fallbackStoreId, code: `fallback-${suffix}`, nameZh: "Fallback Copy", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId: fallbackStoreId, startDate: "2026-03-30", endDate: "2026-04-05", cycleType: "WEEK" }, "qa-account");
    const employee = `fallback-copy-${suffix}`;
    await service.replaceAvailability({ storeId: fallbackStoreId, employeeId: employee, dates: ["2026-04-05"], entries: [
      { date: "2026-04-05", status: "AVAILABLE", startAt: "2026-04-04T14:00:00.000Z", endAt: "2026-04-04T18:00:00.000Z" },
    ] });
    await service.replaceAvailability({ storeId: fallbackStoreId, employeeId: employee, dates: ["2027-04-04"], entries: [
      { date: "2027-04-04", status: "AVAILABLE", startAt: "2027-04-03T14:00:00.000Z", endAt: "2027-04-03T18:00:00.000Z" },
    ] });
    await service.createShift({ storeId: fallbackStoreId, rosterPeriodId: period.id, date: "2026-04-05",
      startAt: "2026-04-04T15:30:00.000Z", endAt: "2026-04-04T16:30:00.000Z", breakMinutes: 0, shiftRoleId: role.id,
      assignments: [{ employeeId: employee, employeeNameSnapshot: "Fallback employee", employeeTypeSnapshot: "REGULAR",
        employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] }, "qa-account");
    const input = { storeId: fallbackStoreId, sourceDate: "2026-04-05", targetDate: "2027-04-04", activeEmployeeIds: [employee] };
    expect(await service.previewCopyDay(input)).toMatchObject({ canCopy: true, readyShifts: 1 });
    expect(await service.copyDay(input, "qa-account")).toMatchObject({ created: 1 });
    const copied = await prisma.shift.findFirstOrThrow({ where: { storeId: fallbackStoreId, date: new Date("2027-04-04") } });
    expect(copied.startAt.toISOString()).toBe("2027-04-03T15:30:00.000Z");
    expect(copied.endAt.toISOString()).toBe("2027-04-03T16:30:00.000Z");
    const normalDay = { ...input, targetDate: "2026-04-12" };
    expect((await service.previewCopyDay(normalDay)).issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INVALID_TIME_RANGE" })]));
    await expect(service.copyDay(normalDay, "qa-account")).rejects.toMatchObject({ validation: { code: "INVALID_TIME_RANGE" } });
    expect(await prisma.rosterPeriod.count({ where: { storeId: fallbackStoreId } })).toBe(2);
  });

  it("previews and atomically repeats one shift on selected dates", async () => {
    const source = await prisma.shift.findFirstOrThrow({ where: { storeId: dstStoreId, date: new Date("2026-09-30T00:00:00.000Z") } });
    const otherEmployeeId = `copy-day-other-${suffix}`;
    await service.replaceAvailability({ storeId: dstStoreId, employeeId: otherEmployeeId, dates: ["2026-09-30"], entries: [{ date: "2026-09-30", status: "AVAILABLE", startAt: "2026-09-30T01:00:00.000Z", endAt: "2026-09-30T03:00:00.000Z" }] });
    await service.createShift({ storeId: dstStoreId, rosterPeriodId: source.rosterPeriodId, date: "2026-09-30", startAt: "2026-09-30T01:00:00.000Z", endAt: "2026-09-30T03:00:00.000Z", breakMinutes: 0, shiftRoleId: dstRoleId,
      assignments: [{ employeeId: otherEmployeeId, employeeNameSnapshot: "Other QA", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] }, "qa-account");
    for (const date of ["2026-10-14", "2026-10-21"]) await service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: [date], entries: [{
      date, status: "AVAILABLE", startAt: `${date === "2026-10-14" ? "2026-10-13" : "2026-10-20"}T22:00:00.000Z`,
      endAt: `${date}T06:00:00.000Z`,
    }] });
    for (const date of ["2026-10-14", "2026-10-21"]) await service.replaceAvailability({ storeId: dstStoreId, employeeId: otherEmployeeId, dates: [date], entries: [{ date, status: "AVAILABLE", startAt: `${date}T00:00:00.000Z`, endAt: `${date}T02:00:00.000Z` }] });
    const base = { storeId: dstStoreId, sourceShiftId: source.id, activeEmployeeIds: [employeeId, otherEmployeeId] };
    const blockedDates = ["2026-10-14", "2026-10-21", "2026-10-28"];
    const blocked = await service.previewRepeatShift({ ...base, targetDates: blockedDates });
    expect(blocked).toMatchObject({ shiftCount: 3, readyShifts: 2, canCopy: false });
    expect(blocked.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "EMPLOYEE_UNAVAILABLE", shiftDate: "2026-10-28", employeeId })]));
    await expect(service.repeatShift({ ...base, targetDates: blockedDates, expectedSourcePeriodVersion: blocked.sourcePeriodVersion, expectedTargetPeriodVersions: blocked.targetPeriodVersions }, "qa-account")).rejects.toMatchObject({ validation: { code: "EMPLOYEE_UNAVAILABLE" } });
    expect(await prisma.shift.count({ where: { storeId: dstStoreId, date: { in: [new Date("2026-10-14T00:00:00.000Z"), new Date("2026-10-21T00:00:00.000Z")] } } })).toBe(0);

    const targetDates = ["2026-10-14", "2026-10-21"];
    const preview = await service.previewRepeatShift({ ...base, targetDates });
    expect(preview).toMatchObject({ shiftCount: 2, readyShifts: 2, canCopy: true });
    await expect(service.repeatShift({ ...base, targetDates, expectedSourcePeriodVersion: 1, expectedTargetPeriodVersions: preview.targetPeriodVersions }, "qa-account")).rejects.toMatchObject({ validation: { code: "STALE_VERSION" } });
    const currentAssignment = { employeeId, employeeNameSnapshot: "Current repeat employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "FullTime",
      officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    await prisma.shiftRole.update({ where: { id: dstRoleId }, data: { colorToken: "#047857" } });
    expect(await service.repeatShift({ ...base, targetDates, currentAssignments: [currentAssignment], formalRoleIds: [dstRoleId], formalRoleNames: { [dstRoleId]: "Official DST Role" }, expectedSourcePeriodVersion: preview.sourcePeriodVersion, expectedTargetPeriodVersions: preview.targetPeriodVersions }, "qa-account")).toEqual({ created: 2 });
    const repeated = await prisma.shift.findMany({ where: { storeId: dstStoreId, date: { in: targetDates.map((date) => new Date(`${date}T00:00:00.000Z`)) } }, orderBy: { date: "asc" }, include: { assignments: true } });
    expect(repeated.map((shift) => shift.startAt.toISOString())).toEqual(["2026-10-13T22:00:00.000Z", "2026-10-20T22:00:00.000Z"]);
    expect(repeated.map((shift) => shift.roleNameSnapshot)).toEqual(["Official DST Role", "Official DST Role"]);
    expect(repeated.map((shift) => shift.roleColorSnapshot)).toEqual(["#047857", "#047857"]);
    expect(repeated.map((shift) => shift.assignments[0]?.employeeNameSnapshot)).toEqual(["Current repeat employee", "Current repeat employee"]);
    expect(repeated.every((shift) => shift.assignments[0]?.officialScoreSnapshot === null)).toBe(true);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: source.id } })).roleNameSnapshot).toBe("DST Copy Day");
  });

  it("copies shifts and assignments across a 500-row write boundary", async () => {
    await service.saveSettings({ storeId: batchStoreId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId: batchStoreId, code: `copy-day-batch-${suffix}`, nameZh: "Batch Copy", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId: batchStoreId, startDate: "2037-11-02", endDate: "2037-11-08", cycleType: "WEEK" }, "qa-account");
    const employeeIds = Array.from({ length: 501 }, (_, index) => `copy-day-batch-employee-${suffix}-${index}`);
    const shiftIds = employeeIds.map((_, index) => `copy-day-batch-shift-${suffix}-${index}`);
    await prisma.shift.createMany({ data: shiftIds.map((id) => ({
      id, rosterPeriodId: period.id, storeId: batchStoreId, date: new Date("2037-11-03"),
      startAt: new Date("2037-11-03T09:00:00.000Z"), endAt: new Date("2037-11-03T13:00:00.000Z"),
      breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-account", updatedByAccountId: "qa-account",
    })) });
    await prisma.shiftAssignment.createMany({ data: employeeIds.map((employeeId, index) => ({
      shiftId: shiftIds[index]!, employeeId, employeeNameSnapshot: `QA ${index}`,
      employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null,
    })) });
    await prisma.employeeAvailability.createMany({ data: employeeIds.map((employeeId) => ({
      storeId: batchStoreId, employeeId, date: new Date("2037-11-10"), status: "AVAILABLE",
      startAt: new Date("2037-11-10T08:00:00.000Z"), endAt: new Date("2037-11-10T14:00:00.000Z"),
    })) });
    const input = { storeId: batchStoreId, sourceDate: "2037-11-03", targetDate: "2037-11-10", activeEmployeeIds: employeeIds };
    expect(await service.previewCopyDay(input)).toMatchObject({ shiftCount: 501, readyShifts: 501, canCopy: true });
    expect(await service.copyDay({ ...input, expectedSourcePeriodVersion: period.version, expectedTargetPeriodVersion: null }, "qa-account")).toMatchObject({ created: 501, period: { status: "DRAFT" } });
    const target = await prisma.shift.findMany({ where: { storeId: batchStoreId, date: new Date("2037-11-10") }, include: { assignments: true } });
    expect(target).toHaveLength(501);
    expect(target.flatMap((shift) => shift.assignments.map((assignment) => assignment.employeeId)).sort()).toEqual([...employeeIds].sort());
  });

  it("blocks Day and Week copies when the source shift role has been deactivated", async () => {
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-11-24"], entries: [{ date: "2037-11-24", status: "AVAILABLE", startAt: "2037-11-24T09:00:00.000Z", endAt: "2037-11-24T17:00:00.000Z" }] });
    await prisma.shiftRole.update({ where: { id: roleId }, data: { isActive: false } });
    try {
      const day = { storeId, sourceDate: "2037-11-03", targetDate: "2037-11-24", activeEmployeeIds: [employeeId] };
      const dayPreview = await service.previewCopyDay(day);
      expect(dayPreview.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INACTIVE_SHIFT_ROLE" })]));
      await expect(service.copyDay(day, "qa-account")).rejects.toMatchObject({ validation: { code: "INACTIVE_SHIFT_ROLE" } });
      const sourceShift = await prisma.shift.findFirstOrThrow({ where: { storeId, date: new Date("2037-11-03") } });
      const repeat = { storeId, sourceShiftId: sourceShift.id, targetDates: ["2037-11-24"], activeEmployeeIds: [employeeId] };
      const repeatPreview = await service.previewRepeatShift(repeat);
      expect(repeatPreview.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INACTIVE_SHIFT_ROLE", shiftId: sourceShift.id })]));
      await expect(service.repeatShift({ ...repeat, expectedSourcePeriodVersion: repeatPreview.sourcePeriodVersion, expectedTargetPeriodVersions: repeatPreview.targetPeriodVersions }, "qa-account"))
        .rejects.toMatchObject({ validation: { code: "INACTIVE_SHIFT_ROLE" } });
      const week = { storeId, sourcePeriodId, targetStartDate: "2037-11-23", activeEmployeeIds: [employeeId] };
      const weekPreview = await service.previewCopyPeriod(week);
      expect(weekPreview.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "INACTIVE_SHIFT_ROLE" })]));
      await expect(service.copyPeriod(week, "qa-account")).rejects.toMatchObject({ validation: { code: "INACTIVE_SHIFT_ROLE" } });
      expect(await prisma.shift.count({ where: { storeId, date: new Date("2037-11-24") } })).toBe(0);
      expect(await prisma.rosterPeriod.count({ where: { storeId, startDate: new Date("2037-11-23") } })).toBe(0);
    } finally {
      await prisma.shiftRole.update({ where: { id: roleId }, data: { isActive: true } });
    }
  });

  it("rejects Copy Day and Repeat when a source Shift is dated outside its linked period", async () => {
    await service.saveSettings({ storeId: integrityStoreId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK",
      weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId: integrityStoreId, code: `integrity-${suffix}`, nameZh: "QA", colorToken: "#334155" } });
    await service.createPeriod({ storeId: integrityStoreId, startDate: "2037-11-02", endDate: "2037-11-08", cycleType: "WEEK" }, "qa-account");
    const linkedPeriod = await service.createPeriod({ storeId: integrityStoreId, startDate: "2037-11-09", endDate: "2037-11-15", cycleType: "WEEK" }, "qa-account");
    const misplaced = await prisma.shift.create({ data: { rosterPeriodId: linkedPeriod.id, storeId: integrityStoreId,
      date: new Date("2037-11-03"), startAt: new Date("2037-11-03T09:00:00.000Z"), endAt: new Date("2037-11-03T12:00:00.000Z"),
      breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-account", updatedByAccountId: "qa-account",
      assignments: { create: { employeeId, employeeNameSnapshot: "QA employee", employeeTypeSnapshot: "REGULAR" } } } });
    await prisma.employeeAvailability.create({ data: { storeId: integrityStoreId, employeeId, date: new Date("2037-11-03"),
      status: "AVAILABLE", startAt: new Date("2037-11-03T09:00:00.000Z"), endAt: new Date("2037-11-03T12:00:00.000Z") } });
    for (const date of ["2037-11-17", "2037-11-24"]) await service.replaceAvailability({ storeId: integrityStoreId, employeeId,
      dates: [date], entries: [{ date, status: "AVAILABLE", startAt: `${date}T09:00:00.000Z`, endAt: `${date}T12:00:00.000Z` }] });
    const day = { storeId: integrityStoreId, sourceDate: "2037-11-03", targetDate: "2037-11-17", activeEmployeeIds: [employeeId] };
    const dayPreview = await service.previewCopyDay(day);
    expect(dayPreview).toMatchObject({ shiftCount: 1, readyShifts: 0, canCopy: false });
    expect(dayPreview.issues).toContainEqual(expect.objectContaining({ code: "SHIFT_PERIOD_MISMATCH", shiftId: misplaced.id }));
    await expect(service.copyDay({ ...day, expectedSourcePeriodVersion: dayPreview.sourcePeriodVersion, expectedTargetPeriodVersion: null }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "SHIFT_PERIOD_MISMATCH", shiftId: misplaced.id } });
    const repeat = { storeId: integrityStoreId, sourceShiftId: misplaced.id, targetDates: ["2037-11-24"], activeEmployeeIds: [employeeId] };
    const repeatPreview = await service.previewRepeatShift(repeat);
    expect(repeatPreview).toMatchObject({ shiftCount: 1, readyShifts: 0, canCopy: false });
    expect(repeatPreview.issues).toContainEqual(expect.objectContaining({ code: "SHIFT_PERIOD_MISMATCH", shiftId: misplaced.id }));
    await expect(service.repeatShift({ ...repeat, expectedSourcePeriodVersion: repeatPreview.sourcePeriodVersion,
      expectedTargetPeriodVersions: repeatPreview.targetPeriodVersions }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "SHIFT_PERIOD_MISMATCH", shiftId: misplaced.id } });
    await expect(service.batchUpdate(integrityStoreId, [{ id: misplaced.id, version: 1 }], { publicNote: "Must not save" }, "qa-account", [employeeId]))
      .rejects.toMatchObject({ status: 409, validation: { code: "SHIFT_PERIOD_MISMATCH", shiftId: misplaced.id } });
    expect(await prisma.rosterPeriod.count({ where: { storeId: integrityStoreId } })).toBe(2);
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: misplaced.id } })).toMatchObject({ version: 1, rosterPeriodId: linkedPeriod.id, publicNote: null });
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: linkedPeriod.id } })).toMatchObject({ version: 1 });
  });
});
