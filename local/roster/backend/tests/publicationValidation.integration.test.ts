import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("publication validation against current draft data", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `publish-validation-${suffix}`;
  const otherStoreId = `publish-validation-other-${suffix}`;
  const roleStoreId = `publish-role-${suffix}`;
  const employeeId = `employee-${suffix}`;
  const publisher = { accountId: "qa-account", displayName: "QA Manager" };
  const employee = { employeeId, employeeNameSnapshot: "QA Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };

  afterAll(async () => {
    await prisma.rosterPublication.deleteMany({ where: { rosterPeriod: { storeId: { in: [storeId, roleStoreId] } } } });
    await prisma.rosterPeriod.deleteMany({ where: { storeId: { in: [storeId, otherStoreId, roleStoreId] } } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId: { in: [storeId, roleStoreId] } } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId: { in: [storeId, roleStoreId] } } });
    await prisma.shiftRole.deleteMany({ where: { storeId: { in: [storeId, roleStoreId] } } });
    await prisma.$disconnect();
  });

  it("rejects missing availability and an overlapping legacy shift without a partial publication", async () => {
    const initialSettings = await service.saveSettings({ storeId, timezone: "UTC",
      openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30, minimumShiftMinutes: 60,
      defaultBreakMinutes: 0, weekStartsOn: 1, cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId, code: `qa-${suffix}`, nameZh: "QA", colorToken: "#334155" } });
    await service.replaceAvailability({ storeId, employeeId, dates: ["2041-04-03"], entries: [{ date: "2041-04-03", status: "AVAILABLE", startAt: "2041-04-03T08:00:00.000Z", endAt: "2041-04-03T18:00:00.000Z" }] });
    const shift = await service.createShiftWithPeriod({ storeId, date: "2041-04-03", targetStartDate: "2041-04-01", targetEndDate: "2041-04-07", startAt: "2041-04-03T09:00:00.000Z", endAt: "2041-04-03T12:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id, assignments: [employee] }, publisher.accountId);
    const period = await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: shift.rosterPeriodId } });

    await prisma.employeeAvailability.deleteMany({ where: { storeId, employeeId } });
    await expect(service.publishPeriod(storeId, period.id, period.version, publisher, { id: storeId, name: "QA Store" }, [employee])).rejects.toMatchObject({ status: 422, validation: { code: "EMPLOYEE_UNAVAILABLE", employeeId } });
    expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: period.id } })).toBe(0);
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).toMatchObject({ status: "DRAFT", version: period.version });

    await service.replaceAvailability({ storeId, employeeId, dates: ["2041-04-03"], entries: [{ date: "2041-04-03", status: "AVAILABLE", startAt: "2041-04-03T08:00:00.000Z", endAt: "2041-04-03T18:00:00.000Z" }] });
    const overlapping = await prisma.shift.create({ data: { rosterPeriodId: period.id, storeId, date: new Date("2041-04-03"), startAt: new Date("2041-04-03T11:00:00.000Z"), endAt: new Date("2041-04-03T13:00:00.000Z"), breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, createdByAccountId: publisher.accountId, updatedByAccountId: publisher.accountId, assignments: { create: employee } } });
    await expect(service.publishPeriod(storeId, period.id, period.version, publisher, { id: storeId, name: "QA Store" }, [employee])).rejects.toMatchObject({ status: 409, validation: { code: "SHIFT_OVERLAP", employeeId } });
    expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: period.id } })).toBe(0);
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).toMatchObject({ status: "DRAFT", version: period.version });

    await prisma.shift.delete({ where: { id: overlapping.id } });
    const otherPeriod = await prisma.rosterPeriod.create({ data: { storeId: otherStoreId, startDate: new Date("2041-04-01"), endDate: new Date("2041-04-07"), cycleType: "WEEK", createdByAccountId: publisher.accountId } });
    const otherShift = await prisma.shift.create({ data: { rosterPeriodId: otherPeriod.id, storeId: otherStoreId, date: new Date("2041-04-03"), startAt: new Date("2041-04-03T11:00:00.000Z"), endAt: new Date("2041-04-03T13:00:00.000Z"), breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken, createdByAccountId: publisher.accountId, updatedByAccountId: publisher.accountId, assignments: { create: employee } } });
    await expect(service.publishPeriod(storeId, period.id, period.version, publisher, { id: storeId, name: "QA Store" }, [employee])).rejects.toMatchObject({ status: 409, validation: { code: "CROSS_STORE_CONFLICT", employeeId } });
    expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: period.id } })).toBe(0);
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).toMatchObject({ status: "DRAFT", version: period.version });
    await prisma.shift.delete({ where: { id: otherShift.id } });
    await service.replaceAvailability({ storeId, employeeId, dates: ["2041-04-04", "2041-04-09"], entries: [
      { date: "2041-04-04", status: "AVAILABLE", startAt: "2041-04-04T09:00:00.000Z", endAt: "2041-04-04T12:00:00.000Z" },
      { date: "2041-04-09", status: "AVAILABLE", startAt: "2041-04-09T09:00:00.000Z", endAt: "2041-04-09T12:00:00.000Z" },
    ] });
    await expect(prisma.shift.create({ data: { rosterPeriodId: period.id, storeId: otherStoreId, date: new Date("2041-04-04"),
      startAt: new Date("2041-04-04T09:00:00.000Z"), endAt: new Date("2041-04-04T12:00:00.000Z"), breakMinutes: 0,
      shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: publisher.accountId, updatedByAccountId: publisher.accountId, assignments: { create: employee } } }))
      .rejects.toMatchObject({ code: "P2003" });
    const misplaced = await prisma.shift.create({ data: { rosterPeriodId: period.id, storeId, date: new Date("2041-04-09"),
      startAt: new Date("2041-04-09T09:00:00.000Z"), endAt: new Date("2041-04-09T12:00:00.000Z"), breakMinutes: 0,
      shiftRoleId: role.id, roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: publisher.accountId, updatedByAccountId: publisher.accountId, assignments: { create: employee } } });
    await expect(service.publishPeriod(storeId, period.id, period.version, publisher, { id: storeId, name: "QA Store" }, [employee]))
      .rejects.toMatchObject({ status: 409, validation: { code: "SHIFT_PERIOD_MISMATCH", shiftId: misplaced.id } });
    expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: period.id } })).toBe(0);
    await prisma.shift.delete({ where: { id: misplaced.id } });
    const baseSettings = { storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59", slotIntervalMinutes: 30,
      minimumShiftMinutes: 240, defaultBreakMinutes: 30, weekStartsOn: 1, cycleType: "WEEK" as const, weeklyHourWarning: 38, dailyHourWarning: 10 };
    const stricterSettings = await service.saveSettings({ ...baseSettings, version: initialSettings.version });
    await expect(service.publishPeriod(storeId, period.id, period.version, publisher, { id: storeId, name: "QA Store" }, [employee]))
      .rejects.toMatchObject({ status: 400, validation: { code: "MIN_SHIFT_DURATION" } });
    expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: period.id } })).toBe(0);
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).toMatchObject({ status: "DRAFT", version: period.version });
    const shorterSettings = await service.saveSettings({ ...baseSettings, minimumShiftMinutes: 60, openingTime: "21:00", version: stricterSettings.version });
    await expect(service.publishPeriod(storeId, period.id, period.version, publisher, { id: storeId, name: "QA Store" }, [employee]))
      .rejects.toMatchObject({ status: 400, validation: { code: "OUTSIDE_OPERATING_HOURS" } });
    expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: period.id } })).toBe(0);
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).toMatchObject({ status: "DRAFT", version: period.version });
    await service.saveSettings({ ...baseSettings, minimumShiftMinutes: 60, version: shorterSettings.version });
    const published = await service.publishPeriod(storeId, period.id, period.version, publisher, { id: storeId, name: "QA Store" }, [employee]);
    expect(published.period.status).toBe("PUBLISHED");
    expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: period.id } })).toBe(1);
  });

  it("blocks republishing a reopened period after its Shift Role is deactivated", async () => {
    await service.saveSettings({ storeId: roleStoreId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId: roleStoreId, code: `role-${suffix}`, nameZh: "QA Role", colorToken: "#334155" } });
    await service.replaceAvailability({ storeId: roleStoreId, employeeId, dates: ["2041-04-17"], entries: [
      { date: "2041-04-17", status: "AVAILABLE", startAt: "2041-04-17T08:00:00.000Z", endAt: "2041-04-17T18:00:00.000Z" },
    ] });
    const shift = await service.createShiftWithPeriod({ storeId: roleStoreId, date: "2041-04-17", targetStartDate: "2041-04-15", targetEndDate: "2041-04-21", startAt: "2041-04-17T09:00:00.000Z", endAt: "2041-04-17T12:00:00.000Z", breakMinutes: 0, shiftRoleId: role.id, assignments: [employee] }, publisher.accountId);
    const period = await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: shift.rosterPeriodId } });
    const first = await service.publishPeriod(roleStoreId, period.id, period.version, publisher, { id: roleStoreId, name: "QA Store" }, [employee]);
    const reopened = await service.reopenPeriod(roleStoreId, period.id, first.period.version);
    await prisma.shiftRole.update({ where: { id: role.id }, data: { isActive: false } });

    await expect(service.publishPeriod(roleStoreId, period.id, reopened.version, publisher, { id: roleStoreId, name: "QA Store" }, [employee]))
      .rejects.toMatchObject({ status: 422, validation: { code: "INACTIVE_SHIFT_ROLE", shiftId: shift.id } });
    expect(await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).toMatchObject({ status: "DRAFT", version: reopened.version });
    expect(await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).toMatchObject({ version: shift.version });
    const publications = await prisma.rosterPublication.findMany({ where: { rosterPeriodId: period.id } });
    expect(publications).toHaveLength(1);
    expect(publications[0].periodVersion).toBe(first.period.version);
    expect((publications[0].snapshot as { period: { status: string } }).period.status).toBe("PUBLISHED");
  });
});
