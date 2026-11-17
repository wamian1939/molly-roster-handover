import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.pathname !== "/evaluate_molly" || (target.searchParams.get("schema") ?? "public") !== "public") {
  throw new Error("This read-only history audit is restricted to the local Evaluate development database.");
}

const db = new PrismaClient();
try {
  const rounds = await db.evaluationRound.findMany({
    where: { status: "CLOSED" },
    select: {
      employeeId: true,
      employeeDisplayNameSnapshot: true,
      storeNameSnapshot: true,
      employeeJobsSnapshot: true,
      employee: { select: { displayName: true } },
      store: { select: { name: true } },
      evaluations: { select: { employeeNameSnapshot: true, storeNameSnapshot: true } },
    },
  });
  const missingEmployeeName = rounds.filter((round) => round.employeeDisplayNameSnapshot == null);
  const missingStoreName = rounds.filter((round) => round.storeNameSnapshot == null);
  const missingJobs = rounds.filter((round) => round.employeeJobsSnapshot == null);
  const distinct = (values: Array<string | null>) => [...new Set(values.filter((value): value is string => value !== null))];
  const countEvaluationEvidence = (items: typeof rounds, field: "employeeNameSnapshot" | "storeNameSnapshot") => ({
    none: items.filter((round) => distinct(round.evaluations.map((evaluation) => evaluation[field])).length === 0).length,
    one: items.filter((round) => distinct(round.evaluations.map((evaluation) => evaluation[field])).length === 1).length,
    conflicting: items.filter((round) => distinct(round.evaluations.map((evaluation) => evaluation[field])).length > 1).length,
  });
  console.log(JSON.stringify({
    closedRounds: rounds.length,
    missingEmployeeNameSnapshot: missingEmployeeName.length,
    missingStoreNameSnapshot: missingStoreName.length,
    missingJobsSnapshot: missingJobs.length,
    missingEmployeeNameEvaluationEvidence: countEvaluationEvidence(missingEmployeeName, "employeeNameSnapshot"),
    missingStoreNameEvaluationEvidence: countEvaluationEvidence(missingStoreName, "storeNameSnapshot"),
    uniqueEvaluationEmployeeNameDiffersFromCurrent: missingEmployeeName.filter((round) => {
      const names = distinct(round.evaluations.map((evaluation) => evaluation.employeeNameSnapshot));
      return names.length === 1 && names[0] !== round.employee.displayName;
    }).length,
    uniqueEvaluationStoreNameDiffersFromCurrent: missingStoreName.filter((round) => {
      const names = distinct(round.evaluations.map((evaluation) => evaluation.storeNameSnapshot));
      return names.length === 1 && names[0] !== round.store.name;
    }).length,
    interpretation: "Individual evaluation labels do not prove the employee/store names or jobs at Round close. This script reads only and does not backfill history.",
  }, null, 2));
} finally {
  await db.$disconnect();
}
