import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable local Roster browser schema");
}
const stage = process.argv[2];
if (stage !== "before" && stage !== "after") throw new Error("Expected before or after");
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [rows, audits, shifts, publications] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
      date: new Date("2026-11-01T00:00:00.000Z") } }),
    db.availabilityScriptImport.count({ where: { storeId: "browser-store" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count(),
  ]);
  if (shifts !== 3 || publications !== 1) throw new Error("The original Shift or publication fixture changed");
  if (stage === "before" && (rows.length || audits)) throw new Error("Cancel wrote Availability or an import audit");
  if (stage === "after" && (rows.length !== 1 || audits !== 1
    || rows[0]!.source !== "SCRIPT"
    || rows[0]!.startAt?.toISOString() !== "2026-11-01T11:00:00.000Z"
    || rows[0]!.endAt?.toISOString() !== "2026-11-01T15:00:00.000Z")) {
    throw new Error("Overnight import did not match the reviewed canonical employee, instants and single audit");
  }
  console.log(JSON.stringify({ stage, schema: state.schema, employeeId: "browser-HandoverEmployee006",
    availabilityRows: rows.length, importAudits: audits, shifts, publications }));
} finally {
  await db.$disconnect();
}
