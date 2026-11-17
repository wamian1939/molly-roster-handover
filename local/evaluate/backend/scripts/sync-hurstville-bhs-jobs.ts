import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

// This one-time local catalog operation defines jobs only. Employee position
// assignments remain a separate managerial decision in Evaluate Molly.
const desired = [
  { name: "带训员", code: "trainer", displayOrder: 10, colorToken: "violet" },
  { name: "莉小白", code: "li-xiaobai", displayOrder: 20, colorToken: "slate" },
  { name: "前台", code: "front-counter", displayOrder: 30, colorToken: "slate" },
  { name: "培训", code: "training", displayOrder: 40, colorToken: "slate" },
  { name: "后厨", code: "back-kitchen", displayOrder: 50, colorToken: "slate" },
  { name: "全岗", code: "full-role", displayOrder: 60, colorToken: "teal" },
] as const;

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply") || args.filter((arg) => arg === "--apply").length > 1) {
  throw new Error("Usage: tsx scripts/sync-hurstville-bhs-jobs.ts [--apply]");
}
const apply = args.includes("--apply");
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const target = new URL(databaseUrl);
if (!(["localhost", "127.0.0.1"].includes(target.hostname)
  && target.port === "5432" && target.pathname === "/evaluate_molly"
  && (target.searchParams.get("schema") ?? "public") === "public")) {
  throw new Error("Only the local Evaluate Molly public development database is allowed");
}

const db = new PrismaClient();
try {
  const store = await db.store.findUnique({ where: { id: "hurstville" }, select: { id: true, name: true, isActive: true } });
  if (!store || store.name !== "Hurstville" || !store.isActive) throw new Error("Unexpected Hurstville store");
  const before = await db.storeJobDefinition.findMany({
    where: { storeId: store.id },
    select: { id: true, name: true, code: true, displayOrder: true, colorToken: true, isActive: true,
      _count: { select: { assignments: true } } },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  const allowedNames = new Set(desired.map((job) => job.name));
  if (before.some((job) => !allowedNames.has(job.name as typeof desired[number]["name"]))) {
    throw new Error("Unexpected existing Hurstville job; review catalog before applying");
  }
  for (const existingName of ["全岗", "带训员"]) {
    if (!before.some((job) => job.name === existingName)) throw new Error(`Missing established job ${existingName}`);
  }
  for (const job of desired) {
    const existing = before.find((row) => row.name === job.name);
    if (existing && (existing.code !== job.code || !existing.isActive)) {
      throw new Error(`Existing ${job.name} differs in code or active state; manual review required`);
    }
    if (before.some((row) => row.name !== job.name && row.code === job.code)) {
      throw new Error(`Code ${job.code} is already used by another Hurstville job`);
    }
  }
  const beforeAssignmentCount = before.reduce((sum, job) => sum + job._count.assignments, 0);
  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", storeId: store.id,
      current: before.map((job) => ({ name: job.name, code: job.code, displayOrder: job.displayOrder,
        assignments: job._count.assignments })), desired, assignmentCount: beforeAssignmentCount }, null, 2));
  } else {
    const backup = join(tmpdir(), `evaluate-hurstville-jobs-before-${Date.now()}.json`);
    await writeFile(backup, JSON.stringify({ store, jobs: before, assignmentCount: beforeAssignmentCount }, null, 2), { flag: "wx" });
    await db.$transaction(async (tx) => {
      const current = await tx.storeJobDefinition.findMany({ where: { storeId: store.id },
        select: { id: true, name: true, code: true, isActive: true, displayOrder: true } });
      if (current.length !== before.length || current.some((job) => {
        const prior = before.find((row) => row.id === job.id);
        return !prior || prior.name !== job.name || prior.code !== job.code
          || prior.isActive !== job.isActive || prior.displayOrder !== job.displayOrder;
      })) throw new Error("Job catalog changed since preflight");
      for (const job of desired) {
        const existing = current.find((row) => row.name === job.name);
        if (existing) {
          if (existing.displayOrder !== job.displayOrder) {
            await tx.storeJobDefinition.update({ where: { id: existing.id }, data: { displayOrder: job.displayOrder } });
          }
        } else {
          await tx.storeJobDefinition.create({ data: { storeId: store.id, ...job } });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const after = await db.storeJobDefinition.findMany({ where: { storeId: store.id },
      select: { id: true, name: true, code: true, displayOrder: true, isActive: true,
        _count: { select: { assignments: true } } }, orderBy: { displayOrder: "asc" } });
    if (after.length !== desired.length || after.some((job, index) =>
      job.name !== desired[index]?.name || job.code !== desired[index]?.code
      || job.displayOrder !== desired[index]?.displayOrder || !job.isActive)
      || after.reduce((sum, job) => sum + job._count.assignments, 0) !== beforeAssignmentCount) {
      throw new Error("Post-write catalog verification failed; inspect backup and database");
    }
    console.log(JSON.stringify({ mode: "applied", storeId: store.id, backup,
      jobs: after.map((job) => ({ id: job.id, name: job.name, code: job.code,
        displayOrder: job.displayOrder, assignments: job._count.assignments })),
      assignmentCountBefore: beforeAssignmentCount,
      assignmentCountAfter: after.reduce((sum, job) => sum + job._count.assignments, 0) }, null, 2));
  }
} finally {
  await db.$disconnect();
}
