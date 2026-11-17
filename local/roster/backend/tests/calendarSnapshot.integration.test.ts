import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("calendar snapshot", () => {
  const storeId = `calendar-snapshot-${randomUUID()}`;
  const writer = new PrismaClient();
  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.rosterStoreSettings.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await Promise.all([writer.$disconnect(), prisma.$disconnect()]);
  });

  it("does not return a pre-change period with post-change shifts", async () => {
    const period = await prisma.rosterPeriod.create({ data: {
      storeId, startDate: new Date("2038-10-11T00:00:00.000Z"),
      endDate: new Date("2038-10-17T00:00:00.000Z"), cycleType: "WEEK",
      createdByAccountId: "snapshot-test",
    } });
    const role = await prisma.shiftRole.create({ data: {
      storeId, code: "snapshot-test", nameZh: "测试岗位", colorToken: "#334155",
    } });
    await prisma.rosterStoreSettings.create({ data: { storeId, timezone: "Australia/Sydney" } });

    let releaseRead!: () => void;
    let periodRead!: () => void;
    const resume = new Promise<void>((resolve) => { releaseRead = resolve; });
    const observed = new Promise<void>((resolve) => { periodRead = resolve; });
    const service = new RosterService({
      $transaction: (callback: (transaction: unknown) => Promise<unknown>, options: unknown) =>
        prisma.$transaction((transaction) => callback({
          rosterPeriod: {
            findMany: async (args: Parameters<typeof transaction.rosterPeriod.findMany>[0]) => {
              const value = await transaction.rosterPeriod.findMany(args);
              periodRead();
              await resume;
              return value;
            },
          },
          shift: transaction.shift,
          rosterStoreSettings: transaction.rosterStoreSettings,
        }), { ...(options as object), timeout: 30_000 }),
    } as never);

    const pending = service.calendar(storeId, "2038-10-11", "2038-10-17");
    await observed;
    try {
      await writer.$transaction(async (transaction) => {
        await transaction.shift.create({ data: {
          rosterPeriodId: period.id, storeId, date: new Date("2038-10-11T00:00:00.000Z"),
          startAt: new Date("2038-10-11T10:00:00.000Z"), endAt: new Date("2038-10-11T17:00:00.000Z"),
          breakMinutes: 0, shiftRoleId: role.id, roleNameSnapshot: role.nameZh,
          roleColorSnapshot: role.colorToken, createdByAccountId: "snapshot-test",
          updatedByAccountId: "snapshot-test",
        } });
        await transaction.rosterPeriod.update({ where: { id: period.id }, data: { version: { increment: 1 } } });
      });
    } finally {
      releaseRead();
    }
    const calendar = await pending;
    expect(calendar.periods).toHaveLength(1);
    expect(calendar.periods[0].version).toBe(1);
    expect(calendar.shifts).toHaveLength(0);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(2);
    expect(await prisma.shift.count({ where: { storeId } })).toBe(1);
  }, 30_000);
});
