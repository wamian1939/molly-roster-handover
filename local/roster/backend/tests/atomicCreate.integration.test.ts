import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("atomic shift and period creation", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `atomic-${suffix}`;
  const employeeId = `employee-${suffix}`;
  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.shiftCreateRequest.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("leaves no draft period after unavailable or overlapping create", async () => {
    const role = await prisma.shiftRole.create({ data: { storeId, code: `role-${suffix}`, nameZh: "QA", colorToken: "#334155" } });
    const candidate = { storeId, date: "2039-04-06", targetStartDate: "2039-04-04", targetEndDate: "2039-04-10", startAt: "2039-04-06T09:00:00.000Z", endAt: "2039-04-06T12:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id, formalRoleColor: "#1e40af", assignments: [{ employeeId, employeeNameSnapshot: "QA Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] };
    await expect(service.createShiftWithPeriod(candidate, "qa-account"))
      .rejects.toMatchObject({ status: 409, message: "请先在设置中保存门店时区，再创建或修改班次" });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(0);
    expect(await prisma.shift.count({ where: { storeId } })).toBe(0);
    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    await expect(service.createShiftWithPeriod(candidate, "qa-account")).rejects.toMatchObject({ status: 422, validation: { code: "EMPLOYEE_UNAVAILABLE", employeeId } });
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(0);
    await service.replaceAvailability({ storeId, employeeId, dates: [candidate.date], entries: [{ date: candidate.date, status: "AVAILABLE", startAt: candidate.startAt, endAt: "2039-04-06T17:00:00.000Z" }] });
    const created = await service.createShiftWithPeriod(candidate, "qa-account");
    expect(created.startAt).toBe(candidate.startAt);
    expect(created.roleColorSnapshot).toBe("#1e40af");
    expect((await prisma.shift.findUniqueOrThrow({ where: { id: created.id } })).roleColorSnapshot).toBe("#1e40af");
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);
    await expect(service.createShiftWithPeriod(candidate, "qa-account")).rejects.toMatchObject({ status: 409, validation: { code: "SHIFT_OVERLAP", employeeId } });
    expect(await prisma.shift.count({ where: { storeId } })).toBe(1);
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);
  });

  it("rejects a configured store's wrong weekday boundary without creating a period", async () => {
    const boundaryStoreId = `week-boundary-${suffix}`;
    try {
      await service.saveSettings({ storeId: boundaryStoreId, timezone: "UTC", openingTime: "08:00", closingTime: "22:00",
        slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1,
        cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
      const role = await prisma.shiftRole.create({ data: { storeId: boundaryStoreId, code: `boundary-${suffix}`, nameZh: "QA", colorToken: "#334155" } });
      const candidate = { storeId: boundaryStoreId, date: "2039-04-06", targetStartDate: "2039-04-05", targetEndDate: "2039-04-11",
        startAt: "2039-04-06T09:00:00.000Z", endAt: "2039-04-06T12:00:00.000Z", breakMinutes: 0,
        shiftRoleId: role.id, assignments: [{ employeeId, employeeNameSnapshot: "QA Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null,
          officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] };
      await expect(service.createShiftWithPeriod(candidate, "qa-account")).rejects.toMatchObject({ status: 400, validation: { code: "INVALID_TIME_RANGE" } });
      expect(await prisma.rosterPeriod.count({ where: { storeId: boundaryStoreId } })).toBe(0);
      expect(await prisma.shift.count({ where: { storeId: boundaryStoreId } })).toBe(0);
    } finally {
      await prisma.rosterPeriod.deleteMany({ where: { storeId: boundaryStoreId } });
      await prisma.employeeAvailability.deleteMany({ where: { storeId: boundaryStoreId } });
      await prisma.shiftRole.deleteMany({ where: { storeId: boundaryStoreId } });
      await prisma.rosterStoreSettings.deleteMany({ where: { storeId: boundaryStoreId } });
    }
  });

  it("returns one Shift for repeated client ID and rejects reuse for different content or account", async () => {
    const role = await prisma.shiftRole.create({ data: { storeId, code: `replay-${suffix}`, nameZh: "QA Replay", colorToken: "#334155" } });
    const date = "2039-04-13";
    const startAt = "2039-04-13T09:00:00.000Z";
    const endAt = "2039-04-13T12:00:00.000Z";
    await service.replaceAvailability({ storeId, employeeId, dates: [date], entries: [{ date, status: "AVAILABLE", startAt, endAt: "2039-04-13T17:00:00.000Z" }] });
    const candidate = { clientShiftId: randomUUID(), storeId, date, targetStartDate: "2039-04-11", targetEndDate: "2039-04-17",
      startAt, endAt, breakMinutes: 0, shiftRoleId: role.id,
      assignments: [{ employeeId, employeeNameSnapshot: "QA Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }] };
    const [first, replay] = await Promise.all([
      service.createShiftWithPeriod(candidate, "qa-account"), service.createShiftWithPeriod(candidate, "qa-account"),
    ]);
    expect(first.id).toBe(candidate.clientShiftId);
    expect(replay.id).toBe(first.id);
    expect(await prisma.shift.count({ where: { storeId, id: candidate.clientShiftId } })).toBe(1);
    const period = await prisma.rosterPeriod.findFirstOrThrow({ where: { storeId, startDate: new Date("2039-04-11") } });
    expect(period.version).toBe(2);
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: false } });
    expect((await service.createShiftWithPeriod(candidate, "qa-account")).id).toBe(first.id);
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: true } });
    await expect(service.createShiftWithPeriod({ ...candidate, publicNote: "different" }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "CREATE_REPLAY_CONFLICT" } });
    await expect(service.createShiftWithPeriod(candidate, "another-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "CREATE_REPLAY_CONFLICT" } });
    expect(await prisma.shift.count({ where: { storeId, id: candidate.clientShiftId } })).toBe(1);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(2);
    await prisma.shift.delete({ where: { id: candidate.clientShiftId } });
    await expect(service.createShiftWithPeriod(candidate, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "CREATE_REPLAY_GONE" } });
    expect(await prisma.shift.count({ where: { storeId, id: candidate.clientShiftId } })).toBe(0);
    expect(await prisma.shiftCreateRequest.count({ where: { id: candidate.clientShiftId } })).toBe(1);
  });
});
