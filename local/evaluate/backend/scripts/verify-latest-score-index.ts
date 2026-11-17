import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { loadLatestValidClosedAggregates } from "../src/roundAggregateRead.js";

const state = JSON.parse(await readFile(join(tmpdir(), "evaluate-molly-browser-acceptance.json"), "utf8")) as {
  schema: string;
  isolatedUrl: string;
};
const target = new URL(state.isolatedUrl);
if (!/^codex_browser_acceptance_[0-9]+$/.test(state.schema)
  || target.searchParams.get("schema") !== state.schema
  || !["localhost", "127.0.0.1"].includes(target.hostname)
  || target.pathname !== "/evaluate_molly") {
  throw new Error("Index verification requires the local disposable acceptance schema.");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const indexes = await db.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = current_schema()
      AND tablename = 'evaluation_rounds'
      AND indexname = 'evaluation_rounds_employeeId_status_createdAt_id_idx'
  `;
  if (indexes.length !== 1 || !indexes[0].indexdef.includes('"createdAt" DESC')) {
    throw new Error("The latest CLOSED round index is missing or has the wrong ordering.");
  }

  const plan = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
    return tx.$queryRaw<Array<{ "QUERY PLAN": string }>>`
      EXPLAIN (COSTS OFF)
      SELECT "id" FROM "evaluation_rounds"
      WHERE "employeeId" = 'browser-regular' AND "status" = 'CLOSED'
      ORDER BY "createdAt" DESC, "id" DESC LIMIT 1
    `;
  });
  const planText = plan.map((row) => row["QUERY PLAN"]).join("\n");
  if (!planText.includes(indexes[0].indexname) || planText.includes("Sort")) {
    throw new Error(`The ordered lookup did not use the expected index:\n${planText}`);
  }
  const official = await loadLatestValidClosedAggregates(db, ["browser-regular"]);
  if (official.length !== 1 || official[0].aggregateOverall == null) {
    throw new Error("Seeded CLOSED round did not produce an official score.");
  }
  console.log(JSON.stringify({ index: indexes[0].indexname, orderedLookupPlan: planText, officialRoundId: official[0].id }));
} finally {
  await db.$disconnect();
}
