import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import "dotenv/config";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;
const schemaName = `codex_shift_skill_${process.pid}_${Date.now()}`;
const rootUrl = process.env.DATABASE_URL ?? "";
let rootDb: PrismaClient;
let db: PrismaClient;
let statements: string[];

describeDatabase.sequential("built-in shift-role skill code migration", () => {
  beforeAll(async () => {
    if (!rootUrl) throw new Error("DATABASE_URL is required.");
    if (!/^codex_shift_skill_[0-9_]+$/.test(schemaName)) throw new Error("Unsafe test schema name.");
    const url = new URL(rootUrl);
    url.searchParams.set("schema", schemaName);
    rootDb = new PrismaClient({ datasourceUrl: rootUrl });
    await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url.toString() }, stdio: "pipe", timeout: 90_000,
    });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.shiftRole.createMany({ data: [
      { id: "legacy-front", storeId: null, code: "front", nameZh: "Front", colorToken: "#2563eb", requiredSkillCodes: ["handoff", "delivery-packing", "drink-handoff", "order-taking"] },
      { id: "legacy-water", storeId: null, code: "water-bar", nameZh: "Water", colorToken: "#0f766e", requiredSkillCodes: ["cup-labeling", "order-scanning", "ice-station", "cup-finishing"] },
      { id: "custom-front", storeId: "store-custom", code: "front", nameZh: "Custom Front", colorToken: "#2563eb", requiredSkillCodes: ["handoff"] },
    ] });
    const migration = await readFile(resolve("prisma/migrations/20261008140000_align_default_shift_role_skill_codes/migration.sql"), "utf8");
    statements = migration.split(";").map((part) => part.trim()).filter((part) => part.includes("UPDATE \"shift_roles\""));
    if (statements.length !== 2) throw new Error("Expected exactly two conditional updates.");
  }, 90_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (rootDb && /^codex_shift_skill_[0-9_]+$/.test(schemaName)) {
      await rootDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await rootDb.$disconnect();
    }
  }, 30_000);

  it("rolls back cleanly, then updates only old global defaults and is idempotent", async () => {
    await expect(db.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
      throw new Error("rollback rehearsal");
    })).rejects.toThrow("rollback rehearsal");
    expect((await db.shiftRole.findUniqueOrThrow({ where: { id: "legacy-front" } })).requiredSkillCodes[0]).toBe("handoff");

    for (const statement of statements) await db.$executeRawUnsafe(statement);
    const front = await db.shiftRole.findUniqueOrThrow({ where: { id: "legacy-front" } });
    const water = await db.shiftRole.findUniqueOrThrow({ where: { id: "legacy-water" } });
    const custom = await db.shiftRole.findUniqueOrThrow({ where: { id: "custom-front" } });
    expect(front.requiredSkillCodes).toEqual(["transfer-station", "delivery-packing", "drink-dispatch", "order-taking"]);
    expect(water.requiredSkillCodes).toEqual(["cup-labeling", "code-scanning", "ice-adding", "cup-spinning"]);
    expect(custom.requiredSkillCodes).toEqual(["handoff"]);
    expect([front.version, water.version, custom.version]).toEqual([2, 2, 1]);

    for (const statement of statements) await db.$executeRawUnsafe(statement);
    expect((await db.shiftRole.findUniqueOrThrow({ where: { id: "legacy-front" } })).version).toBe(2);
  }, 30_000);
});
