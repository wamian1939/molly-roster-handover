import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const withCindy = process.argv.includes("--with-cindy");
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
    db.employeeAvailability.count({ where: { storeId: "browser-store" } }),
  ]);
  const shift = shifts.find((item) => item.publicNote === "Overnight resize QA");
  const cindy = shifts.find((item) => item.publicNote === "Previous-day availability QA");
  if (shifts.length !== (withCindy ? 5 : 4) || !shift
    || shift.date.toISOString() !== "2026-10-09T00:00:00.000Z"
    || shift.startAt.toISOString() !== "2026-10-09T12:00:00.000Z"
    || shift.endAt.toISOString() !== "2026-10-09T16:00:00.000Z"
    || shift.version !== 2 || shift.assignments.length !== 1
    || shift.assignments[0].employeeId !== "browser-HandoverEmployee006"
    || draft.version !== (withCindy ? 4 : 3) || draft.status !== "DRAFT"
    || published.version !== 1 || published.status !== "PUBLISHED"
    || publications !== 1 || availability !== 2
    || (withCindy && (!cindy || cindy.assignments.length !== 1 || cindy.assignments[0].employeeId !== "browser-cindy"
      || cindy.startAt.toISOString() !== "2026-10-09T13:00:00.000Z" || cindy.endAt.toISOString() !== "2026-10-09T15:00:00.000Z"))) {
    throw new Error("Overnight move or rejected-move rollback did not match PostgreSQL");
  }
  console.log(JSON.stringify({ verified: true, shiftId: shift.id, shiftVersion: shift.version,
    startAt: shift.startAt.toISOString(), endAt: shift.endAt.toISOString(), employeeId: shift.assignments[0].employeeId,
    draftVersion: draft.version, publishedVersion: published.version, publications }));
} finally {
  await db.$disconnect();
}
