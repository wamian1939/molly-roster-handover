import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8")) as {
  schema: string;
  isolatedUrl: string;
};
const target = new URL(state.isolatedUrl);
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema)
  || target.searchParams.get("schema") !== state.schema
  || !["localhost", "127.0.0.1"].includes(target.hostname)
  || target.pathname !== "/evaluate_molly") {
  throw new Error("History benchmark requires the local disposable acceptance schema.");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
const predicate = `"status" = 'CLOSED' AND "employeeJobsSnapshot" @> '[{"id":"bench-job"}]'::jsonb`;
const countSql = `SELECT count(*)::integer AS count FROM "evaluation_rounds" WHERE ${predicate}`;
const pageSql = `SELECT "id" FROM "evaluation_rounds" WHERE ${predicate}
  ORDER BY "closedAt" DESC, "createdAt" DESC, "id" DESC LIMIT 25`;

try {
  const employees = await db.employee.count({ where: { id: { startsWith: "bench-" } } });
  const rounds = await db.evaluationRound.count({ where: { employeeId: { startsWith: "bench-" } } });
  if (employees !== 500 || rounds !== 5000) {
    throw new Error("First seed a fresh disposable schema with benchmark-latest-score-query.ts.");
  }
  const measure = async (sql: string) => {
    const times: number[] = [];
    let plan: unknown;
    for (let i = 0; i < 5; i++) {
      const result = await db.$queryRawUnsafe<Array<{ "QUERY PLAN": Array<{ "Execution Time": number; Plan: unknown }> }>>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
      );
      times.push(result[0]["QUERY PLAN"][0]["Execution Time"]);
      plan = result[0]["QUERY PLAN"][0].Plan;
    }
    return { medianMs: times.sort((a, b) => a - b)[2], plan };
  };
  const countBefore = await measure(countSql);
  const pageBefore = await measure(pageSql);
  const expectedCount = await db.$queryRawUnsafe<Array<{ count: number }>>(countSql);
  const expectedIds = await db.$queryRawUnsafe<Array<{ id: string }>>(pageSql);
  if (expectedCount[0]?.count !== 500 || expectedIds.length !== 25) {
    throw new Error("Unexpected history fixture cardinality.");
  }
  await db.$executeRawUnsafe(`CREATE INDEX "evaluation_rounds_employeeJobsSnapshot_idx"
    ON "evaluation_rounds" USING GIN ("employeeJobsSnapshot" jsonb_path_ops)`);
  await db.$executeRaw`ANALYZE "evaluation_rounds"`;
  const countAfter = await measure(countSql);
  const pageAfter = await measure(pageSql);
  const actualCount = await db.$queryRawUnsafe<Array<{ count: number }>>(countSql);
  const actualIds = await db.$queryRawUnsafe<Array<{ id: string }>>(pageSql);
  if (actualCount[0]?.count !== expectedCount[0].count
    || JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error("History count/page changed after adding the candidate index.");
  }
  console.log(JSON.stringify({
    employees, rounds, matchingRounds: actualCount[0].count,
    countBeforeMs: countBefore.medianMs, countAfterMs: countAfter.medianMs,
    pageBeforeMs: pageBefore.medianMs, pageAfterMs: pageAfter.medianMs,
    countUsesCandidateIndex: JSON.stringify(countAfter.plan).includes("evaluation_rounds_employeeJobsSnapshot_idx"),
    pageUsesCandidateIndex: JSON.stringify(pageAfter.plan).includes("evaluation_rounds_employeeJobsSnapshot_idx"),
    caveat: "Synthetic local data, five warm-cache runs, candidate index in disposable schema only.",
  }));
} finally {
  await db.$disconnect();
}
