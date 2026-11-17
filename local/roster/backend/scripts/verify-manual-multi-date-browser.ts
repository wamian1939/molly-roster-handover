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
  const [rows, shifts, publications] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
      date: { gte: new Date("2026-10-26T00:00:00.000Z"), lte: new Date("2026-10-29T00:00:00.000Z") } }, orderBy: { date: "asc" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
  ]);
  const expected = [
    ["2026-10-26", "2026-10-25T22:00:00.000Z", "2026-10-26T11:00:00.000Z"],
    ["2026-10-27", "2026-10-26T22:00:00.000Z", "2026-10-27T11:00:00.000Z"],
    ["2026-10-29", "2026-10-28T23:00:00.000Z", "2026-10-29T06:00:00.000Z"],
  ];
  if (rows.length !== 3 || shifts !== 3 || publications !== 1 || rows.some((row, index) =>
    row.date.toISOString().slice(0, 10) !== expected[index]![0]
    || row.startAt?.toISOString() !== expected[index]![1]
    || row.endAt?.toISOString() !== expected[index]![2]
    || row.status !== "AVAILABLE" || row.source !== "MANUAL" || row.version !== 1)) {
    throw new Error("Manual multi-date QA database state differs from expected isolated fixture");
  }
  console.log(JSON.stringify({ verified: true, availabilityRows: rows.length,
    canonicalEmployeeId: "browser-HandoverEmployee006", shifts, publications }));
} finally { await db.$disconnect(); }
