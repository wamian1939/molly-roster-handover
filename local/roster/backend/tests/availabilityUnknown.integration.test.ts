import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("UNKNOWN Availability integrity on isolated PostgreSQL", () => {
  const service = new RosterService(prisma);
  const storeId = `unknown-availability-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const employeeId = `unknown-employee-${Date.now()}`;
  const date = "2037-10-07";
  const base = { storeId, employeeId, dates: [date] };

  afterAll(async () => {
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("rejects timed availability before store timezone setup without writing rows", async () => {
    await expect(service.replaceAvailability({ ...base, entries: [{ date, status: "AVAILABLE",
      startAt: "2037-10-07T09:00:00.000Z", endAt: "2037-10-07T17:00:00.000Z" }] }))
      .rejects.toMatchObject({ status: 409 });
    expect(await prisma.employeeAvailability.count({ where: { storeId } })).toBe(0);
    await expect(service.replaceAvailability({ ...base, entries: [{ date, status: "UNKNOWN" }] }))
      .rejects.toMatchObject({ status: 409 });
    expect(await prisma.employeeAvailability.count({ where: { storeId } })).toBe(0);
  });

  it("preserves the prior row when UNKNOWN is mixed, repeated or given clock instants", async () => {
    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const unknown = { date, status: "UNKNOWN" as const, startAt: null, endAt: null };
    const timed = { date, status: "AVAILABLE" as const,
      startAt: "2037-10-07T09:00:00.000Z", endAt: "2037-10-07T17:00:00.000Z" };
    const saved = await service.replaceAvailability({ ...base, entries: [unknown] });
    expect(saved).toHaveLength(1);
    const prior = await prisma.employeeAvailability.findMany({ where: { storeId, employeeId } });
    expect(prior).toMatchObject([{ status: "UNKNOWN", startAt: null, endAt: null }]);

    for (const entries of [
      [unknown, timed],
      [unknown, unknown],
      [{ ...unknown, startAt: timed.startAt, endAt: timed.endAt }],
    ]) {
      await expect(service.replaceAvailability({ ...base, entries })).rejects.toMatchObject({ status: 400 });
      expect(await prisma.employeeAvailability.findMany({ where: { storeId, employeeId } })).toEqual(prior);
    }
  });
});
