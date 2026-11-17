import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("store settings cycle changes", () => {
  const storeId = `settings-cycle-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const service = new RosterService(prisma);
  const settings = { storeId, timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00",
    slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 30,
    weekStartsOn: 1, cycleType: "FORTNIGHT" as const, fortnightAnchorDate: "2026-09-28",
    weeklyHourWarning: 38, dailyHourWarning: 10 };

  afterAll(async () => {
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("drops the obsolete fortnight anchor when switching to a Sunday-start week", async () => {
    const first = await service.saveSettings(settings);
    const weekly = await service.saveSettings({ ...settings, cycleType: "WEEK", weekStartsOn: 0,
      fortnightAnchorDate: "2026-09-28", version: first.version });

    expect(weekly).toMatchObject({ cycleType: "WEEK", weekStartsOn: 0, fortnightAnchorDate: null });
    expect(await prisma.rosterStoreSettings.findUniqueOrThrow({ where: { storeId } }))
      .toMatchObject({ cycleType: "WEEK", weekStartsOn: 0, fortnightAnchorDate: null });
    await expect(service.saveSettings({ ...settings, weekStartsOn: 0,
      fortnightAnchorDate: null, version: weekly.version }))
      .rejects.toMatchObject({ status: 400 });
  });
});
