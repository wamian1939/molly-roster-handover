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
  || !["localhost", "127.0.0.1"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== fixture.schema) throw new Error("Requires the exact disposable local Roster schema");

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const mode = process.argv[2] ?? "baseline";
  if (!["baseline", "moved", "deleted", "profiled"].includes(mode)) throw new Error("Expected baseline, moved, deleted or profiled");
  const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "valid-calendar-period" } });
  const shifts = await db.shift.count({ where: { rosterPeriodId: period.id } });
  const assignments = await db.shiftAssignment.count({ where: { shift: { rosterPeriodId: period.id } } });
  const original = await db.shift.findUnique({ where: { id: "valid-calendar-shift-0-2-0" }, include: { assignments: true } });
  const expectedEmployee = mode === "baseline" ? "browser-HandoverEmployee006" : mode === "moved" ? "browser-cindy" : null;
  const expectedCount = mode === "baseline" ? 5_000 : mode === "profiled" ? 4_995 : 4_999;
  const expectedVersion = mode === "baseline" ? 1 : mode === "moved" ? 3 : mode === "profiled" ? 7 : 2;
  const removedTarget = mode === "moved" ? await db.shift.count({ where: { id: "valid-calendar-shift-0-3-0" } }) : 1;
  const profiledDeletedIds = ["valid-calendar-shift-0-2-0", "valid-calendar-shift-0-2-1", "valid-calendar-shift-0-3-0", "valid-calendar-shift-0-4-0", "valid-calendar-shift-0-5-0"];
  const profiledDeletedCount = mode === "profiled" ? await db.shift.count({ where: { id: { in: profiledDeletedIds } } }) : 0;
  const profiledMoved = mode === "profiled" ? await db.shift.findUnique({ where: { id: "valid-calendar-shift-0-3-1" }, include: { assignments: true } }) : null;
  if (period.status !== "DRAFT" || period.version !== expectedVersion || shifts !== expectedCount || assignments !== expectedCount
    || (mode === "profiled" ? original !== null || profiledDeletedCount !== 0 || profiledMoved?.assignments.length !== 1 || profiledMoved.assignments[0]?.employeeId !== "browser-HandoverEmployee006" : mode === "deleted" ? original !== null : original?.assignments.length !== 1 || original.assignments[0]?.employeeId !== expectedEmployee)
    || removedTarget !== (mode === "moved" ? 0 : 1)) {
    throw new Error("The valid browser fixture changed unexpectedly");
  }
  console.log(JSON.stringify({ mode, status: period.status, version: period.version, shifts, assignments,
    originalShiftId: original?.id ?? null, originalEmployeeId: original?.assignments[0]?.employeeId ?? null,
    movedShiftId: profiledMoved?.id ?? null, movedEmployeeId: profiledMoved?.assignments[0]?.employeeId ?? null }));
} finally {
  await db.$disconnect();
}
