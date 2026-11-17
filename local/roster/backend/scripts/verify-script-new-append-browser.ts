import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)) throw new Error("Unsafe QA schema");
const url = new URL(fixture.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Expected disposable Roster PostgreSQL schema");
}
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [rows, audits, shiftCount, publicationCount, shortcuts] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store" } }),
    db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
    db.availabilityScriptShortcuts.findUnique({ where: { storeId: "browser-store" } }),
  ]);
  const expectedDates = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
  const validRows = ["browser-HandoverEmployee006", "browser-cindy"].every((employeeId) =>
    expectedDates.every((date) => rows.some((row) => row.employeeId === employeeId
      && row.status === "AVAILABLE" && row.source === "SCRIPT" && row.date.toISOString().slice(0, 10) === date
      && row.startAt?.toISOString() === `${date}T00:00:00.000Z`
      && row.endAt?.toISOString() === `${date}T11:00:00.000Z`)));
  if (rows.length !== 14 || !validRows
    || audits.length !== 1 || audits[0]?.mode !== "APPEND" || audits[0]?.createdCount !== 14
    || shiftCount !== 3 || publicationCount !== 1 || shortcuts?.version !== 2) {
    throw new Error("New-tab append did not persist exactly the reviewed name/code rows");
  }
  console.log(JSON.stringify({ employeeIds: ["browser-HandoverEmployee006", "browser-cindy"], dates: expectedDates,
    availabilityRows: rows.length, importAudits: audits.length,
    shiftCount, publicationCount, shortcutsVersion: shortcuts.version }));
} finally { await db.$disconnect(); }
