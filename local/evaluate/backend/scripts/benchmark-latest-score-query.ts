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
  throw new Error("Benchmark requires the local disposable acceptance schema.");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
const requested = `SELECT "id" FROM "employees" WHERE "id" LIKE 'bench-%'`;
const validity = `r."status" = 'CLOSED' AND r."finalAggregateOverall" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "evaluations" e WHERE e."roundId" = r."id"
    AND e."evaluationStatus" IN ('Submitted', 'Completed') AND e."overallScoreV1" IS NOT NULL
)`;
const oldSql = `WITH requested AS MATERIALIZED (${requested})
  SELECT DISTINCT ON (r."employeeId") r."id"
  FROM requested q JOIN "evaluation_rounds" r ON r."employeeId" = q."id"
  WHERE ${validity}
  ORDER BY r."employeeId", r."createdAt" DESC, r."id" DESC`;
const newSql = `WITH requested AS MATERIALIZED (${requested})
  SELECT latest."id" FROM requested q CROSS JOIN LATERAL (
    SELECT r."id" FROM "evaluation_rounds" r
    WHERE r."employeeId" = q."id" AND ${validity}
    ORDER BY r."createdAt" DESC, r."id" DESC LIMIT 1
  ) latest`;

try {
  const existing = await db.employee.count({ where: { id: { startsWith: "bench-" } } });
  if (existing) throw new Error("Benchmark fixture already exists; use a fresh disposable schema.");
  await db.$executeRaw`
    INSERT INTO "employees" ("id", "storeId", "displayName", "employmentType", "status", "employeeType", "createdAt", "updatedAt")
    SELECT 'bench-' || lpad(n::text, 4, '0'), 'browser-store', 'Benchmark Employee ' || n,
           'FullTime', 'Active', 'REGULAR', now(), now()
    FROM generate_series(1, 500) n
  `;
  for (let roundNumber = 1; roundNumber <= 10; roundNumber++) {
    await db.$executeRaw`
      INSERT INTO "evaluation_rounds"
        ("id", "employeeId", "storeId", "employeeTypeSnapshot", "scoringVersion",
         "scoringPolicySnapshot", "skillBaselineSnapshot", "roundNumber", "status",
         "createdAt", "openedAt", "finalAggregateOverall", "finalAggregateTier", "employeeJobsSnapshot")
      SELECT 'bench-round-' || e."id" || '-' || ${roundNumber}, e."id", e."storeId", e."employeeType",
             'REGULAR_V3', '{}'::jsonb, '[]'::jsonb, ${roundNumber}, 'OPEN',
             now() + ${roundNumber} * interval '1 day', now(), 75, 'T2',
             CASE WHEN ${roundNumber} = 1 THEN '[{"id":"bench-job"}]'::jsonb ELSE '[]'::jsonb END
      FROM "employees" e WHERE e."id" LIKE 'bench-%'
    `;
    await db.$executeRaw`
      INSERT INTO "evaluations"
        ("id", "employeeId", "storeId", "roundId", "evaluationStatus", "scoringVersion",
         "employeeTypeSnapshot", "scoringPolicySnapshot", "textReview", "overallScoreV1", "createdAt", "updatedAt")
      SELECT 'bench-eval-' || r."id", r."employeeId", r."storeId", r."id", 'Completed',
             'REGULAR_V3', r."employeeTypeSnapshot", '{}'::jsonb, '', 75, now(), now()
      FROM "evaluation_rounds" r
      WHERE r."roundNumber" = ${roundNumber} AND r."employeeId" LIKE 'bench-%'
    `;
    await db.$executeRaw`
      UPDATE "evaluation_rounds" SET "status" = 'CLOSED', "closedAt" = now(),
        "closedEligibleCount" = 1, "closedSubmittedCount" = 1
      WHERE "roundNumber" = ${roundNumber} AND "employeeId" LIKE 'bench-%'
    `;
  }
  await db.$executeRaw`ANALYZE "employees"`;
  await db.$executeRaw`ANALYZE "evaluation_rounds"`;
  await db.$executeRaw`ANALYZE "evaluations"`;
  const oldIds = await db.$queryRawUnsafe<Array<{ id: string }>>(oldSql);
  const newIds = await db.$queryRawUnsafe<Array<{ id: string }>>(newSql);
  const a = oldIds.map((row) => row.id).sort();
  const b = newIds.map((row) => row.id).sort();
  if (a.length !== 500 || JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`Old/new latest-round results differ: ${a.length}/${b.length}.`);
  }
  const times = async (sql: string) => {
    const values: number[] = [];
    for (let i = 0; i < 5; i++) {
      const result = await db.$queryRawUnsafe<Array<{ "QUERY PLAN": Array<{ "Execution Time": number }> }>>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`,
      );
      values.push(result[0]["QUERY PLAN"][0]["Execution Time"]);
    }
    return values.sort((x, y) => x - y)[2];
  };
  const oldMedianMs = await times(oldSql);
  const newMedianMs = await times(newSql);
  console.log(JSON.stringify({ schema: state.schema, employees: 500, closedRounds: 5000, matchingRoundIds: a.length, oldMedianMs, newMedianMs, repetitions: 5, caveat: "Synthetic local data and warm-cache planner timing; no production latency guarantee." }));
} finally {
  await db.$disconnect();
}
