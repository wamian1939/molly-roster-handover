import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService, type AssignmentSnapshot } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("cross-store employee write serialization", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const stores = [`cross-race-a-${suffix}`, `cross-race-b-${suffix}`];
  const employeeId = `cross-race-employee-${suffix}`;
  const date = "2038-04-05";
  const startAt = "2038-04-05T09:00:00.000Z";
  const endAt = "2038-04-05T13:00:00.000Z";
  const employee: AssignmentSnapshot = { employeeId, employeeNameSnapshot: "Shared Employee", employeeTypeSnapshot: "REGULAR",
    employmentTypeSnapshot: "FullTime", officialScoreSnapshot: null, tierSnapshot: null,
    officialScoreRoundId: null, officialScoreClosedAt: null };

  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId: { in: stores } } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId: { in: stores } } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId: { in: stores } } });
    await prisma.shiftRole.deleteMany({ where: { storeId: { in: stores } } });
    await prisma.$disconnect();
  });

  it("allows exactly one simultaneous overlapping Shift across two stores", async () => {
    await Promise.all(stores.map((storeId) => service.saveSettings({ storeId, timezone: "UTC",
      openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30, minimumShiftMinutes: 60,
      defaultBreakMinutes: 0, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 })));
    const roles = await Promise.all(stores.map((storeId) => prisma.shiftRole.create({ data: {
      storeId, code: `race-${suffix}`, nameZh: "QA", colorToken: "#334155",
    } })));
    await Promise.all(stores.map((storeId) => service.replaceAvailability({ storeId, employeeId,
      dates: [date], entries: [{ date, status: "AVAILABLE", startAt: "2038-04-05T08:00:00.000Z", endAt: "2038-04-05T14:00:00.000Z" }],
    })));
    const attempts = stores.map((storeId, index) => service.createShiftWithPeriod({ storeId, date,
      targetStartDate: "2038-04-05", targetEndDate: "2038-04-11", startAt, endAt,
      breakMinutes: 30, shiftRoleId: roles[index]!.id, assignments: [employee],
    }, "qa-account"));
    const outcomes = await Promise.allSettled(attempts);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: { status: 409,
      validation: { code: "CROSS_STORE_CONFLICT", employeeId } } });
    const shifts = await prisma.shift.findMany({ where: { storeId: { in: stores } }, include: { assignments: true } });
    expect(shifts).toHaveLength(1);
    expect(shifts[0]?.assignments).toHaveLength(1);
    expect(shifts[0]?.assignments[0]?.employeeId).toBe(employeeId);
    expect(shifts[0]?.startAt.toISOString()).toBe(startAt);
    expect(shifts[0]?.endAt.toISOString()).toBe(endAt);
    const periods = await prisma.rosterPeriod.findMany({ where: { storeId: { in: stores } } });
    expect(periods).toHaveLength(1);
    expect(periods[0]?.storeId).toBe(shifts[0]?.storeId);
    expect(periods[0]?.version).toBe(2);
  });
});
