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
  throw new Error("Expected guarded disposable Roster database");
}
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [rows, shifts, publications] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
      date: new Date("2027-10-03T00:00:00.000Z") } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
  ]);
  if (rows.length !== 1 || rows[0]!.status !== "AVAILABLE" || rows[0]!.source !== "MANUAL"
    || rows[0]!.startAt?.toISOString() !== "2027-10-02T15:00:00.000Z"
    || rows[0]!.endAt?.toISOString() !== "2027-10-03T14:30:00.000Z"
    || shifts !== 3 || publications !== 1) throw new Error("Spring-forward save or fixture baseline differs");
  console.log(JSON.stringify({ verified: true, employeeId: rows[0]!.employeeId,
    startAt: rows[0]!.startAt.toISOString(), endAt: rows[0]!.endAt.toISOString(),
    elapsedMinutes: (rows[0]!.endAt.getTime() - rows[0]!.startAt.getTime()) / 60_000,
    availabilityRows: rows.length, shifts, publications }));
} finally { await db.$disconnect(); }
