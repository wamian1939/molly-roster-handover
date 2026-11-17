import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { RosterService } from "../src/rosterService.js";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname)
  || url.port !== "5433" || url.pathname !== "/molly_roster"
  || url.searchParams.get("schema") !== fixture.schema) throw new Error("Requires the exact disposable local Roster schema");

const requireFromRoot = createRequire(join(process.cwd(), "..", "package.json"));
const { DateTime } = requireFromRoot("luxon") as typeof import("luxon");
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
const storeId = "valid-bench-store";
const periodId = "valid-bench-period";
try {
  const source = await db.rosterPeriod.findUniqueOrThrow({ where: { id: periodId } });
  const targetAvailabilityCount = await db.employeeAvailability.count({ where: { storeId, date: { gte: new Date("2027-01-11") } } });
  if (source.storeId !== storeId || source.status !== "PUBLISHED"
    || await db.shift.count({ where: { rosterPeriodId: periodId } }) !== 5_000
    || await db.rosterPeriod.count({ where: { storeId, startDate: new Date("2027-01-11") } })
    || (targetAvailabilityCount !== 0 && targetAvailabilityCount !== 2_500)) {
    throw new Error("Expected the exact 500-employee published benchmark fixture");
  }
  const availability = [];
  for (let day = 0; day < 5; day += 1) {
    const date = DateTime.fromISO("2027-01-11", { zone: "Australia/Sydney" }).plus({ days: day }).toISODate()!;
    const at = (time: string) => DateTime.fromISO(`${date}T${time}`, { zone: "Australia/Sydney" }).toUTC().toJSDate();
    for (let employeeIndex = 0; employeeIndex < 500; employeeIndex += 1) availability.push({
      storeId, employeeId: `valid-bench-employee-${String(employeeIndex).padStart(4, "0")}`,
      date: new Date(`${date}T00:00:00.000Z`), status: "AVAILABLE" as const, startAt: at("09:00"), endAt: at("17:00"),
    });
  }
  if (!targetAvailabilityCount) for (let offset = 0; offset < availability.length; offset += 500) await db.employeeAvailability.createMany({ data: availability.slice(offset, offset + 500) });
  const activeEmployeeIds = Array.from({ length: 500 }, (_, index) => `valid-bench-employee-${String(index).padStart(4, "0")}`);
  const start = performance.now();
  const preview = await new RosterService(db).previewCopyPeriod({ storeId, sourcePeriodId: periodId, targetStartDate: "2027-01-11", activeEmployeeIds });
  console.log(JSON.stringify({ employees: 500, shifts: preview.shiftCount, readyShifts: preview.readyShifts,
    issues: preview.issues.length, canCopy: preview.canCopy, previewMs: Math.round(performance.now() - start) }));
} finally {
  await db.$disconnect();
}
