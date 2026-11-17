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
  const [draft, published, shift, totalShifts] = await Promise.all([
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-published-period" } }),
    db.shift.findUniqueOrThrow({ where: { id: "qa-draft-shift" }, include: { assignments: true } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
  ]);
  if (draft.version !== 2 || draft.status !== "DRAFT" || published.version !== 1 || published.status !== "PUBLISHED"
    || totalShifts !== 3 || shift.version !== 2 || shift.date.toISOString().slice(0, 10) !== "2026-10-10"
    || shift.startAt.toISOString() !== "2026-10-09T22:00:00.000Z"
    || shift.endAt.toISOString() !== "2026-10-10T02:00:00.000Z"
    || shift.assignments.length !== 1 || shift.assignments[0].employeeId !== "browser-HandoverEmployee006"
    || shift.assignments[0].employeeNameSnapshot !== "HandoverEmployee006") {
    throw new Error("Diagonal move or rejected follow-up did not preserve the exact shift, assignment, version and history");
  }
  console.log(JSON.stringify({ verified: true, schema: fixture.schema, shiftId: shift.id, date: "2026-10-10",
    employeeId: shift.assignments[0].employeeId, shiftVersion: shift.version, draftVersion: draft.version,
    publishedVersion: published.version, totalShifts }));
} finally {
  await db.$disconnect();
}
