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
if (stage !== "before" && stage !== "after" && stage !== "after-shortcuts-change") {
  throw new Error("Expected before, after or after-shortcuts-change");
}
const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(new Date());
const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
const monday = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
monday.setUTCDate(monday.getUTCDate() + 7 - ((monday.getUTCDay() + 6) % 7));
const tuesday = new Date(monday);
tuesday.setUTCDate(tuesday.getUTCDate() + 1);
const sunday = new Date(monday);
sunday.setUTCDate(sunday.getUTCDate() + 6);
const expected = [
  { id: "browser-HandoverEmployee006", date: monday.toISOString().slice(0, 10) },
  { id: "browser-cindy", date: tuesday.toISOString().slice(0, 10) },
];
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [rows, audits, shifts, publications, configuration] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store",
      employeeId: { in: expected.map((item) => item.id) }, date: { gte: monday, lte: sunday } },
      orderBy: [{ employeeId: "asc" }, { date: "asc" }] }),
    db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
    db.availabilityScriptShortcuts.findUnique({ where: { storeId: "browser-store" } }),
  ]);
  const expectedShortcutsVersion = stage === "after-shortcuts-change" ? 2 : 1;
  if (shifts !== 3 || publications !== 1 || configuration?.version !== expectedShortcutsVersion) {
    throw new Error("Fixture baseline changed");
  }
  if (stage === "before" && (rows.length || audits.length)) throw new Error("Preview/Cancel wrote to PostgreSQL");
  if (stage === "after" || stage === "after-shortcuts-change") {
    if (rows.length !== 2 || audits.length !== 1 || audits[0]!.createdCount !== 2
      || audits[0]!.unchangedCount !== 0 || audits[0]!.mode !== "APPEND") {
      throw new Error("Batch import count or audit differs");
    }
    for (const item of expected) {
      const row = rows.find((candidate) => candidate.employeeId === item.id);
      const start = zonedClockCandidates(item.date, "10:00", "Australia/Sydney")[0];
      const end = zonedClockCandidates(item.date, "22:00", "Australia/Sydney")[0];
      if (!row || row.date.toISOString().slice(0, 10) !== item.date || row.source !== "SCRIPT"
        || row.status !== "AVAILABLE" || row.version !== 1 || !start || !end
        || row.startAt?.toISOString() !== start.toISOString() || row.endAt?.toISOString() !== end.toISOString()) {
        throw new Error(`Wrong batch row for ${item.id}`);
      }
    }
  }
  console.log(JSON.stringify({ stage, availabilityRows: rows.length, importAudits: audits.length,
    canonicalEmployeeIds: rows.map((row) => row.employeeId), shifts, publications,
    shortcutsVersion: configuration?.version }));
} finally { await db.$disconnect(); }
