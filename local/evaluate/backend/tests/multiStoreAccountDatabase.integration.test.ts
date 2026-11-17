import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountService } from "../src/accountService.js";
import { AuthService, hashPassword, type AuthContext } from "../src/auth.js";
import { EvaluationRoundService } from "../src/evaluationRoundService.js";
import { EvaluationV1Service } from "../src/evaluationV1Service.js";

const runDatabaseTests = process.env.RUN_DATABASE_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const schemaName = `codex_multi_store_${process.pid}_${Date.now()}`;
const rootUrl = process.env.DATABASE_URL ?? "";
let rootDb: PrismaClient;
let db: PrismaClient;

const admin = actor("admin-account", "Admin", "ADMIN", []);
const multi = actor("multi-account", "Multi Manager", "STORE_EVALUATOR", ["store-a", "store-b"]);
const single = actor("single-account", "Single Manager", "STORE_EVALUATOR", ["store-a"]);

describeDatabase.sequential("multi-store account and safe deletion invariants", () => {
  beforeAll(async () => {
    if (!rootUrl) throw new Error("DATABASE_URL is required when RUN_DATABASE_TESTS=1.");
    const url = new URL(rootUrl);
    url.searchParams.set("schema", schemaName);
    rootDb = new PrismaClient({ datasourceUrl: rootUrl });
    await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe", timeout: 60_000,
    });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await seed(db);
  }, 90_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (rootDb) {
      await rootDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await rootDb.$disconnect();
    }
  });

  it("backfills and enforces one unique account-store assignment", async () => {
    const accesses = await db.userAccountStoreAccess.findMany({ where: { accountId: multi.accountId }, orderBy: { storeId: "asc" } });
    expect(accesses.map((access) => access.storeId)).toEqual(["store-a", "store-b"]);
    await expect(db.userAccountStoreAccess.create({ data: { accountId: multi.accountId, storeId: "store-a" } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("counts a multi-store evaluator once in every authorized Store and nowhere else", async () => {
    const rounds = new EvaluationRoundService(db);
    const roundA = await rounds.getOrCreateOpenRound("employee-a", multi);
    const roundB = await rounds.getOrCreateOpenRound("employee-b", multi);
    expect(await rounds.getRound(roundA.id, admin)).toMatchObject({ eligibleCount: 2 });
    expect(await rounds.getRound(roundB.id, admin)).toMatchObject({ eligibleCount: 1 });
    await expect(rounds.getOrCreateOpenRound("employee-c", multi)).rejects.toMatchObject({ status: 403 });
  });

  it("applies Store access changes to the current Session and OPEN denominator immediately", async () => {
    const accounts = new AccountService(db);
    const rounds = new EvaluationRoundService(db);
    const roundB = await rounds.getCurrentRound("employee-b", multi);
    if (!roundB) throw new Error("Expected Store B OPEN round.");
    await accounts.updateAccount(single.accountId, { storeIds: ["store-a", "store-b"] }, admin.accountId);
    expect(await rounds.getRound(roundB.id, admin)).toMatchObject({ eligibleCount: 2 });

    const password = "session-test-123";
    await db.userAccount.update({ where: { id: single.accountId }, data: { passwordHash: await hashPassword(password) } });
    const auth = new AuthService(db);
    const loggedIn = await auth.login("single", password);
    expect(loggedIn.user.storeIds).toEqual(["store-a", "store-b"]);
    await accounts.updateAccount(single.accountId, { storeIds: ["store-a"] }, admin.accountId);
    const refreshed = await auth.authenticate(loggedIn.token);
    expect(refreshed.storeIds).toEqual(["store-a"]);
    expect(await rounds.getRound(roundB.id, admin)).toMatchObject({ eligibleCount: 1 });
  });

  it("removes unauthorized OPEN submissions while preserving CLOSED evaluator snapshots", async () => {
    const accounts = new AccountService(db);
    const rounds = new EvaluationRoundService(db);
    const evaluations = new EvaluationV1Service(db);
    const roundA = await rounds.getCurrentRound("employee-a", multi);
    if (!roundA) throw new Error("Expected Store A OPEN round.");
    await evaluations.submitLiveEvaluation(roundA.id, await submission(db, roundA.id), multi);
    await evaluations.submitLiveEvaluation(roundA.id, await submission(db, roundA.id), single);
    const closed = await rounds.closeRound(roundA.id, admin);
    expect(closed).toMatchObject({ status: "CLOSED", completedCount: 2, eligibleCount: 2 });
    const closedRowsBefore = await db.evaluation.count({ where: { roundId: roundA.id } });

    const openRound = await rounds.getOrCreateOpenRound("employee-a", multi);
    await evaluations.submitLiveEvaluation(openRound.id, await submission(db, openRound.id), multi);
    await accounts.deleteAccount(multi.accountId, admin.accountId);

    expect(await db.evaluation.count({ where: { roundId: openRound.id, evaluatorAccountId: multi.accountId } })).toBe(0);
    expect(await db.evaluation.count({ where: { roundId: roundA.id } })).toBe(closedRowsBefore);
    expect(await db.evaluationRoundEvaluator.count({ where: { roundId: roundA.id } })).toBe(2);
    expect((await rounds.getRound(openRound.id, admin)).eligibleCount).toBe(1);
    expect(await db.authSession.count({ where: { userId: multi.accountId } })).toBe(0);
    expect(await db.userAccount.findUniqueOrThrow({ where: { id: multi.accountId } })).toMatchObject({ isActive: false, deletedAt: expect.any(Date) });
    expect(await accounts.listAccounts()).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: multi.accountId })]));
  });

  it("rejects self-delete and deleting the last active ADMIN", async () => {
    const accounts = new AccountService(db);
    await expect(accounts.deleteAccount(admin.accountId, admin.accountId)).rejects.toMatchObject({ status: 409 });
    await expect(accounts.deleteAccount(admin.accountId, "different-admin")).rejects.toMatchObject({ status: 409 });
  });
});

async function seed(client: PrismaClient) {
  await client.store.createMany({ data: [
    { id: "store-a", name: "Store A", region: "Sydney", managerName: "A", city: "Sydney" },
    { id: "store-b", name: "Store B", region: "Sydney", managerName: "B", city: "Sydney" },
    { id: "store-c", name: "Store C", region: "Sydney", managerName: "C", city: "Sydney" },
  ] });
  await client.userAccount.createMany({ data: [
    account(admin.accountId, "admin", admin.displayName, "ADMIN"),
    account(multi.accountId, "multi", multi.displayName, "STORE_EVALUATOR"),
    account(single.accountId, "single", single.displayName, "STORE_EVALUATOR"),
  ] });
  await client.userAccountStoreAccess.createMany({ data: [
    { accountId: multi.accountId, storeId: "store-a" },
    { accountId: multi.accountId, storeId: "store-b" },
    { accountId: single.accountId, storeId: "store-a" },
  ] });
  await client.employee.createMany({ data: [
    { id: "employee-a", storeId: "store-a", displayName: "A", employmentType: "PartTime" },
    { id: "employee-b", storeId: "store-b", displayName: "B", employmentType: "PartTime" },
    { id: "employee-c", storeId: "store-c", displayName: "C", employmentType: "PartTime" },
  ] });
  await client.skillDefinition.create({ data: { id: "skill-1", code: "skill-1", nameZh: "开茶", nameEn: "Tea", category: "BACK_OF_HOUSE", weight: 1, displayOrder: 1 } });
}

function account(id: string, username: string, displayName: string, role: "ADMIN" | "STORE_EVALUATOR") {
  return { id, username, displayName, passwordHash: "not-used", role, isActive: true } as const;
}

function actor(accountId: string, displayName: string, role: "ADMIN" | "STORE_EVALUATOR", storeIds: string[]): AuthContext {
  return { accountId, userId: accountId, username: accountId, displayName, role, storeIds, canAccessAllStores: role === "ADMIN" };
}

async function submission(client: PrismaClient, roundId: string) {
  const round = await client.evaluationRound.findUniqueOrThrow({ where: { id: roundId }, select: { skillBaselineSnapshot: true } });
  const baseline = round.skillBaselineSnapshot as Array<{ skillDefinitionId: string; skillMode: "PROGRESSIVE" | "BINARY" }>;
  return { speedRating: 4 as const, initiativeRating: 4 as const, attitudeRating: 4 as const, availabilityRating: 4 as const, textFeedback: "", skills: baseline.map((skill) => ({ skillDefinitionId: skill.skillDefinitionId, status: skill.skillMode === "BINARY" ? "CanDo" as const : "Independent" as const })) };
}
