import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmployeeService } from "../src/employeeService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;
const schemaName = `codex_archive_check_${process.pid}_${Date.now()}`;
let rootDb: PrismaClient;
let db: PrismaClient;

describeDatabase.sequential("employee archive status database constraint", () => {
  beforeAll(async () => {
    const rootUrl = new URL(process.env.DATABASE_URL ?? "");
    if (!(["localhost", "127.0.0.1"].includes(rootUrl.hostname) && rootUrl.port === "5432" && rootUrl.pathname === "/evaluate_molly")) {
      throw new Error("Archive constraint database test requires the local Evaluate development database.");
    }
    if (!/^codex_archive_check_[a-zA-Z0-9_]+$/.test(schemaName)) throw new Error("Unsafe integration-test schema name.");
    const isolatedUrl = new URL(rootUrl);
    isolatedUrl.searchParams.set("schema", schemaName);
    rootDb = new PrismaClient({ datasourceUrl: rootUrl.toString() });
    await rootDb.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}"`);
    execFileSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy"], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolatedUrl.toString() }, stdio: "pipe", timeout: 90_000,
    });
    db = new PrismaClient({ datasourceUrl: isolatedUrl.toString() });
    await db.store.create({ data: { id: "archive-test-store", name: "Archive Test Store", region: "Sydney", managerName: "Manager", city: "Sydney" } });
    await db.employee.create({ data: { id: "archive-test-employee", storeId: "archive-test-store", displayName: "Archive Test", employmentType: "PartTime" } });
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (rootDb && /^codex_archive_check_[a-zA-Z0-9_]+$/.test(schemaName)) {
      await rootDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await rootDb.$disconnect();
    }
  }, 30_000);

  it("rejects inconsistent status/timestamp writes but permits archive and restore", async () => {
    await expect(db.employee.update({ where: { id: "archive-test-employee" }, data: { archivedAt: new Date() } })).rejects.toThrow();
    await expect(db.employee.update({ where: { id: "archive-test-employee" }, data: { status: "Archived" } })).rejects.toThrow();
    const service = new EmployeeService(db);
    const archived = await service.archiveEmployee("archive-test-employee");
    expect(archived.id).toBe("archive-test-employee");
    expect((await db.employee.findUniqueOrThrow({ where: { id: archived.id } })).archivedAt).not.toBeNull();
    await service.restoreEmployee("archive-test-employee");
    const restored = await db.employee.findUniqueOrThrow({ where: { id: archived.id } });
    expect(restored.status).toBe("Active");
    expect(restored.archivedAt).toBeNull();
  });

  it("can roll back constraint removal and data writes together", async () => {
    await expect(db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "employees" DROP CONSTRAINT "employees_archive_state_check"');
      await tx.employee.update({ where: { id: "archive-test-employee" }, data: { archivedAt: new Date() } });
      throw new Error("ROLLBACK_PROBE");
    })).rejects.toThrow("ROLLBACK_PROBE");
    expect((await db.employee.findUniqueOrThrow({ where: { id: "archive-test-employee" } })).archivedAt).toBeNull();
    await expect(db.employee.update({ where: { id: "archive-test-employee" }, data: { archivedAt: new Date() } })).rejects.toThrow();
  });
});
