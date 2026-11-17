import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [shifts, draft, published, publications] = await Promise.all([
    db.shift.findMany({ include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.count(),
  ]);
  const baselineIds = ["qa-draft-shift", "qa-draft-grouped-shift", "qa-published-shift"];
  const created = shifts.filter((shift) => !baselineIds.includes(shift.id));
  const shift = created[0];
  if (shifts.length !== 4 || created.length !== 1 || !shift
    || shift.publicNote !== "Upward drag QA" || shift.storeId !== "browser-store"
    || shift.rosterPeriodId !== draft.id || shift.date.toISOString().slice(0, 10) !== "2026-10-10"
    || shift.startAt.toISOString() !== "2026-10-09T23:00:00.000Z"
    || shift.endAt.toISOString() !== "2026-10-10T00:00:00.000Z"
    || shift.version !== 1 || shift.roleNameSnapshot !== "QA Front"
    || shift.assignments.length !== 1 || shift.assignments[0]?.employeeId !== "browser-HandoverEmployee006"
    || draft.status !== "DRAFT" || draft.version !== 2
    || published.status !== "PUBLISHED" || published.version !== 1
    || publications !== 1 || baselineIds.some((id) => shifts.find((row) => row.id === id)?.version !== 1)) {
    throw new Error("Directional Day QA changed an unexpected Shift or publication");
  }
  console.log(JSON.stringify({ verified: true, shifts: shifts.length, date: "2026-10-10",
    startAt: shift.startAt.toISOString(), endAt: shift.endAt.toISOString(),
    employeeId: shift.assignments[0].employeeId, draftVersion: draft.version,
    publishedVersion: published.version, publications }));
} finally {
  await db.$disconnect();
}
