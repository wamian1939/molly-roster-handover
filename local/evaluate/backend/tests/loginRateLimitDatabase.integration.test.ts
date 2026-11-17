import { createHash } from "node:crypto";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { LoginRateLimitService } from "../src/loginRateLimitService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;

describeDatabase("shared PostgreSQL login limit", () => {
  const firstDb = new PrismaClient();
  const secondDb = new PrismaClient();
  const first = new LoginRateLimitService(firstDb);
  const second = new LoginRateLimitService(secondDb);
  const ip = "192.0.2.17";
  const username = `rate-${process.pid}-${Date.now()}`;
  const keyHash = createHash("sha256").update(ip).update("\0").update(username).digest("hex");

  afterAll(async () => {
    await first.clear(ip, username);
    await firstDb.$disconnect();
    await secondDb.$disconnect();
  });

  it("allows ten concurrent attempts across clients, then persists the block across a new service", async () => {
    const results = await Promise.all(Array.from({ length: 15 }, (_, index) =>
      (index % 2 ? first : second).reserve(ip, username)));
    expect(results.filter((retryAfter) => retryAfter === 0)).toHaveLength(10);
    expect(results.filter((retryAfter) => retryAfter > 0)).toHaveLength(5);

    const row = await firstDb.loginRateLimit.findUniqueOrThrow({ where: { keyHash } });
    expect(row.attemptCount).toBe(11);
    expect(row.keyHash).not.toContain(username);
    expect(await new LoginRateLimitService(secondDb).reserve(ip, username)).toBeGreaterThan(0);
  });

  it("resets after the window and clears after a successful login", async () => {
    await firstDb.loginRateLimit.update({
      where: { keyHash },
      data: { startedAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    expect(await second.reserve(ip, username)).toBe(0);
    expect((await firstDb.loginRateLimit.findUniqueOrThrow({ where: { keyHash } })).attemptCount).toBe(1);
    await first.clear(ip, username);
    expect(await firstDb.loginRateLimit.findUnique({ where: { keyHash } })).toBeNull();
  });

  it("prunes expired hash-only reservations on a later login", async () => {
    const staleUsername = `${username}-stale`;
    const staleKeyHash = createHash("sha256").update(ip).update("\0").update(staleUsername).digest("hex");
    await firstDb.loginRateLimit.create({
      data: { keyHash: staleKeyHash, attemptCount: 3, startedAt: new Date(Date.now() - 16 * 60 * 1000) },
    });
    expect(await new LoginRateLimitService(secondDb).reserve(ip, username)).toBe(0);
    expect(await firstDb.loginRateLimit.findUnique({ where: { keyHash: staleKeyHash } })).toBeNull();
  });
});
