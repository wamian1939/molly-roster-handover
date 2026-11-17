import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "../backend/node_modules/@prisma/client/default.js";

const fixture = JSON.parse(readFileSync(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || url.hostname !== "127.0.0.1" || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Expected exact isolated local Roster schema");
}
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [periods, shifts, publications] = await Promise.all([
    db.rosterPeriod.findMany({ where: { storeId: "browser-store" }, orderBy: { startDate: "asc" } }),
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    db.rosterPublication.findMany({ where: { rosterPeriod: { storeId: "browser-store" } } }),
  ]);
  const source = periods.find((period) => period.startDate.toISOString().slice(0, 10) === "2026-10-26");
  const target = periods.find((period) => period.startDate.toISOString().slice(0, 10) === "2026-11-09");
  const moved = shifts.find((shift) => shift.date.toISOString().slice(0, 10) === "2026-11-09");
  if (periods.length !== 4 || shifts.length !== 4 || publications.length !== 1
    || source?.endDate.toISOString().slice(0, 10) !== "2026-11-08" || source.cycleType !== "FORTNIGHT" || source.version !== 3
    || target?.endDate.toISOString().slice(0, 10) !== "2026-11-22" || target.cycleType !== "FORTNIGHT" || target.version !== 2
    || moved?.rosterPeriodId !== target.id || moved.version !== 2
    || moved.startAt.toISOString() !== "2026-11-08T23:00:00.000Z"
    || moved.endAt.toISOString() !== "2026-11-09T03:00:00.000Z"
    || moved.assignments.length !== 1 || moved.assignments[0]?.employeeId !== "browser-HandoverEmployee006"
    || shifts.some((shift) => shift.date.toISOString().slice(0, 10) === "2026-11-08")
    || publications[0]?.periodVersion !== 1) {
    throw new Error("Cross-fortnight move changed unexpected isolated roster state");
  }
  console.log(JSON.stringify({ verified: true, shiftId: moved.id, shiftVersion: moved.version,
    sourcePeriodVersion: source.version, targetPeriodVersion: target.version,
    source: "2026-10-26/2026-11-08", target: "2026-11-09/2026-11-22",
    startAt: moved.startAt.toISOString(), endAt: moved.endAt.toISOString(),
    assignment: moved.assignments[0].employeeId, publications: publications.length }));
} finally {
  await db.$disconnect();
}
