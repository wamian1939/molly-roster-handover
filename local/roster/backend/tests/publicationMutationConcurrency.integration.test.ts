import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("publication and shift mutation ordering", () => {
  const service = new RosterService(prisma);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storeId = `publish-race-${suffix}`;
  const employeeId = `employee-${suffix}`;
  const date = "2040-03-07";
  const periodStart = "2040-03-05";
  const periodEnd = "2040-03-11";
  const publisher = { accountId: "qa-account", displayName: "QA Manager" };

  afterAll(async () => {
    await prisma.rosterPublication.deleteMany({ where: { rosterPeriod: { storeId } } });
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.employeeAvailability.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("keeps history frozen while current shifts remain editable after snapshot creation", async () => {
    await service.saveSettings({ storeId, timezone: "UTC", openingTime: "00:00", closingTime: "23:59",
      slotIntervalMinutes: 30, minimumShiftMinutes: 60, defaultBreakMinutes: 0, weekStartsOn: 1,
      cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
    const role = await prisma.shiftRole.create({ data: { storeId, code: `qa-${suffix}`, nameZh: "QA", colorToken: "#334155" } });
    await service.replaceAvailability({ storeId, employeeId, dates: [date], entries: [{ date, status: "AVAILABLE", startAt: "2040-03-07T08:00:00.000Z", endAt: "2040-03-07T18:00:00.000Z" }] });
    const assignment = { employeeId, employeeNameSnapshot: "QA Employee", employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: null, officialScoreSnapshot: null, tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null };
    const base = { storeId, date, targetStartDate: periodStart, targetEndDate: periodEnd, breakMinutes: 0, shiftRoleId: role.id, assignments: [assignment] };
    const first = await service.createShiftWithPeriod({ ...base, startAt: "2040-03-07T09:00:00.000Z", endAt: "2040-03-07T12:00:00.000Z" }, publisher.accountId);
    const period = await prisma.rosterPeriod.findFirstOrThrow({ where: { storeId } });
    const race = await Promise.allSettled([
      service.publishPeriod(storeId, period.id, period.version, publisher, { id: storeId, name: "QA Store" }, [assignment]),
      service.createShiftWithPeriod({ ...base, startAt: "2040-03-07T13:00:00.000Z", endAt: "2040-03-07T16:00:00.000Z" }, publisher.accountId),
    ]);
    const afterRace = await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } });
    const shifts = await prisma.shift.findMany({ where: { rosterPeriodId: period.id } });
    if (afterRace.status === "PUBLISHED") {
      expect(race[1].status).toBe("fulfilled");
      const publication = await prisma.rosterPublication.findFirstOrThrow({ where: { rosterPeriodId: period.id } });
      const snapshot = publication.snapshot as { shifts: Array<{ id: string }> };
      expect(snapshot.shifts.map((shift) => shift.id)).toEqual([first.id]);
      expect(shifts).toHaveLength(2);
    } else {
      expect(race[0].status).toBe("rejected");
      expect(shifts).toHaveLength(2);
      expect(await prisma.rosterPublication.count({ where: { rosterPeriodId: period.id } })).toBe(0);
      await service.publishPeriod(storeId, period.id, afterRace.version, publisher, { id: storeId, name: "QA Store" }, [assignment]);
    }

    const published = await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } });
    const historyBefore = await prisma.rosterPublication.findFirstOrThrow({ where: { rosterPeriodId: period.id } });
    const extra=await service.createShiftWithPeriod({...base,startAt:'2040-03-07T17:00:00.000Z',endAt:'2040-03-07T18:00:00.000Z'},publisher.accountId);
    await service.commitDraftPeriod(storeId,period.id,[{kind:'update',shiftId:extra.id,baseVersion:extra.version,value:{
      date,startAt:extra.startAt,endAt:extra.endAt,breakMinutes:0,shiftRoleId:role.id,assignments:[assignment],publicNote:'Edited current calendar',
    }}],publisher.accountId);
    const currentExtra=await prisma.shift.findUniqueOrThrow({where:{id:extra.id}});
    await service.batchUpdate(storeId,[{id:extra.id,version:currentExtra.version}],{publicNote:'Batch edit'},publisher.accountId,[employeeId]);
    const batchEdited=await prisma.shift.findUniqueOrThrow({where:{id:extra.id}});
    await service.batchDelete(storeId,[{id:extra.id,version:batchEdited.version}]);
    const edited=await service.updateShift(first.id,{...base,rosterPeriodId:period.id,version:first.version,
      startAt:'2040-03-07T09:30:00.000Z',endAt:'2040-03-07T12:00:00.000Z'},publisher.accountId);
    expect(edited.version).toBe(first.version+1);
    await expect(service.deleteShift(first.id, storeId, first.version)).rejects.toMatchObject({validation:{code:'STALE_VERSION'}});
    await service.deleteShift(first.id,storeId,edited.version);
    expect(await prisma.shift.findUnique({where:{id:first.id}})).toBeNull();
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(published.version+6);
    expect((await prisma.rosterPublication.findUniqueOrThrow({where:{id:historyBefore.id}})).snapshot).toEqual(historyBefore.snapshot);
  });
});
