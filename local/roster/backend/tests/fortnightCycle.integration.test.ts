import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService, type AssignmentSnapshot } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("configured fortnight scheduling", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `fortnight-${suffix}`;
  const employeeId = `fortnight-employee-${suffix}`;
  const employee: AssignmentSnapshot = { employeeId, employeeNameSnapshot: "Fortnight Employee", employeeTypeSnapshot: "REGULAR",
    employmentTypeSnapshot: "FullTime", officialScoreSnapshot: 82, tierSnapshot: "T2", officialScoreRoundId: "closed-round", officialScoreClosedAt: "2026-09-01T00:00:00.000Z" };
  const settings = { storeId, timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", slotIntervalMinutes: 30,
    minimumShiftMinutes: 60, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "FORTNIGHT" as const,
    fortnightAnchorDate: "2026-09-28", weeklyHourWarning: 38, dailyHourWarning: 10 };

  afterAll(async () => {
    await prisma.rosterPublication.deleteMany({ where: { rosterPeriod: { storeId } } });
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("uses one 14-day anchor across create, Copy Day, Repeat, move, Copy Period and publish", async () => {
    await expect(service.createPeriod({ storeId, startDate: "2026-09-28", endDate: "2026-10-11", cycleType: "FORTNIGHT" }, "qa-account"))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });
    await expect(service.saveSettings({ ...settings, fortnightAnchorDate: null }))
      .rejects.toMatchObject({ status: 400, validation: { code: "INVALID_TIME_RANGE" } });
    await expect(service.saveSettings({ ...settings, fortnightAnchorDate: "2026-09-29" }))
      .rejects.toMatchObject({ status: 400, validation: { code: "INVALID_TIME_RANGE" } });
    await service.saveSettings(settings);
    await expect(service.createPeriod({ storeId, startDate: "2026-10-05", endDate: "2026-10-18", cycleType: "FORTNIGHT" }, "qa-account"))
      .rejects.toMatchObject({ status: 400, validation: { code: "INVALID_TIME_RANGE" } });
    const role = await prisma.shiftRole.create({ data: { storeId, code: `fortnight-${suffix}`, nameZh: "Front", colorToken: "#334155" } });
    for (const [date, startAt, endAt] of [
      ["2026-10-09", "2026-10-08T22:00:00.000Z", "2026-10-09T02:00:00.000Z"],
      ["2026-10-10", "2026-10-09T22:00:00.000Z", "2026-10-10T02:00:00.000Z"],
      ["2026-10-12", "2026-10-11T22:00:00.000Z", "2026-10-12T02:00:00.000Z"],
      ["2026-10-26", "2026-10-25T22:00:00.000Z", "2026-10-26T02:00:00.000Z"],
      ["2026-11-09", "2026-11-08T22:00:00.000Z", "2026-11-09T02:00:00.000Z"],
    ]) await service.replaceAvailability({ storeId, employeeId, dates: [date], entries: [{ date, status: "AVAILABLE", startAt, endAt }] });

    const original = await service.createShiftWithPeriod({ storeId, date: "2026-10-09", targetStartDate: "2026-09-28", targetEndDate: "2026-10-11",
      startAt: "2026-10-08T22:00:00.000Z", endAt: "2026-10-09T02:00:00.000Z", breakMinutes: 30,
      shiftRoleId: role.id, assignments: [employee] }, "qa-account");
    const firstPeriod = await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: original.rosterPeriodId } });
    expect(firstPeriod).toMatchObject({ cycleType: "FORTNIGHT", startDate: new Date("2026-09-28"), endDate: new Date("2026-10-11") });
    await expect(service.saveSettings({ ...settings, fortnightAnchorDate: "2026-10-05", version: 1 }))
      .rejects.toMatchObject({ status: 409, validation: { code: "INVALID_TIME_RANGE" } });

    const dayInput = { storeId, sourceDate: "2026-10-09", targetDate: "2026-10-10", activeEmployeeIds: [employeeId] };
    const dayPreview = await service.previewCopyDay(dayInput);
    expect(dayPreview).toMatchObject({ shiftCount: 1, readyShifts: 1, canCopy: true });
    expect((await service.copyDay({ ...dayInput, expectedSourcePeriodVersion: dayPreview.sourcePeriodVersion,
      expectedTargetPeriodVersion: dayPreview.targetPeriodVersion }, "qa-account")).created).toBe(1);
    expect(await prisma.rosterPeriod.count({ where: { storeId } })).toBe(1);

    const repeatInput = { storeId, sourceShiftId: original.id, targetDates: ["2026-10-12"], activeEmployeeIds: [employeeId] };
    const repeatPreview = await service.previewRepeatShift(repeatInput);
    expect(repeatPreview.canCopy).toBe(true);
    expect((await service.repeatShift({ ...repeatInput, expectedSourcePeriodVersion: repeatPreview.sourcePeriodVersion,
      expectedTargetPeriodVersions: repeatPreview.targetPeriodVersions }, "qa-account")).created).toBe(1);
    const secondPeriod = await prisma.rosterPeriod.findFirstOrThrow({ where: { storeId, startDate: new Date("2026-10-12") } });
    expect(secondPeriod).toMatchObject({ endDate: new Date("2026-10-25"), cycleType: "FORTNIGHT" });

    await service.repositionShift(original.id, { storeId, date: "2026-10-26", startAt: "2026-10-25T22:00:00.000Z",
      endAt: "2026-10-26T02:00:00.000Z", version: original.version, targetStartDate: "2026-10-26", targetEndDate: "2026-11-08" },
    "qa-account", [employeeId]);
    expect(await prisma.rosterPeriod.findFirstOrThrow({ where: { storeId, startDate: new Date("2026-10-26") } }))
      .toMatchObject({ endDate: new Date("2026-11-08"), cycleType: "FORTNIGHT" });

    const currentSecond = await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: secondPeriod.id } });
    const publication = await service.publishPeriod(storeId, secondPeriod.id, currentSecond.version,
      { accountId: "qa-account", displayName: "QA" }, { id: storeId, name: "QA Store" }, [employee]);
    expect(publication.period.status).toBe("PUBLISHED");
    const savedPublication = await prisma.rosterPublication.findFirstOrThrow({ where: { rosterPeriodId: secondPeriod.id } });
    const publishedSnapshot = JSON.stringify(savedPublication.snapshot);

    const periodInput = { storeId, sourcePeriodId: secondPeriod.id, targetStartDate: "2026-11-09", activeEmployeeIds: [employeeId] };
    const periodPreview = await service.previewCopyPeriod(periodInput);
    expect(periodPreview).toMatchObject({ readyShifts: 1, canCopy: true });
    const copied = await service.copyPeriod({ ...periodInput, expectedSourcePeriodVersion: periodPreview.sourcePeriodVersion }, "qa-account");
    expect(copied).toMatchObject({ cycleType: "FORTNIGHT", startDate: "2026-11-09", endDate: "2026-11-22", status: "DRAFT" });
    expect(JSON.stringify((await prisma.rosterPublication.findUniqueOrThrow({ where: { id: savedPublication.id } })).snapshot)).toBe(publishedSnapshot);
    expect(await prisma.rosterPeriod.count({ where: { storeId, cycleType: "WEEK" } })).toBe(0);
  });
});
