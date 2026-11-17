import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { zonedClockCandidates } from "../src/zonedCopy.js";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)) throw new Error("Unsafe QA schema");
const url = new URL(fixture.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Expected the guarded disposable Roster database");
}
const stage = process.argv[2];
if (stage !== "stale" && stage !== "after") throw new Error("Expected stale or after");
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(new Date());
const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
const monday = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
monday.setUTCDate(monday.getUTCDate() + 7 - ((monday.getUTCDay() + 6) % 7));
const tuesday = new Date(monday);
tuesday.setUTCDate(tuesday.getUTCDate() + 1);
const dates = [monday, tuesday];
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [rows, audits, shifts, publications] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
      date: { in: dates } }, orderBy: { date: "asc" } }),
    db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
  ]);
  if (shifts !== 3 || publications !== 1) throw new Error("Fixture Shift/publication counts changed");
  if (rows.length !== (stage === "stale" ? 1 : 2) || audits.length !== (stage === "stale" ? 0 : 1)) {
    throw new Error("Unexpected Availability/import audit count");
  }
  if (stage === "after" && (audits[0]!.createdCount !== 1 || audits[0]!.unchangedCount !== 1
    || audits[0]!.mode !== "APPEND")) throw new Error("Reviewed import counts changed");
  for (const [index, date] of dates.entries()) {
    const row = rows.find((candidate) => candidate.date.toISOString().slice(0, 10) === date.toISOString().slice(0, 10));
    if (index === 1 && stage === "stale") { if (row) throw new Error("Stale commit inserted Tuesday"); continue; }
    const localDate = date.toISOString().slice(0, 10);
    const start = zonedClockCandidates(localDate, "10:00", "Australia/Sydney")[0];
    const end = zonedClockCandidates(localDate, "22:00", "Australia/Sydney")[0];
    if (!row || row.status !== "AVAILABLE" || row.source !== (index === 0 ? "MANUAL" : "SCRIPT")
      || row.startAt?.toISOString() !== start?.toISOString() || row.endAt?.toISOString() !== end?.toISOString()) {
      throw new Error(`Wrong ${localDate} Availability`);
    }
  }
  console.log(JSON.stringify({ stage, availabilityRows: rows.length, importAudits: audits.length,
    shifts, publications, canonicalEmployeeId: "browser-HandoverEmployee006" }));
} finally { await db.$disconnect(); }
