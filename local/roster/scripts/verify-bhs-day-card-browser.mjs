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
  || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [total, fiveCards, publications, draft, published, original] = await Promise.all([
    db.shift.count(),
    db.shift.findMany({ where: { id: { startsWith: "qa-bhs-day-" } }, select: { id: true, date: true, version: true, assignments: { select: { employeeId: true } } } }),
    db.rosterPublication.count(),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" }, select: { version: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" }, select: { version: true } }),
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, select: { version: true } }),
  ]);
  if (total !== 8 || fiveCards.length !== 5 || publications !== 1 || draft.version !== 1 || published.version !== 1 || original.version !== 1
    || fiveCards.some((shift) => shift.date.toISOString().slice(0, 10) !== "2026-10-10" || shift.version !== 1 || shift.assignments.length !== 1)) {
    throw new Error("Disposable Day fixture changed during browser-only interaction checks");
  }
  console.log(JSON.stringify({ schema: state.schema, shifts: total, matchingDayCards: fiveCards.length,
    publications, draftVersion: draft.version, publishedVersion: published.version }));
} finally {
  await db.$disconnect();
}
