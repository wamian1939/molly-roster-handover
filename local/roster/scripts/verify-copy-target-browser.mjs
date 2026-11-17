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
  const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } });
  const shifts = await db.shift.findMany({ where: { rosterPeriodId: period.id }, include: { assignments: true }, orderBy: { date: "asc" } });
  const copied = shifts.filter((shift) => shift.date.toISOString().slice(0, 10) === "2026-10-10");
  if (period.version !== 2 || shifts.length !== 3 || copied.length !== 1
    || copied[0].id === "qa-draft-shift" || copied[0].assignments.length !== 1
    || copied[0].assignments[0].employeeId !== "browser-HandoverEmployee006"
    || copied[0].publicNote !== "Preserve copy draft"
    || copied[0].startAt.toISOString() !== "2026-10-09T22:00:00.000Z"
    || copied[0].endAt.toISOString() !== "2026-10-10T02:00:00.000Z") throw new Error("Copied shift did not persist exactly once with the target employee/date/time/note");
  const source = shifts.find((shift) => shift.id === "qa-draft-shift");
  if (!source || source.assignments.length !== 1 || source.assignments[0].employeeId !== "browser-regular") throw new Error("Source shift changed");
  console.log(JSON.stringify({ verified: true, schema: fixture.schema, version: period.version, shiftCount: shifts.length,
    copiedId: copied[0].id, employeeId: copied[0].assignments[0].employeeId,
    startAt: copied[0].startAt.toISOString(), endAt: copied[0].endAt.toISOString() }));
} finally {
  await db.$disconnect();
}
