import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
const employeeId = process.argv[2] ?? "browser-HandoverEmployee006";
if (!["browser-HandoverEmployee006", "browser-punctuation-name"].includes(employeeId)) throw new Error("Unexpected QA employee");
try {
  const [rows, imports, shifts, periods, publications] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store" },
      select: { employeeId: true, date: true, source: true, status: true, startAt: true, endAt: true, version: true } }),
    db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" },
      select: { createdCount: true, unchangedCount: true, mode: true } }),
    db.shift.findMany({ where: { storeId: "browser-store" }, select: { id: true, version: true } }),
    db.rosterPeriod.findMany({ where: { storeId: "browser-store" }, select: { id: true, version: true } }),
    db.rosterPublication.count(),
  ]);
  if (rows.length !== 1 || rows[0]!.employeeId !== employeeId || rows[0]!.source !== "SCRIPT"
    || rows[0]!.status !== "AVAILABLE" || rows[0]!.version !== 1
    || rows[0]!.startAt?.toISOString() !== "2026-10-25T23:00:00.000Z"
    || rows[0]!.endAt?.toISOString() !== "2026-10-26T11:00:00.000Z"
    || imports.length !== 1 || imports[0]!.createdCount !== 1 || imports[0]!.unchangedCount !== 0
    || imports[0]!.mode !== "APPEND" || shifts.length !== 3 || shifts.some((shift) => shift.version !== 1)
    || periods.length !== 2 || periods.some((period) => period.version !== 1) || publications !== 1) {
    throw new Error("Alias-collision browser import changed unexpected fixture data");
  }
  console.log(JSON.stringify({ availabilityEmployeeId: rows[0]!.employeeId, rows: rows.length,
    importAudits: imports.length, shifts: shifts.length, periodVersions: periods.map((period) => period.version), publications }));
} finally {
  await db.$disconnect();
}
