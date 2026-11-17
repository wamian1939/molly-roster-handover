import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService, type AssignmentSnapshot } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("atomic draft-period commit", () => {
  const service = new RosterService(prisma);
  const storeId = `draft-commit-qa-${randomUUID()}`;
  const employeeId = `employee-${randomUUID()}`;
  const date = "2039-04-06";
  const assignment: AssignmentSnapshot = {
    employeeId, employeeNameSnapshot: "Disposable QA", employeeTypeSnapshot: "REGULAR",
    employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null,
    officialScoreRoundId: null, officialScoreClosedAt: null,
  };
  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("swaps two shifts and creates a third in one transaction, then rolls back a stale batch", async () => {
    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId, code: `qa-${randomUUID()}`, nameZh: "QA", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId, startDate: "2039-04-04", endDate: "2039-04-10", cycleType: "WEEK" }, "qa-account");
    await service.replaceAvailability({ storeId, employeeId, dates: [date], entries: [{ date, status: "AVAILABLE", startAt: "2039-04-06T08:00:00.000Z", endAt: "2039-04-06T18:00:00.000Z" }] });
    const value = (startAt: string, endAt: string) => ({ date, startAt, endAt, breakMinutes: 0, shiftRoleId: role.id, assignments: [assignment] });
    const first = await service.createShift({ storeId, rosterPeriodId: period.id, ...value("2039-04-06T09:00:00.000Z", "2039-04-06T10:00:00.000Z") }, "qa-account");
    const second = await service.createShift({ storeId, rosterPeriodId: period.id, ...value("2039-04-06T10:00:00.000Z", "2039-04-06T11:00:00.000Z") }, "qa-account");
    const createdId = randomUUID();
    const result = await service.commitDraftPeriod(storeId, period.id, [
      { kind: "update", shiftId: first.id, baseVersion: first.version, value: value("2039-04-06T10:00:00.000Z", "2039-04-06T11:00:00.000Z") },
      { kind: "update", shiftId: second.id, baseVersion: second.version, value: value("2039-04-06T09:00:00.000Z", "2039-04-06T10:00:00.000Z") },
      { kind: "create", clientShiftId: createdId, value: value("2039-04-06T11:00:00.000Z", "2039-04-06T12:00:00.000Z") },
    ], "qa-account");
    expect(result.saved.map((shift) => shift.id)).toEqual([first.id, second.id, createdId]);
    expect(await prisma.shift.count({ where: { storeId } })).toBe(3);
    const rejectedId = randomUUID();
    await expect(service.commitDraftPeriod(storeId, period.id, [
      { kind: "delete", shiftId: first.id, baseVersion: first.version },
      { kind: "create", clientShiftId: rejectedId, value: value("2039-04-06T12:00:00.000Z", "2039-04-06T13:00:00.000Z") },
    ], "qa-account")).rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
    expect(await prisma.shift.count({ where: { storeId } })).toBe(3);
    expect(await prisma.shift.count({ where: { id: rejectedId } })).toBe(0);

    const secondEmployeeId = `employee-${randomUUID()}`;
    const secondAssignment = { ...assignment, employeeId: secondEmployeeId, employeeNameSnapshot: "Second disposable QA" };
    await service.replaceAvailability({ storeId, employeeId: secondEmployeeId, dates: [date], entries: [{ date, status: "AVAILABLE", startAt: "2039-04-06T08:00:00.000Z", endAt: "2039-04-06T18:00:00.000Z" }] });
    const sameTime = { date, startAt: "2039-04-06T13:00:00.000Z", endAt: "2039-04-06T14:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id };
    const batchOne = await service.createShift({ storeId, rosterPeriodId: period.id, ...sameTime, assignments: [assignment] }, "qa-account");
    const batchTwo = await service.createShift({ storeId, rosterPeriodId: period.id, ...sameTime, assignments: [secondAssignment] }, "qa-account");
    const merged = await service.commitDraftPeriod(storeId, period.id, [
      { kind: "update", shiftId: batchOne.id, baseVersion: batchOne.version, value: { ...sameTime, assignments: [assignment, secondAssignment] } },
      { kind: "delete", shiftId: batchTwo.id, baseVersion: batchTwo.version },
    ], "qa-account");
    expect(merged.saved).toHaveLength(1);
    expect(merged.deletedIds).toEqual([batchTwo.id]);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: batchOne.id }, include: { assignments: true } })).assignments.map((item) => item.employeeId).sort()).toEqual([employeeId, secondEmployeeId].sort());
    expect(await prisma.shift.findUnique({ where: { id: batchTwo.id } })).toBeNull();
  });
});
