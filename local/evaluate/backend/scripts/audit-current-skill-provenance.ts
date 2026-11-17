import "dotenv/config";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5432" || target.pathname !== "/evaluate_molly" || (target.searchParams.get("schema") ?? "public") !== "public") {
  throw new Error("This read-only provenance audit is restricted to the local Evaluate development database.");
}

const db = new PrismaClient();
try {
  const [current, accounts, snapshots] = await Promise.all([
    db.employeeSkill.findMany({
      select: { employeeId: true, skillDefinitionId: true, skillDefinition: { select: { code: true } }, status: true, updatedBy: true, updatedAt: true },
    }),
    db.userAccount.findMany({ select: { id: true, role: true } }),
    db.evaluationSkillSnapshot.findMany({
      where: { evaluation: { submittedAt: { not: null } } },
      select: {
        id: true,
        skillDefinitionId: true,
        status: true,
        createdAt: true,
        evaluation: { select: { id: true, employeeId: true, evaluatorAccountId: true, submittedAt: true } },
      },
    }),
  ]);

  const roles = new Map(accounts.map(({ id, role }) => [id, role]));
  const byActorAndSkill = new Map<string, typeof snapshots>();
  for (const snapshot of snapshots) {
    const actor = snapshot.evaluation.evaluatorAccountId;
    if (!actor || !snapshot.skillDefinitionId) continue;
    const key = `${snapshot.evaluation.employeeId}\u0000${snapshot.skillDefinitionId}\u0000${actor}`;
    const group = byActorAndSkill.get(key) ?? [];
    group.push(snapshot);
    byActorAndSkill.set(key, group);
  }

  const result = {
    currentRows: current.length,
    submittedSkillSnapshots: snapshots.length,
    provenance: { admin: 0, evaluator: 0, migration: 0, missingOrOther: 0 },
    currentRowsWithSameActorStatusSnapshotWithin60Seconds: 0,
    currentRowsWithSameActorAnyStatusSnapshotWithin60Seconds: 0,
    currentRowsWithConflictingSameActorSnapshotWithin60Seconds: 0,
    distinctEmployeesWithTemporalMatch: new Set<string>(),
  };
  const reviewRows: string[][] = [];
  const conflictRows: string[][] = [];

  for (const row of current) {
    const role = row.updatedBy ? roles.get(row.updatedBy) : undefined;
    if (role === "ADMIN") result.provenance.admin++;
    else if (role === "STORE_EVALUATOR") result.provenance.evaluator++;
    else if (row.updatedBy === "qualification-to-skill-migration") result.provenance.migration++;
    else result.provenance.missingOrOther++;
    if (!row.updatedBy) continue;

    const key = `${row.employeeId}\u0000${row.skillDefinitionId}\u0000${row.updatedBy}`;
    const nearby = (byActorAndSkill.get(key) ?? []).filter((snapshot) =>
      Math.abs(snapshot.createdAt.getTime() - row.updatedAt.getTime()) <= 60_000 ||
      (snapshot.evaluation.submittedAt && Math.abs(snapshot.evaluation.submittedAt.getTime() - row.updatedAt.getTime()) <= 60_000),
    );
    if (!nearby.length) continue;
    const nearest = nearby.reduce((best, snapshot) =>
      Math.abs(snapshot.createdAt.getTime() - row.updatedAt.getTime()) < Math.abs(best.createdAt.getTime() - row.updatedAt.getTime()) ? snapshot : best,
    );
    reviewRows.push([
      row.employeeId,
      row.skillDefinition.code,
      row.status,
      row.updatedAt.toISOString(),
      row.updatedBy,
      role ?? "UNKNOWN",
      nearest.evaluation.id,
      nearest.id,
      nearest.status,
      nearest.createdAt.toISOString(),
      String(Math.round(Math.abs(nearest.createdAt.getTime() - row.updatedAt.getTime()) / 1000)),
    ]);
    result.currentRowsWithSameActorAnyStatusSnapshotWithin60Seconds++;
    result.distinctEmployeesWithTemporalMatch.add(row.employeeId);
    if (nearby.some((snapshot) => snapshot.status === row.status)) result.currentRowsWithSameActorStatusSnapshotWithin60Seconds++;
    const conflicting = nearby.filter((snapshot) => snapshot.status !== row.status);
    if (conflicting.length) {
      result.currentRowsWithConflictingSameActorSnapshotWithin60Seconds++;
      conflictRows.push([
        row.employeeId, row.skillDefinition.code, row.status, row.updatedAt.toISOString(),
        row.updatedBy, role ?? "UNKNOWN",
        ...conflicting.map((snapshot) => [snapshot.evaluation.id, snapshot.id, snapshot.status, snapshot.createdAt.toISOString()].join("|")),
      ]);
    }
  }

  let reviewFile: string | null = null;
  let reviewSha256: string | null = null;
  let conflictFile: string | null = null;
  let conflictSha256: string | null = null;
  if (process.argv.includes("--write-review")) {
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    reviewFile = resolve(projectRoot, ".deployment-local", "current-skill-provenance-review-20261009.csv");
    const header = ["employeeId", "skillCode", "currentStatus", "currentUpdatedAt", "updatedByAccountId", "updatedByRole", "nearestEvaluationId", "nearestSnapshotId", "nearestSnapshotStatus", "nearestSnapshotCreatedAt", "absoluteSecondsApart"];
    const csv = [header, ...reviewRows.sort((a, b) => a[0]!.localeCompare(b[0]!) || a[1]!.localeCompare(b[1]!))]
      .map((values) => values.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
      .join("\n") + "\n";
    await writeFile(reviewFile, csv, { encoding: "utf8", flag: "wx", mode: 0o600 });
    reviewSha256 = createHash("sha256").update(csv).digest("hex");
  }
  if (process.argv.includes("--write-conflicts")) {
    const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    conflictFile = resolve(projectRoot, ".deployment-local", "current-skill-conflict-review-20261009.csv");
    const header = ["employeeId", "skillCode", "currentStatus", "currentUpdatedAt", "updatedByAccountId", "updatedByRole", "conflictingEvaluationSnapshotStatusAndTime"];
    const csv = [header, ...conflictRows.sort((a, b) => a[0]!.localeCompare(b[0]!) || a[1]!.localeCompare(b[1]!))
      .map((row) => [row[0]!, row[1]!, row[2]!, row[3]!, row[4]!, row[5]!, row.slice(6).join("; ")])]
      .map((values) => values.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))
      .join("\n") + "\n";
    await writeFile(conflictFile, csv, { encoding: "utf8", flag: "wx", mode: 0o600 });
    conflictSha256 = createHash("sha256").update(csv).digest("hex");
  }

  console.log(JSON.stringify({
    ...result,
    distinctEmployeesWithTemporalMatch: result.distinctEmployeesWithTemporalMatch.size,
    reviewRows: reviewRows.length,
    reviewFile,
    reviewSha256,
    conflictRows: conflictRows.length,
    conflictFile,
    conflictSha256,
    interpretation: "Temporal matches are review candidates, not proof that a current official skill is incorrect. No rows were modified.",
  }, null, 2));
} finally {
  await db.$disconnect();
}
