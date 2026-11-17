import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { zonedClockToDate } from "../src/zonedCopy.js";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== fixture.schema) throw new Error("Requires the exact disposable local Roster schema");

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  if (process.argv[2] === "verify") {
    const source = await db.shift.findMany({ where: { storeId: "browser-store", date: new Date("2026-10-09") }, include: { assignments: true } });
    const target = await db.shift.findMany({ where: { storeId: "browser-store", date: new Date("2026-10-10") }, include: { assignments: true } });
    const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } });
    const shape = (rows: typeof source) => rows.map((shift) => ({
      start: shift.startAt.toISOString().slice(11), end: shift.endAt.toISOString().slice(11),
      employeeIds: shift.assignments.map((assignment) => assignment.employeeId).sort(),
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const targetShiftIdsDistinct = target.every((shift) => !source.some((row) => row.id === shift.id));
    if (source.length !== 2 || target.length !== 2 || period.version !== 2 || !targetShiftIdsDistinct
      || JSON.stringify(shape(source)) !== JSON.stringify(shape(target))) throw new Error("Copied day does not match the source");
    console.log(JSON.stringify({ sourceShifts: source.length, targetShifts: target.length,
      targetAssignments: target.reduce((sum, shift) => sum + shift.assignments.length, 0), periodVersion: period.version,
      targetShiftIdsDistinct }));
  } else if (process.argv[2] === "seed") {
    if (await db.shift.count({ where: { storeId: "browser-store", date: new Date("2026-10-10") } })) throw new Error("Expected an empty target day");
    const employees = ["browser-regular", "browser-training"];
    for (const employeeId of employees) {
      if (await db.employeeAvailability.count({ where: { storeId: "browser-store", employeeId, date: new Date("2026-10-10") } })) throw new Error("Target availability already exists");
    }
    await db.employeeAvailability.createMany({ data: employees.map((employeeId) => ({
      storeId: "browser-store", employeeId, date: new Date("2026-10-10"),
      startAt: zonedClockToDate("2026-10-10", "08:00", "Australia/Sydney"),
      endAt: zonedClockToDate("2026-10-10", "14:00", "Australia/Sydney"),
      status: "AVAILABLE" as const,
    })) });
    console.log(JSON.stringify({ seeded: employees.length, targetDate: "2026-10-10" }));
  } else throw new Error("Expected seed or verify");
} finally {
  await db.$disconnect();
}
