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

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
const service = new RosterService(db);
const storeId = "valid-bench-store";
try {
  const source = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "valid-bench-period" } });
  if (source.storeId !== storeId || source.status !== "PUBLISHED"
    || await db.shift.count({ where: { rosterPeriodId: source.id } }) !== 5_000
    || await db.employeeAvailability.count({ where: { storeId, date: { gte: new Date("2027-01-11") } } }) !== 2_500
    || await db.rosterPeriod.count({ where: { storeId, startDate: new Date("2027-01-11") } })) {
    throw new Error("Expected an uncopied 500-employee benchmark fixture with target Availability");
  }
  const activeEmployeeIds = Array.from({ length: 500 }, (_, index) => `valid-bench-employee-${String(index).padStart(4, "0")}`);
  const start = performance.now();
  const target = await service.copyPeriod({ storeId, sourcePeriodId: source.id, targetStartDate: "2027-01-11", activeEmployeeIds, expectedSourcePeriodVersion: source.version }, "benchmark");
  const copiedCount = await db.shift.count({ where: { rosterPeriodId: target.id } });
  if (copiedCount !== 5_000 || target.status !== "DRAFT") throw new Error("Incomplete benchmark copy");
  console.log(JSON.stringify({ employees: 500, copiedShifts: copiedCount, sourceStatus: source.status,
    targetStatus: target.status, executeMs: Math.round(performance.now() - start) }));
} finally {
  await db.$disconnect();
}
