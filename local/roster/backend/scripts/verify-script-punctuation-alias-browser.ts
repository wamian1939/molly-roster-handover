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
  || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [rows, audits, shifts, periods, publications] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store" },
      select: { employeeId: true, date: true, status: true, source: true, startAt: true, endAt: true, version: true } }),
    db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" },
      select: { mode: true, createdCount: true, unchangedCount: true } }),
    db.shift.findMany({ where: { storeId: "browser-store" }, select: { version: true } }),
    db.rosterPeriod.findMany({ where: { storeId: "browser-store" }, select: { version: true } }),
    db.rosterPublication.count(),
  ]);
  const dates = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"];
  if (rows.length !== 7 || !dates.every((date) => rows.some((row) => row.date.toISOString().slice(0, 10) === date
    && row.employeeId === "browser-HandoverEmployee006" && row.status === "AVAILABLE" && row.source === "SCRIPT"
    && row.startAt?.toISOString() === `${date}T00:00:00.000Z`
    && row.endAt?.toISOString() === `${date}T11:00:00.000Z` && row.version === 1))
    || audits.length !== 1 || audits[0]?.mode !== "APPEND" || audits[0]?.createdCount !== 7 || audits[0]?.unchangedCount !== 0
    || shifts.length !== 3 || shifts.some((shift) => shift.version !== 1)
    || periods.length !== 2 || periods.some((period) => period.version !== 1) || publications !== 1) {
    throw new Error("Punctuation alias import did not preserve exact fixture boundaries");
  }
  console.log(JSON.stringify({ schema: fixture.schema, availabilityRows: rows.length, canonicalEmployeeId: "browser-HandoverEmployee006",
    importAudits: audits.length, shifts: shifts.length, periodVersions: periods.map((period) => period.version), publications }));
} finally {
  await db.$disconnect();
}
