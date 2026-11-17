import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("current roster export snapshot", () => {
  const storeId = `export-snapshot-${randomUUID()}`;
  const writer = new PrismaClient();

  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.shiftRole.deleteMany({ where: { storeId } });
    await Promise.all([writer.$disconnect(), prisma.$disconnect()]);
  });

  it("does not combine an old period version with a newly committed shift", async () => {
    const period = await prisma.rosterPeriod.create({ data: {
      storeId, startDate: new Date("2038-10-11T00:00:00.000Z"),
      endDate: new Date("2038-10-17T00:00:00.000Z"), cycleType: "WEEK",
      createdByAccountId: "snapshot-test",
    } });
    const role = await prisma.shiftRole.create({ data: {
      storeId, code: "snapshot-test", nameZh: "测试岗位", colorToken: "#334155",
    } });

    let releaseRead!: () => void;
    let periodRead!: () => void;
    const resume = new Promise<void>((resolve) => { releaseRead = resolve; });
    const observed = new Promise<void>((resolve) => { periodRead = resolve; });
    const pausedPeriodRead = async (database: typeof prisma, args: Parameters<typeof prisma.rosterPeriod.findFirst>[0]) => {
      const value = await database.rosterPeriod.findFirst({ where: args!.where });
      periodRead();
      await resume;
      return value;
    };
    const service = new RosterService({
      // Prisma's included shifts can be fetched in a second SQL query. Model
      // that exact gap when the old implementation reads outside a transaction.
      rosterPeriod: { findFirst: async (args: Parameters<typeof prisma.rosterPeriod.findFirst>[0]) => {
        const value = await pausedPeriodRead(prisma, args);
        if (!value) return null;
        return { ...value, shifts: await prisma.shift.findMany({ where: { rosterPeriodId: value.id } }) };
      } },
      $transaction: (callback: (transaction: unknown) => Promise<unknown>, options: unknown) =>
        prisma.$transaction((transaction) => callback({
          rosterPeriod: { findFirst: (args: Parameters<typeof transaction.rosterPeriod.findFirst>[0]) =>
            pausedPeriodRead(transaction as typeof prisma, args) },
          shift: transaction.shift,
        }), { ...(options as object), timeout: 30_000 }),
    } as never);

    const pending = service.exportPeriod(storeId, period.id);
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

    const exported = await pending;
    expect(exported.period.version).toBe(1);
    expect(exported.shifts).toHaveLength(0);
    expect((await prisma.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } })).version).toBe(2);
    expect(await prisma.shift.count({ where: { storeId } })).toBe(1);
  }, 30_000);
});
