import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const statePath = join(tmpdir(), "evaluate-molly-browser-acceptance.json");
const state = JSON.parse(await readFile(statePath, "utf8")) as { isolatedUrl: string };
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [rounds, evaluations, memberships, employees] = await Promise.all([
    db.evaluationRound.findMany({
      orderBy: [{ employeeId: "asc" }, { roundNumber: "asc" }],
      select: { id: true, employeeId: true, roundNumber: true, status: true, closedAt: true, finalAggregateOverall: true },
    }),
    db.evaluation.findMany({
      orderBy: [{ roundId: "asc" }, { evaluatorAccountId: "asc" }],
      select: { id: true, roundId: true, evaluatorAccountId: true, evaluatorRoleSnapshot: true, evaluationStatus: true, overallScoreV1: true, version: true },
    }),
    db.evaluationRoundEvaluator.findMany({ select: { roundId: true, evaluatorAccountId: true, excludedAt: true } }),
    db.employee.findMany({ orderBy: { id: "asc" }, select: { id: true, employeeType: true, status: true } }),
  ]);
  console.log(JSON.stringify({ rounds, evaluations, memberships, employees }));
} finally {
  await db.$disconnect();
}
