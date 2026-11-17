import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RosterIntegrationService } from "../src/rosterIntegrationService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;
const schemaName = `codex_workforce_revision_${process.pid}_${Date.now()}`;
let rootDb: PrismaClient;
let db: PrismaClient;

describeDatabase.sequential("paginated workforce revision", () => {
  beforeAll(async () => {
    const rootUrl = new URL(process.env.DATABASE_URL ?? "");
    if (!(["localhost", "127.0.0.1"].includes(rootUrl.hostname)
      && rootUrl.port === "5432" && rootUrl.pathname === "/evaluate_molly"
      && (rootUrl.searchParams.get("schema") ?? "public") === "public")) {
      throw new Error("Workforce revision test requires the local Evaluate development database.");
    }
    const isolatedUrl = new URL(rootUrl);
    isolatedUrl.searchParams.set("schema", schemaName);
    rootDb = new PrismaClient({ datasourceUrl: rootUrl.toString() });
    await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolatedUrl.toString() }, stdio: "pipe", timeout: 90_000,
    });
    db = new PrismaClient({ datasourceUrl: isolatedUrl.toString() });
    await db.store.createMany({ data: [
      { id: "revision-store-a", name: "Revision A", region: "Sydney", managerName: "Manager", city: "Sydney" },
      { id: "revision-store-b", name: "Revision B", region: "Sydney", managerName: "Manager", city: "Sydney" },
    ] });
    await db.employee.createMany({ data: [
      { id: "revision-a", storeId: "revision-store-a", displayName: "Alice", employmentType: "FullTime" },
      { id: "revision-b", storeId: "revision-store-a", displayName: "Bob", employmentType: "FullTime" },
      { id: "revision-c", storeId: "revision-store-b", displayName: "Cara", employmentType: "FullTime" },
    ] });
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (rootDb && /^codex_workforce_revision_[0-9_]+$/.test(schemaName)) {
      await rootDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await rootDb.$disconnect();
    }
  }, 30_000);

  it("keeps one revision across stable pages and changes it after rename and same-count transfer", async () => {
    const service = new RosterIntegrationService(db);
    const first = await service.listEmployees("revision-store-a", ["revision-store-a"], 1, 1);
    const second = await service.listEmployees("revision-store-a", ["revision-store-a"], 2, 1);
    expect(first.contractVersion).toBe("1.4.0");
    expect(first.pagination?.total).toBe(2);
    expect(second.pagination?.total).toBe(2);
    expect(first.workforceRevision).toBe(second.workforceRevision);

    await db.employee.update({ where: { id: "revision-b" }, data: { displayName: "Bobby" } });
    const renamed = await service.listEmployees("revision-store-a", ["revision-store-a"], 1, 1);
    expect(renamed.pagination?.total).toBe(2);
    expect(renamed.workforceRevision).not.toBe(first.workforceRevision);

    await db.$transaction([
      db.employee.update({ where: { id: "revision-b" }, data: { storeId: "revision-store-b" } }),
      db.employee.update({ where: { id: "revision-c" }, data: { storeId: "revision-store-a" } }),
    ]);
    const transferred = await service.listEmployees("revision-store-a", ["revision-store-a"], 1, 1);
    expect(transferred.pagination?.total).toBe(2);
    expect(transferred.workforceRevision).not.toBe(renamed.workforceRevision);
    expect((await service.listEmployees("revision-store-a", ["revision-store-a"])).employees.map((employee) => employee.id)).toEqual(["revision-a", "revision-c"]);
  });
});
