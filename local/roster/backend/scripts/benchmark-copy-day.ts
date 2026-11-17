import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { RosterService } from "../src/rosterService.js";

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
try {
  const source = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "valid-bench-period" } });
  if (source.storeId !== storeId || source.status !== "PUBLISHED"
    || await db.shift.count({ where: { storeId, date: new Date("2027-01-04") } }) !== 1_000
    || await db.employeeAvailability.count({ where: { storeId, date: new Date("2027-01-11") } }) !== 500
    || await db.rosterPeriod.count({ where: { storeId, startDate: new Date("2027-01-11") } })) {
    throw new Error("Expected uncopied 500-employee Copy Day benchmark fixture");
  }
  const input = { storeId, sourceDate: "2027-01-04", targetDate: "2027-01-11",
    activeEmployeeIds: Array.from({ length: 500 }, (_, index) => `valid-bench-employee-${String(index).padStart(4, "0")}`) };
  const start = performance.now();
  try {
    if (mode === "preview") {
      const preview = await service.previewCopyDay(input);
      console.log(JSON.stringify({ mode, shifts: preview.shiftCount, ready: preview.readyShifts, issues: preview.issues.length,
        canCopy: preview.canCopy, elapsedMs: Math.round(performance.now() - start) }));
    } else {
      const result = await service.copyDay({ ...input, expectedSourcePeriodVersion: source.version, expectedTargetPeriodVersion: null }, "benchmark");
      const copied = await db.shift.count({ where: { rosterPeriodId: result.period.id } });
      if (copied !== 1_000 || result.period.status !== "DRAFT") throw new Error("Incomplete Copy Day result");
      console.log(JSON.stringify({ mode, copied, status: result.period.status, elapsedMs: Math.round(performance.now() - start) }));
    }
  } catch (error) {
    console.log(JSON.stringify({ mode, errorCode: typeof error === "object" && error !== null && "code" in error ? error.code : "unknown",
      elapsedMs: Math.round(performance.now() - start), targetPeriods: await db.rosterPeriod.count({ where: { storeId, startDate: new Date("2027-01-11") } }) }));
    throw error;
  }
} finally {
  await db.$disconnect();
}
