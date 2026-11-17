import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const withMove = process.argv.includes("--with-move");
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [shifts, draft, published, publications, availability] = await Promise.all([
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
    db.employeeAvailability.findMany({ where: { storeId: "browser-store" } }),
  ]);
  const HandoverEmployee006 = shifts.find((shift) => shift.publicNote === "Overnight resize QA");
  const cindy = shifts.find((shift) => shift.publicNote === "Previous-day availability QA");
  if (shifts.length !== 5 || !HandoverEmployee006 || !cindy
    || HandoverEmployee006.date.toISOString() !== "2026-10-09T00:00:00.000Z"
    || HandoverEmployee006.startAt.toISOString() !== "2026-10-09T10:00:00.000Z"
    || HandoverEmployee006.endAt.toISOString() !== "2026-10-09T16:00:00.000Z"
    || (withMove && (HandoverEmployee006.version !== 5 || draft.version !== 7))
    || HandoverEmployee006.assignments.length !== 1 || HandoverEmployee006.assignments[0].employeeId !== "browser-HandoverEmployee006"
    || cindy.startAt.toISOString() !== "2026-10-09T13:00:00.000Z"
    || cindy.endAt.toISOString() !== "2026-10-09T15:00:00.000Z"
    || cindy.assignments.length !== 1 || cindy.assignments[0].employeeId !== "browser-cindy"
    || availability.length !== 2 || published.version !== 1 || publications !== 1) {
    throw new Error("Saved overnight resize, assignments, Availability or publication baseline did not match PostgreSQL");
  }
  console.log(JSON.stringify({ verified: true, shiftId: HandoverEmployee006.id, date: "2026-10-09",
    startAt: HandoverEmployee006.startAt.toISOString(), endAt: HandoverEmployee006.endAt.toISOString(),
    employeeId: HandoverEmployee006.assignments[0].employeeId, cindyUnchanged: true,
    shiftVersion: HandoverEmployee006.version, draftVersion: draft.version, publishedVersion: published.version, publications }));
} finally {
  await db.$disconnect();
}
