import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmployeeService } from "../src/employeeService.js";

const describeDatabase = process.env.RUN_DATABASE_TESTS === "1" ? describe : describe.skip;
const schemaName = `codex_transfer_jobs_${process.pid}_${Date.now()}`;
let rootDb: PrismaClient;
let db: PrismaClient;

describeDatabase.sequential("employee transfer with target-store positions", () => {
  beforeAll(async () => {
    const rootUrl = new URL(process.env.DATABASE_URL ?? "");
    if (!(["localhost", "127.0.0.1"].includes(rootUrl.hostname)
      && rootUrl.port === "5432" && rootUrl.pathname === "/evaluate_molly"
      && (rootUrl.searchParams.get("schema") ?? "public") === "public")) {
      throw new Error("Transfer integration test requires the local Evaluate development database.");
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
      { id: "transfer-store-a", name: "Transfer A", region: "Sydney", managerName: "Manager", city: "Sydney" },
      { id: "transfer-store-b", name: "Transfer B", region: "Sydney", managerName: "Manager", city: "Sydney" },
    ] });
    await db.storeJobDefinition.createMany({ data: [
      { id: "transfer-job-a", storeId: "transfer-store-a", name: "A Position" },
      { id: "transfer-job-b", storeId: "transfer-store-b", name: "B Position" },
    ] });
    await db.employee.create({ data: {
      id: "transfer-employee", storeId: "transfer-store-a", displayName: "Transfer Fixture", employmentType: "FullTime",
      jobAssignments: { create: { jobId: "transfer-job-a" } },
    } });
  }, 120_000);

  afterAll(async () => {
    await db?.$disconnect();
    if (rootDb && /^codex_transfer_jobs_[0-9_]+$/.test(schemaName)) {
      await rootDb.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await rootDb.$disconnect();
    }
  }, 30_000);

  it("creates a canonical employee with an explicitly selected current-store position", async () => {
    const service = new EmployeeService(db);
    const created = await service.createEmployee({
      id: "new-position-employee", storeId: "transfer-store-a", displayName: "New Position Fixture",
      employmentType: "Full-time", employeeType: "REGULAR", jobIds: ["transfer-job-a"],
    });
    expect(created.id).toBe("new-position-employee");
    expect(created.jobs.map((job) => job.id)).toEqual(["transfer-job-a"]);
    expect((await db.employeeJobAssignment.findUniqueOrThrow({
      where: { employeeId_jobId: { employeeId: created.id, jobId: "transfer-job-a" } },
    })).storeId).toBe("transfer-store-a");
  });

  it("keeps the canonical ID while replacing the old-store position atomically", async () => {
    const service = new EmployeeService(db);
    const updated = await service.updateEmployee("transfer-employee", { storeId: "transfer-store-b", jobIds: ["transfer-job-b"] });
    expect(updated.id).toBe("transfer-employee");
    expect(updated.storeId).toBe("transfer-store-b");
    expect(updated.jobs.map((job) => job.id)).toEqual(["transfer-job-b"]);
    const employee = await db.employee.findUniqueOrThrow({ where: { id: "transfer-employee" }, include: { jobAssignments: true } });
    expect(employee.jobAssignments.map((assignment) => [assignment.jobId, assignment.storeId])).toEqual([["transfer-job-b", "transfer-store-b"]]);
    await expect(service.updateEmployee("transfer-employee", { storeId: "transfer-store-a", jobIds: ["transfer-job-b"] })).rejects.toMatchObject({ status: 409 });
    expect((await db.employee.findUniqueOrThrow({ where: { id: "transfer-employee" } })).storeId).toBe("transfer-store-b");
  });

  it("rejects a stale concurrent transfer without losing the winning position", async () => {
    await db.employee.create({ data: {
      id: "concurrent-transfer-employee", storeId: "transfer-store-a", displayName: "Concurrent Transfer",
      employmentType: "FullTime", jobAssignments: { create: { jobId: "transfer-job-a" } },
    } });
    const version = (await db.employee.findUniqueOrThrow({ where: { id: "concurrent-transfer-employee" } })).updatedAt.toISOString();
    const service = new EmployeeService(db);
    const results = await Promise.allSettled([
      service.updateEmployee("concurrent-transfer-employee", {
        storeId: "transfer-store-b", jobIds: ["transfer-job-b"], expectedUpdatedAt: version,
      }),
      service.updateEmployee("concurrent-transfer-employee", {
        displayName: "Stale Name", expectedUpdatedAt: version,
      }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const employee = await db.employee.findUniqueOrThrow({
      where: { id: "concurrent-transfer-employee" }, include: { jobAssignments: true },
    });
    expect(employee.jobAssignments).toHaveLength(1);
    expect(employee.jobAssignments[0]?.storeId).toBe(employee.storeId);
  });

  it("does not create an employee after its store is archived between preflight and write", async () => {
    await db.store.create({ data: {
      id: "create-race-store", name: "Create Race", region: "Sydney", managerName: "Manager", city: "Sydney",
    } });
    const staleStoreDb = {
      store: { findUnique: async (args: Parameters<typeof db.store.findUnique>[0]) => {
        const snapshot = await db.store.findUnique(args);
        await db.store.update({ where: { id: "create-race-store" }, data: { isActive: false, archivedAt: new Date() } });
        return snapshot;
      } },
      employee: db.employee,
      storeJobDefinition: db.storeJobDefinition,
      $transaction: db.$transaction.bind(db),
    } as unknown as PrismaClient;
    const service = new EmployeeService(staleStoreDb);
    await expect(service.createEmployee({
      id: "create-race-employee", storeId: "create-race-store", displayName: "Create Race",
      employmentType: "Full-time", employeeType: "REGULAR",
    })).rejects.toMatchObject({ status: 409 });
    expect(await db.employee.findUnique({ where: { id: "create-race-employee" } })).toBeNull();
  });

  it("does not transfer an employee into a store archived after preflight", async () => {
    await db.store.create({ data: {
      id: "transfer-race-store", name: "Transfer Race", region: "Sydney", managerName: "Manager", city: "Sydney",
    } });
    await db.employee.create({ data: {
      id: "transfer-race-employee", storeId: "transfer-store-a", displayName: "Transfer Race",
      employmentType: "FullTime", jobAssignments: { create: { jobId: "transfer-job-a" } },
    } });
    const staleStoreDb = {
      store: { findUnique: async (args: Parameters<typeof db.store.findUnique>[0]) => {
        const snapshot = await db.store.findUnique(args);
        await db.store.update({ where: { id: "transfer-race-store" }, data: { isActive: false, archivedAt: new Date() } });
        return snapshot;
      } },
      employee: db.employee,
      employeeJobAssignment: db.employeeJobAssignment,
      storeJobDefinition: db.storeJobDefinition,
      $transaction: db.$transaction.bind(db),
    } as unknown as PrismaClient;
    await expect(new EmployeeService(staleStoreDb).updateEmployee("transfer-race-employee", {
      storeId: "transfer-race-store",
    })).rejects.toMatchObject({ status: 409 });
    const employee = await db.employee.findUniqueOrThrow({
      where: { id: "transfer-race-employee" }, include: { jobAssignments: true },
    });
    expect(employee.storeId).toBe("transfer-store-a");
    expect(employee.jobAssignments.map((assignment) => assignment.jobId)).toEqual(["transfer-job-a"]);
  });

  it("does not restore an employee into a store archived after preflight", async () => {
    await db.store.create({ data: {
      id: "restore-race-store", name: "Restore Race", region: "Sydney", managerName: "Manager", city: "Sydney",
    } });
    await db.employee.create({ data: {
      id: "restore-race-employee", storeId: "restore-race-store", displayName: "Restore Race",
      employmentType: "FullTime", status: "Archived", archivedAt: new Date(),
    } });
    const staleStoreDb = {
      store: { findUnique: async (args: Parameters<typeof db.store.findUnique>[0]) => {
        const snapshot = await db.store.findUnique(args);
        await db.store.update({ where: { id: "restore-race-store" }, data: { isActive: false, archivedAt: new Date() } });
        return snapshot;
      } },
      employee: db.employee,
      $transaction: db.$transaction.bind(db),
    } as unknown as PrismaClient;
    await expect(new EmployeeService(staleStoreDb).restoreEmployee("restore-race-employee"))
      .rejects.toMatchObject({ status: 409 });
    expect((await db.employee.findUniqueOrThrow({ where: { id: "restore-race-employee" } })).status).toBe("Archived");
  });

  it("does not promote an employee archived after the active-status check", async () => {
    await db.employee.create({ data: {
      id: "promote-race-employee", storeId: "transfer-store-a", displayName: "Promote Race",
      employmentType: "FullTime", employeeType: "TRAINING",
    } });
    const staleEmployeeDb = {
      employee: {
        findUnique: async (args: Parameters<typeof db.employee.findUnique>[0]) => {
          const snapshot = await db.employee.findUnique(args);
          await db.employee.update({
            where: { id: "promote-race-employee" }, data: { status: "Archived", archivedAt: new Date() },
          });
          return snapshot;
        },
        update: db.employee.update,
        updateMany: db.employee.updateMany,
        findUniqueOrThrow: db.employee.findUniqueOrThrow,
      },
      $transaction: db.$transaction.bind(db),
      store: db.store,
    } as unknown as PrismaClient;
    await expect(new EmployeeService(staleEmployeeDb).promoteToRegular("promote-race-employee"))
      .rejects.toMatchObject({ status: 409 });
    const employee = await db.employee.findUniqueOrThrow({ where: { id: "promote-race-employee" } });
    expect([employee.status, employee.employeeType]).toEqual(["Archived", "TRAINING"]);
  });

  it("does not promote an active employee whose store is archived", async () => {
    await db.store.create({ data: {
      id: "promote-archived-store", name: "Promote Archived", region: "Sydney", managerName: "Manager", city: "Sydney",
    } });
    await db.employee.create({ data: {
      id: "promote-archived-employee", storeId: "promote-archived-store", displayName: "Promote Archived",
      employmentType: "FullTime", employeeType: "TRAINING",
    } });
    await db.store.update({ where: { id: "promote-archived-store" }, data: { isActive: false, archivedAt: new Date() } });
    await expect(new EmployeeService(db).promoteToRegular("promote-archived-employee"))
      .rejects.toMatchObject({ status: 409 });
    expect((await db.employee.findUniqueOrThrow({ where: { id: "promote-archived-employee" } })).employeeType)
      .toBe("TRAINING");
  });

  it("returns a conflict when two requests create the same canonical employee ID", async () => {
    let reads = 0;
    let releaseReads: () => void = () => {};
    const bothRead = new Promise<void>((resolve) => { releaseReads = resolve; });
    const concurrentDb = {
      employee: { findUnique: async (args: Parameters<typeof db.employee.findUnique>[0]) => {
        const row = await db.employee.findUnique(args);
        reads += 1;
        if (reads === 2) releaseReads();
        await bothRead;
        return row;
      } },
      store: db.store,
      storeJobDefinition: db.storeJobDefinition,
      $transaction: db.$transaction.bind(db),
    } as unknown as PrismaClient;
    const service = new EmployeeService(concurrentDb);
    const payload = {
      id: "duplicate-race-employee", storeId: "transfer-store-a", displayName: "Duplicate Race",
      employmentType: "Full-time" as const, employeeType: "REGULAR" as const,
    };
    const results = await Promise.allSettled([service.createEmployee(payload), service.createEmployee(payload)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect(await db.employee.count({ where: { id: payload.id } })).toBe(1);
  });
});
