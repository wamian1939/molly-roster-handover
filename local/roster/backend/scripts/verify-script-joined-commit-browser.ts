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
  throw new Error("Unsafe QA database URL");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [rows, audits, shifts, publications] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006" },
      orderBy: { date: "asc" } }),
    db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
  ]);
  const dates = Array.from({ length: 7 }, (_, index) => new Date(Date.UTC(2026, 9, 26 + index)).toISOString().slice(0, 10));
  const afterDay = process.argv[2] === "after-day";
  const dayShift = afterDay ? await db.shift.findFirst({
    where: { storeId: "browser-store", date: new Date("2026-10-26T00:00:00.000Z") },
    include: { assignments: true },
  }) : null;
  if (rows.length !== 7 || audits.length !== 1 || audits[0]?.createdCount !== 7
    || audits[0]?.mode !== "APPEND"
    || rows.some((row, index) => row.date.toISOString().slice(0, 10) !== dates[index]
      || row.source !== "SCRIPT" || row.status !== "AVAILABLE"
      || row.startAt?.toISOString() !== new Date(Date.parse(`${dates[index]}T00:00:00.000Z`) - 60 * 60 * 1000).toISOString()
      || row.endAt?.toISOString() !== `${dates[index]}T11:00:00.000Z`)
    || shifts !== (afterDay ? 4 : 3) || publications !== 1
    || (afterDay && (!dayShift || dayShift.startAt.toISOString() !== "2026-10-25T23:00:00.000Z"
      || dayShift.endAt.toISOString() !== "2026-10-26T00:30:00.000Z"
      || dayShift.assignments.length !== 1 || dayShift.assignments[0]?.employeeId !== "browser-HandoverEmployee006"))) {
    // Report only fixture counts; no real employee records are read.
    throw new Error("Joined script QA database state differs from seven-day fixture");
  }
  console.log(JSON.stringify({ availabilityRows: rows.length, importAudits: audits.length,
    firstDate: dates[0], lastDate: dates[6], shifts, publications,
    dayShift: dayShift ? { startAt: dayShift.startAt.toISOString(), endAt: dayShift.endAt.toISOString(),
      employeeId: dayShift.assignments[0]?.employeeId, version: dayShift.version } : null }));
} finally {
  await db.$disconnect();
}
