import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("overnight roster integrity", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `overnight-${suffix}`;
  const dstStoreId = `overnight-dst-${suffix}`;
  const earlyStoreId = `overnight-early-${suffix}`;
  const unsetStoreId = `overnight-unset-${suffix}`;
  const legacyStoreId = `overnight-legacy-${suffix}`;
  const employeeId = `employee-${suffix}`;
  const earlyEmployeeId = `early-employee-${suffix}`;
  const unsetEmployeeId = `unset-employee-${suffix}`;

  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId: dstStoreId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId: dstStoreId } });
    await prisma.rosterPublication.deleteMany({ where: { rosterPeriod: { storeId: earlyStoreId } } });
    await prisma.rosterPeriod.deleteMany({ where: { storeId: earlyStoreId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId: earlyStoreId } });
    await prisma.shiftRole.deleteMany({ where: { storeId: earlyStoreId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId: earlyStoreId } });
    await prisma.rosterPeriod.deleteMany({ where: { storeId: unsetStoreId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId: unsetStoreId } });
    await prisma.shiftRole.deleteMany({ where: { storeId: unsetStoreId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId: unsetStoreId } });
    await prisma.rosterPeriod.deleteMany({ where: { storeId: legacyStoreId } });
    await prisma.shiftRole.deleteMany({ where: { storeId: legacyStoreId } });
    await prisma.$disconnect();
  });

  it("requires both dates of availability, detects next-day overlap, and retains exact timestamps", async () => {
    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "23:00", closingTime: "03:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId, code: `qa-${suffix}`, nameZh: "QA", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId, startDate: "2037-10-05", endDate: "2037-10-11", cycleType: "WEEK" }, "qa-account");
    const assignment = { employeeId, employeeNameSnapshot: "QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    const shift = { storeId, rosterPeriodId: period.id, date: "2037-10-07", startAt: "2037-10-07T23:00:00.000Z", endAt: "2037-10-08T02:00:00.000Z", breakMinutes: 30, shiftRoleId: role.id, assignments: [assignment] };
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-07"], entries: [{ date: "2037-10-07", status: "AVAILABLE", startAt: shift.startAt, endAt: "2037-10-08T00:00:00.000Z" }] });
    await expect(service.createShift(shift, "qa-account")).rejects.toMatchObject({ status: 422 });
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-08"], entries: [{ date: "2037-10-08", status: "AVAILABLE", startAt: "2037-10-08T00:00:00.000Z", endAt: "2037-10-08T03:00:00.000Z" }] });
    const created = await service.createShift(shift, "qa-account");
    expect(created.endAt).toBe(shift.endAt);
    await expect(service.batchUpdate(storeId, [{ id: created.id, version: created.version }], { publicNote: "Must not save" }, "qa-account", [])).rejects.toMatchObject({ status: 422, validation: { code: "ARCHIVED_EMPLOYEE", employeeId } });
    const afterRejectedBatch = await prisma.shift.findUniqueOrThrow({ where: { id: created.id } });
    expect(afterRejectedBatch.version).toBe(created.version);
    expect(afterRejectedBatch.publicNote).toBeNull();
    const target = { storeId, date: shift.date, startAt: "2037-10-07T23:30:00.000Z", endAt: "2037-10-08T02:30:00.000Z", targetStartDate: "2037-10-05", targetEndDate: "2037-10-11", version: created.version };
    await expect(service.repositionShift(created.id, target, "qa-account", [])).rejects.toMatchObject({ status: 422, validation: { code: "ARCHIVED_EMPLOYEE", employeeId } });
    const unchanged = await prisma.shift.findUniqueOrThrow({ where: { id: created.id } });
    expect(unchanged.version).toBe(created.version);
    expect(unchanged.startAt.toISOString()).toBe(created.startAt);
    const moved = await service.repositionShift(created.id, target, "qa-account", [employeeId]);
    expect(new Date(moved.endAt).getTime() - new Date(moved.startAt).getTime()).toBe(3 * 3_600_000);
    const resized = await service.repositionShift(created.id, { ...target, endAt: "2037-10-08T03:00:00.000Z", version: moved.version }, "qa-account", [employeeId]);
    expect(resized.endAt).toBe("2037-10-08T03:00:00.000Z");
    await expect(service.repositionShift(created.id, { ...target, startAt: "2037-10-07T22:30:00.000Z", version: resized.version }, "qa-account", [employeeId])).rejects.toMatchObject({ status: 400 });
    await expect(service.repositionShift(created.id, { ...target, date: "2037-10-14", startAt: "2037-10-14T23:30:00.000Z", endAt: "2037-10-15T02:30:00.000Z", targetStartDate: "2037-10-12", targetEndDate: "2037-10-18", version: resized.version }, "qa-account", [employeeId])).rejects.toMatchObject({ status: 422 });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);
    const calendar = await service.calendar(storeId, "2037-10-07", "2037-10-08");
    expect(calendar.shifts).toHaveLength(1);
    const nextDayOnly = await service.calendar(storeId, "2037-10-08", "2037-10-08");
    expect(nextDayOnly.shifts.map((item) => item.id)).toContain(created.id);
    await expect(service.createShift({ ...shift, startAt: "2037-10-07T23:30:00.000Z", endAt: "2037-10-08T02:30:00.000Z" }, "qa-account")).rejects.toMatchObject({ status: 409 });
    await expect(service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-08"], entries: [] })).rejects.toMatchObject({ status: 422 });

    await service.createPeriod({ storeId, startDate: "2037-10-12", endDate: "2037-10-18", cycleType: "WEEK" }, "qa-account");
    const boundaryShift = { ...shift, date: "2037-10-11", startAt: "2037-10-11T23:00:00.000Z", endAt: "2037-10-12T02:00:00.000Z" };
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-10-11", "2037-10-12"], entries: [
      { date: "2037-10-11", status: "AVAILABLE", startAt: boundaryShift.startAt, endAt: "2037-10-12T00:00:00.000Z" },
      { date: "2037-10-12", status: "AVAILABLE", startAt: "2037-10-12T00:00:00.000Z", endAt: boundaryShift.endAt },
    ] });
    const boundaryCreated = await service.createShift(boundaryShift, "qa-account");
    const followingWeek = await service.calendar(storeId, "2037-10-12", "2037-10-18");
    expect(followingWeek.shifts.map((item) => item.id)).toContain(boundaryCreated.id);
    expect(followingWeek.periods.map((item) => item.id)).toContain(period.id);
  });

  it("saves one overnight availability row and rejects cross-day overlap atomically", async () => {
    const overnight = { date: "2037-11-01", status: "AVAILABLE" as const, startAt: "2037-11-01T22:00:00.000Z", endAt: "2037-11-02T02:00:00.000Z" };
    await expect(service.replaceAvailability({ storeId, employeeId, dates: [overnight.date], entries: [
      { ...overnight, endAt: "2037-11-03T02:00:00.000Z" },
    ] })).rejects.toMatchObject({ status: 400, validation: { code: "INVALID_AVAILABILITY_RANGE" } });
    await expect(service.replaceAvailability({ storeId, employeeId, dates: [overnight.date], entries: [
      { ...overnight, endAt: "2037-11-02T23:00:00.000Z" },
    ] })).rejects.toMatchObject({ status: 400, validation: { code: "INVALID_AVAILABILITY_RANGE" } });
    expect(await prisma.employeeAvailability.count({ where: { storeId, employeeId, date: new Date(overnight.date) } })).toBe(0);
    await service.replaceAvailability({ storeId, employeeId, dates: [overnight.date], entries: [overnight] });
    await expect(service.replaceAvailability({ storeId, employeeId, dates: ["2037-11-02"], entries: [
      { date: "2037-11-02", status: "AVAILABLE", startAt: "2037-11-02T01:00:00.000Z", endAt: "2037-11-02T03:00:00.000Z" },
    ] })).rejects.toMatchObject({ status: 400 });
    expect(await prisma.employeeAvailability.count({ where: { storeId, employeeId, date: new Date("2037-11-02") } })).toBe(0);
    await expect(service.replaceAvailability({ storeId, employeeId, dates: ["2037-11-01", "2037-11-02"], entries: [overnight,
      { date: "2037-11-02", status: "AVAILABLE", startAt: "2037-11-02T01:00:00.000Z", endAt: "2037-11-02T03:00:00.000Z" },
    ] })).rejects.toMatchObject({ status: 400 });
    expect(await prisma.employeeAvailability.count({ where: { storeId, employeeId, date: new Date("2037-11-01") } })).toBe(1);
    await service.replaceAvailability({ storeId, employeeId, dates: ["2037-11-02"], entries: [
      { date: "2037-11-02", status: "AVAILABLE", startAt: "2037-11-02T02:00:00.000Z", endAt: "2037-11-02T04:00:00.000Z" },
    ] });
    expect(await prisma.employeeAvailability.count({ where: { storeId, employeeId, date: new Date("2037-11-02") } })).toBe(1);
  });

  it("accepts previous-day overnight availability for an early shift and protects it from deletion", async () => {
    await service.saveSettings({ storeId: earlyStoreId, timezone: "UTC", openingTime: "18:00", closingTime: "03:00", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId: earlyStoreId, code: `early-${suffix}`, nameZh: "Early QA", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId: earlyStoreId, startDate: "2037-10-05", endDate: "2037-10-11", cycleType: "WEEK" }, "qa-account");
    const assignment = { employeeId: earlyEmployeeId, employeeNameSnapshot: "QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    await service.replaceAvailability({ storeId: earlyStoreId, employeeId: earlyEmployeeId, dates: ["2037-10-07"], entries: [{ date: "2037-10-07", status: "AVAILABLE", startAt: "2037-10-07T22:00:00.000Z", endAt: "2037-10-08T03:00:00.000Z" }] });
    await expect(service.createShift({ storeId: earlyStoreId, rosterPeriodId: period.id, date: "2037-10-08", startAt: "2037-10-08T03:00:00.000Z", endAt: "2037-10-08T04:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id, assignments: [assignment] }, "qa-account"))
      .rejects.toMatchObject({ status: 400, validation: { code: "OUTSIDE_OPERATING_HOURS" } });
    const created = await service.createShift({ storeId: earlyStoreId, rosterPeriodId: period.id, date: "2037-10-08", startAt: "2037-10-08T00:00:00.000Z", endAt: "2037-10-08T02:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id, assignments: [assignment] }, "qa-account");
    expect(created.startAt).toBe("2037-10-08T00:00:00.000Z");
    const preview = await service.previewCopyDay({ storeId: earlyStoreId, sourceDate: "2037-10-08", targetDate: "2037-10-09", activeEmployeeIds: [earlyEmployeeId] });
    expect(preview.canCopy).toBe(false);
    await service.replaceAvailability({ storeId: earlyStoreId, employeeId: earlyEmployeeId, dates: ["2037-10-08"], entries: [{ date: "2037-10-08", status: "AVAILABLE", startAt: "2037-10-08T22:00:00.000Z", endAt: "2037-10-09T03:00:00.000Z" }] });
    const readyPreview = await service.previewCopyDay({ storeId: earlyStoreId, sourceDate: "2037-10-08", targetDate: "2037-10-09", activeEmployeeIds: [earlyEmployeeId] });
    expect(readyPreview.canCopy).toBe(true);
    await service.copyDay({ storeId: earlyStoreId, sourceDate: "2037-10-08", targetDate: "2037-10-09", activeEmployeeIds: [earlyEmployeeId] }, "qa-account");
    expect(await prisma.shift.count({ where: { storeId: earlyStoreId } })).toBe(2);
    await expect(service.replaceAvailability({ storeId: earlyStoreId, employeeId: earlyEmployeeId, dates: ["2037-10-07"], entries: [] })).rejects.toMatchObject({ status: 422, validation: { code: "EMPLOYEE_UNAVAILABLE" } });
    expect(await prisma.employeeAvailability.count({ where: { storeId: earlyStoreId, employeeId: earlyEmployeeId } })).toBe(2);
    const latestPeriod = await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } });
    const published = await service.publishPeriod(earlyStoreId, period.id, latestPeriod.version, { accountId: "qa-account", displayName: "QA" }, { id: earlyStoreId, name: "Early QA" }, [assignment]);
    expect(published.period.status).toBe("PUBLISHED");
  });

  it("accepts distinct fallback instants and rejects intervals longer than 24 actual hours", async () => {
    await service.saveSettings({ storeId: dstStoreId, timezone: "Australia/Sydney", openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const startAt = "2026-04-04T15:30:00.000Z"; // First 02:30, AEDT.
    const endAt = "2026-04-04T16:15:00.000Z"; // Second 02:15, AEST.
    const saved = await service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: ["2026-04-05"], entries: [
      { date: "2026-04-05", status: "AVAILABLE", startAt, endAt },
    ] });
    expect(saved[0]?.startAt).toBe(startAt);
    expect(saved[0]?.endAt).toBe(endAt);
    expect(await prisma.employeeAvailability.count({ where: { storeId: dstStoreId } })).toBe(1);
    await expect(service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: ["2026-04-05"], entries: [
      { date: "2026-04-05", status: "AVAILABLE", startAt, endAt: "2026-04-05T16:30:00.000Z" },
    ] })).rejects.toMatchObject({ status: 400, validation: { code: "INVALID_AVAILABILITY_RANGE" } });
    expect(await prisma.employeeAvailability.count({ where: { storeId: dstStoreId } })).toBe(1);
  });

  it("accepts a 23.5-hour Sydney spring-forward window even when the next-day clock is later", async () => {
    const date = "2027-10-03";
    const startAt = "2027-10-02T15:00:00.000Z"; // 01:00 AEST.
    const endAt = "2027-10-03T14:30:00.000Z"; // Next-day 01:30 AEDT.
    const saved = await service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: [date], entries: [
      { date, status: "AVAILABLE", startAt, endAt },
    ] });
    expect(saved).toMatchObject([{ date, startAt, endAt }]);
    await expect(service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: [date], entries: [
      { date, status: "AVAILABLE", startAt, endAt: "2027-10-03T15:30:00.000Z" },
    ] })).rejects.toMatchObject({ status: 400, validation: { code: "INVALID_AVAILABILITY_RANGE" } });
    expect(await prisma.employeeAvailability.count({ where: { storeId: dstStoreId, employeeId, date: new Date(date) } })).toBe(1);
  });

  it("rejects a stale whole-day Availability replacement without deleting the newer rows", async () => {
    const date = "2026-04-06";
    const first = { date, status: "AVAILABLE" as const, startAt: "2026-04-05T23:00:00.000Z", endAt: "2026-04-06T01:00:00.000Z" };
    const second = { date, status: "AVAILABLE" as const, startAt: "2026-04-06T00:00:00.000Z", endAt: "2026-04-06T02:00:00.000Z" };
    await service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: [date], entries: [first], expectedRows: [] });
    await expect(service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: [date], entries: [second], expectedRows: [] }))
      .rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
    const saved = await prisma.employeeAvailability.findMany({ where: { storeId: dstStoreId, employeeId, date: new Date(date) } });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.startAt?.toISOString()).toBe(first.startAt);
    const readSnapshot = saved.map(({ id, version }) => ({ id, version }));
    await service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: [date], entries: [second], expectedRows: readSnapshot });
    await expect(service.replaceAvailability({ storeId: dstStoreId, employeeId, dates: [date], entries: [first], expectedRows: readSnapshot }))
      .rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
    const newest = await prisma.employeeAvailability.findMany({ where: { storeId: dstStoreId, employeeId, date: new Date(date) } });
    expect(newest).toHaveLength(1);
    expect(newest[0]?.startAt?.toISOString()).toBe(second.startAt);
  });

  it("requires timezone setup, then enforces the local date and 24-hour bound", async () => {
    const role = await prisma.shiftRole.create({ data: { storeId: unsetStoreId, code: `unset-${suffix}`, nameZh: "Unset QA", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId: unsetStoreId, startDate: "2037-10-05", endDate: "2037-10-11", cycleType: "WEEK" }, "qa-account");
    const assignment = { employeeId: unsetEmployeeId, employeeNameSnapshot: "Unset QA employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    const shift = { storeId: unsetStoreId, rosterPeriodId: period.id, date: "2037-10-08", startAt: "2037-10-08T23:00:00.000Z", endAt: "2037-10-09T01:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id, assignments: [assignment] };
    await expect(service.createShift(shift, "qa-account")).rejects.toMatchObject({ status: 409 });
    await expect(service.replaceAvailability({ storeId: unsetStoreId, employeeId: unsetEmployeeId,
      dates: ["2037-10-09"], entries: [{ date: "2037-10-09", status: "AVAILABLE", startAt: shift.startAt, endAt: shift.endAt }] }))
      .rejects.toMatchObject({ status: 409 });
    expect(await prisma.shift.count({ where: { storeId: unsetStoreId } })).toBe(0);
    expect(await prisma.employeeAvailability.count({ where: { storeId: unsetStoreId } })).toBe(0);
    await service.saveSettings({ storeId: unsetStoreId, timezone: "Australia/Sydney", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    await service.replaceAvailability({ storeId: unsetStoreId, employeeId: unsetEmployeeId, dates: ["2037-10-09"], entries: [{ date: "2037-10-09", status: "AVAILABLE", startAt: shift.startAt, endAt: shift.endAt }] });
    await expect(service.createShift(shift, "qa-account")).rejects.toMatchObject({ status: 400, validation: { code: "INVALID_CROSS_DAY" } });
    await expect(service.createShift({ ...shift, date: "2037-10-09", endAt: "2037-10-10T00:00:00.000Z" }, "qa-account"))
      .rejects.toMatchObject({ status: 400, validation: { code: "INVALID_CROSS_DAY" } });
    expect(await prisma.shift.count({ where: { storeId: unsetStoreId } })).toBe(0);
    const created = await service.createShift({ ...shift, date: "2037-10-09" }, "qa-account");
    expect(created.date).toBe("2037-10-09");
    await expect(service.updateShift(created.id, { ...shift, version: created.version }, "qa-account"))
      .rejects.toMatchObject({ status: 400, validation: { code: "INVALID_CROSS_DAY" } });
    const unchanged = await prisma.shift.findUniqueOrThrow({ where: { id: created.id } });
    expect(unchanged.version).toBe(created.version);
    expect(unchanged.date.toISOString().slice(0, 10)).toBe("2037-10-09");
  });

  it("does not assign a Sydney day to an old shift when its store timezone is unknown", async () => {
    const role = await prisma.shiftRole.create({ data: { storeId: legacyStoreId,
      code: `legacy-${suffix}`, nameZh: "Legacy", colorToken: "#334155" } });
    const period = await prisma.rosterPeriod.create({ data: { storeId: legacyStoreId,
      startDate: new Date("2037-10-05"), endDate: new Date("2037-10-11"), cycleType: "WEEK",
      createdByAccountId: "qa-account" } });
    await prisma.shift.create({ data: { storeId: legacyStoreId, rosterPeriodId: period.id,
      date: new Date("2037-10-05"), startAt: new Date("2037-10-05T09:00:00.000Z"),
      endAt: new Date("2037-10-05T10:00:00.000Z"), breakMinutes: 0, shiftRoleId: role.id,
      roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-account", updatedByAccountId: "qa-account" } });
    await expect(service.calendar(legacyStoreId, "2037-10-05", "2037-10-05"))
      .rejects.toMatchObject({ status: 409 });
    await expect(service.previewCopyDay({ storeId: legacyStoreId, sourceDate: "2037-10-05",
      targetDate: "2037-10-06", activeEmployeeIds: [] })).rejects.toMatchObject({ status: 409 });
    await expect(service.copyDay({ storeId: legacyStoreId, sourceDate: "2037-10-05",
      targetDate: "2037-10-06", activeEmployeeIds: [] }, "qa-account")).rejects.toMatchObject({ status: 409 });
    await expect(service.previewCopyPeriod({ storeId: legacyStoreId, sourcePeriodId: period.id,
      targetStartDate: "2037-10-12", activeEmployeeIds: [] })).rejects.toMatchObject({ status: 409 });
    expect(await prisma.shift.count({ where: { storeId: legacyStoreId } })).toBe(1);
    expect(await prisma.rosterPeriod.count({ where: { storeId: legacyStoreId } })).toBe(1);
  });
});
