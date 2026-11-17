import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [shifts, availability, draft, published, publications] = await Promise.all([
    db.shift.findMany({ where: { storeId: "browser-store", date: new Date("2026-10-10") }, include: { assignments: true } }),
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-cindy" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.rosterPublication.count({ where: { rosterPeriodId: "qa-published-period" } }),
  ]);
  const shift = shifts[0];
  if (shifts.length !== 1 || !shift
    || shift.startAt.toISOString() !== "2026-10-09T13:00:00.000Z"
    || shift.endAt.toISOString() !== "2026-10-09T15:00:00.000Z"
    || shift.assignments.length !== 1 || shift.assignments[0].employeeId !== "browser-cindy"
    || availability.length !== 1 || availability[0].date.toISOString() !== "2026-10-09T00:00:00.000Z"
    || draft.version !== 2 || published.version !== 1 || publications !== 1) {
    throw new Error("Early-morning browser save or publication baseline did not match PostgreSQL");
  }
  console.log(JSON.stringify({ verified: true, shiftId: shift.id, startAt: shift.startAt.toISOString(),
    endAt: shift.endAt.toISOString(), employeeId: shift.assignments[0].employeeId,
    availabilityDate: "2026-10-09", draftVersion: draft.version, publishedVersion: published.version,
    publications }));
} finally {
  await db.$disconnect();
}
