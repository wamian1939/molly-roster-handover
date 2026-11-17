import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService, type AssignmentSnapshot } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("atomic employee-row date and assignment move", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `lane-move-${suffix}`;
  const sourceEmployeeId = `lane-source-${suffix}`;
  const targetEmployeeId = `lane-target-${suffix}`;
  const accountId = "lane-qa-account";
  const snapshot = (employeeId: string, name: string): AssignmentSnapshot => ({
    employeeId, employeeNameSnapshot: name, employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null,
    officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null,
  });

  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("rolls back unavailable/conflicting targets and moves the same shift id once", async () => {
    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "08:00", closingTime: "22:00", slotIntervalMinutes: 30,
      minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId, code: `front-${suffix}`, nameZh: "Front", colorToken: "#334155" } });
    const period = await service.createPeriod({ storeId, startDate: "2037-10-05", endDate: "2037-10-11", cycleType: "WEEK" }, accountId);
    await service.replaceAvailability({ storeId, employeeId: sourceEmployeeId, dates: ["2037-10-07"], entries: [{
      date: "2037-10-07", status: "AVAILABLE", startAt: "2037-10-07T09:00:00.000Z", endAt: "2037-10-07T12:00:00.000Z",
    }] });
    const created = await service.createShift({ storeId, rosterPeriodId: period.id, date: "2037-10-07",
      startAt: "2037-10-07T09:00:00.000Z", endAt: "2037-10-07T12:00:00.000Z", breakMinutes: 0,
      shiftRoleId: role.id, assignments: [snapshot(sourceEmployeeId, "Former Alex")],
    }, accountId);
    const input = { storeId, date: "2037-10-08", startAt: "2037-10-08T09:00:00.000Z", endAt: "2037-10-08T12:00:00.000Z",
      targetStartDate: "2037-10-05", targetEndDate: "2037-10-11", version: created.version };
    const replacement = { sourceEmployeeId, target: snapshot(targetEmployeeId, "Current Blair") };
    const before = await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } });

    await service.replaceAvailability({ storeId, employeeId: targetEmployeeId, dates: ["2037-10-15"], entries: [{
      date: "2037-10-15", status: "AVAILABLE", startAt: "2037-10-15T09:00:00.000Z", endAt: "2037-10-15T13:00:00.000Z",
    }] });
    await expect(service.repositionShift(created.id, { ...input, date: "2037-10-15", startAt: "2037-10-15T09:00:00.000Z",
      endAt: "2037-10-15T12:00:00.000Z", targetStartDate: "2037-10-13", targetEndDate: "2037-10-19" },
      accountId, [targetEmployeeId], replacement)).rejects.toMatchObject({ status: 400, validation: { code: "INVALID_TIME_RANGE" } });
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(before.version);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: created.id } })).version).toBe(created.version);
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);

    await expect(service.repositionShift(created.id, input, accountId, [targetEmployeeId], replacement)).rejects.toMatchObject({
      status: 422, validation: { code: "EMPLOYEE_UNAVAILABLE", employeeId: targetEmployeeId },
    });
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(before.version);
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: created.id }, include: { assignments: true } })).assignments.map((item) => item.employeeId)).toEqual([sourceEmployeeId]);

    await service.replaceAvailability({ storeId, employeeId: targetEmployeeId, dates: ["2037-10-08"], entries: [{
      date: "2037-10-08", status: "AVAILABLE", startAt: "2037-10-08T09:00:00.000Z", endAt: "2037-10-08T13:00:00.000Z",
    }] });
    const conflict = await service.createShift({ storeId, rosterPeriodId: period.id, date: "2037-10-08",
      startAt: "2037-10-08T10:00:00.000Z", endAt: "2037-10-08T11:00:00.000Z", breakMinutes: 0,
      shiftRoleId: role.id, assignments: [snapshot(targetEmployeeId, "Current Blair")],
    }, accountId);
    const conflictPeriodVersion = (await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version;
    await expect(service.repositionShift(created.id, input, accountId, [targetEmployeeId], replacement)).rejects.toMatchObject({
      status: 409, validation: { code: "SHIFT_OVERLAP", employeeId: targetEmployeeId },
    });
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(conflictPeriodVersion);
    await service.deleteShift(conflict.id, storeId, conflict.version);

    const versionBeforeInactiveMove = (await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version;
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: false } });
    await expect(service.repositionShift(created.id, input, accountId, [targetEmployeeId], replacement)).rejects.toMatchObject({
      status: 422, validation: { code: "INACTIVE_SHIFT_ROLE" },
    });
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: created.id }, include: { assignments: true } })).assignments.map((item) => item.employeeId)).toEqual([sourceEmployeeId]);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(versionBeforeInactiveMove);
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: true, nameZh: "Current Front", colorToken: "#475569" } });

    const moved = await service.repositionShift(created.id, input, accountId, [targetEmployeeId], replacement);
    expect(moved).toMatchObject({ id: created.id, date: "2037-10-08", startAt: input.startAt, endAt: input.endAt, version: created.version + 1 });
    expect(moved).toMatchObject({ roleNameSnapshot: "Current Front", roleColorSnapshot: "#475569" });
    expect(moved.assignments.map((item) => item.employeeId)).toEqual([targetEmployeeId]);
    expect(moved.assignments[0]?.employeeNameSnapshot).toBe("Current Blair");
    const stored = await prisma.shift.findUniqueOrThrow({ where: { id: created.id }, include: { assignments: true } });
    expect(stored.assignments.map((item) => item.employeeId)).toEqual([targetEmployeeId]);
    expect(await prisma.shift.count({ where: { storeId } })).toBe(1);
    await expect(service.repositionShift(created.id, input, accountId, [targetEmployeeId], replacement)).rejects.toMatchObject({ status: 409, validation: { code: "STALE_VERSION" } });
    expect(await prisma.shift.count({ where: { storeId } })).toBe(1);
  });
});
