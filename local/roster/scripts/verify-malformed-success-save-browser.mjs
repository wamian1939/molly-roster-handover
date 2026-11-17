import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Requires the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [shifts, draft, published, publications] = await Promise.all([
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  const saved = shifts.filter((shift) => shift.publicNote === "Malformed success QA");
  if (shifts.length !== 4 || saved.length !== 1 || saved[0].version !== 1
    || saved[0].date.toISOString().slice(0, 10) !== "2026-10-10"
    || saved[0].startAt.toISOString() !== "2026-10-09T23:00:00.000Z"
    || saved[0].endAt.toISOString() !== "2026-10-09T23:30:00.000Z"
    || saved[0].assignments.length !== 1 || saved[0].assignments[0].employeeId !== "browser-HandoverEmployee006"
    || draft.version !== 2 || draft.status !== "DRAFT" || published.version !== 1
    || published.status !== "PUBLISHED" || publications !== 1) {
    throw new Error("Malformed-response Save produced a duplicate or changed another roster row");
  }
  console.log(JSON.stringify({ verified: true, shifts: shifts.length, matchingCreated: saved.length,
    employeeId: saved[0].assignments[0].employeeId, draftVersion: draft.version,
    publishedVersion: published.version, publications }));
} finally {
  await db.$disconnect();
}
