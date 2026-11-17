import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { RosterService } from "../src/rosterService.js";
import { zonedClockToDate } from "../src/zonedCopy.js";

const mode = process.argv[2];
if (mode !== "preview" && mode !== "execute") throw new Error("Expected preview or execute");
const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== fixture.schema) throw new Error("Requires the exact disposable local Roster schema");

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
const service = new RosterService(db);
const storeId = "valid-bench-store";
const employeeId = "valid-bench-employee-0000";
const targetDates = Array.from({ length: 42 }, (_, index) => {
  const date = new Date("2027-01-18T00:00:00.000Z");
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
});
try {
  const sourcePeriod = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "valid-bench-period" } });
  const sourceShiftId = "valid-bench-shift-0-0-0";
  if (sourcePeriod.storeId !== storeId || sourcePeriod.status !== "PUBLISHED"
    || await db.shift.count({ where: { id: sourceShiftId, storeId } }) !== 1
    || await db.rosterPeriod.count({ where: { storeId, startDate: { gte: new Date("2027-01-18") } } })) {
    throw new Error("Expected uncopied 42-day Repeat benchmark fixture");
  }
  const targetAvailability = await db.employeeAvailability.count({ where: { storeId, employeeId, date: { gte: new Date("2027-01-18") } } });
  if (targetAvailability !== 0 && targetAvailability !== 42) throw new Error("Incomplete target Availability fixture");
  if (!targetAvailability) {
    const rows = targetDates.map((date) => ({ storeId, employeeId, date: new Date(`${date}T00:00:00.000Z`), status: "AVAILABLE" as const,
      startAt: zonedClockToDate(date, "08:00", "Australia/Sydney"), endAt: zonedClockToDate(date, "13:00", "Australia/Sydney") }));
    await db.employeeAvailability.createMany({ data: rows });
  }
  const input = { storeId, sourceShiftId, targetDates, activeEmployeeIds: [employeeId] };
  const start = performance.now();
  try {
    if (mode === "preview") {
      const preview = await service.previewRepeatShift(input);
      console.log(JSON.stringify({ mode, targetDates: targetDates.length, ready: preview.readyShifts, issues: preview.issues.length,
        canCopy: preview.canCopy, elapsedMs: Math.round(performance.now() - start) }));
    } else {
      const result = await service.repeatShift({ ...input, expectedSourcePeriodVersion: sourcePeriod.version,
        expectedTargetPeriodVersions: targetDates.map((date) => ({ date, version: null })) }, "benchmark");
      const copied = await db.shift.count({ where: { storeId, date: { gte: new Date("2027-01-18") } } });
      console.log(JSON.stringify({ mode, created: result.created, copied, elapsedMs: Math.round(performance.now() - start) }));
    }
  } catch (error) {
    console.log(JSON.stringify({ mode, errorCode: typeof error === "object" && error !== null && "code" in error ? error.code : "unknown",
      elapsedMs: Math.round(performance.now() - start), copied: await db.shift.count({ where: { storeId, date: { gte: new Date("2027-01-18") } } }) }));
    throw error;
  }
} finally {
  await db.$disconnect();
}
