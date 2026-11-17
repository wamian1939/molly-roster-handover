import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../src/prisma.js";
import { RosterService } from "../src/rosterService.js";

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;

describeDatabase("RosterPeriod PostgreSQL concurrency", () => {
  const service = new RosterService(prisma);
  const storeId = `concurrency-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  afterAll(async () => {
    await prisma.rosterPeriod.deleteMany({ where: { storeId } });
    await prisma.$disconnect();
  });

  it("allows exactly one of two concurrent overlapping period creates", async () => {
    const input = { storeId, startDate: "2037-09-07", endDate: "2037-09-13", cycleType: "WEEK" as const };
    const results = await Promise.allSettled([
      service.createPeriod(input, "concurrency-test-a"),
      service.createPeriod(input, "concurrency-test-b"),
    ]);
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter((result) => result.status === "rejected");
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    expect((failures[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    await expect(prisma.rosterPeriod.count({ where: { storeId } })).resolves.toBe(1);
  });
});
