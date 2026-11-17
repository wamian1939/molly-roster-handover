import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["127.0.0.1", "localhost"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [shifts, draft, published, publications] = await Promise.all([
    db.shift.findMany({ select: { id: true, version: true }, orderBy: { id: "asc" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.count(),
  ]);
  const baselineIds = ["qa-draft-grouped-shift", "qa-draft-shift", "qa-published-shift"];
  if (shifts.length !== baselineIds.length || shifts.some((shift, index) => shift.id !== baselineIds[index] || shift.version !== 1)
    || draft.status !== "DRAFT" || draft.version !== 1
    || published.status !== "PUBLISHED" || published.version !== 1 || publications !== 1) {
    throw new Error("Read-only Day refresh QA changed baseline Shift, period, or publication state");
  }
  console.log(JSON.stringify({ verified: true, shifts: shifts.length, draftVersion: draft.version,
    publishedVersion: published.version, publications }));
} finally { await db.$disconnect(); }
