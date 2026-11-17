import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { zonedClockCandidates } from "../src/zonedCopy.js";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as {
  schema: string; isolatedUrl: string;
};
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Expected disposable Roster schema");
const url = new URL(state.isolatedUrl);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the isolated local Roster database");
}

const parts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(new Date());
const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
const monday = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
monday.setUTCDate(monday.getUTCDate() + 7 - ((monday.getUTCDay() + 6) % 7));
const sunday = new Date(monday);
sunday.setUTCDate(sunday.getUTCDate() + 6);
const date = monday.toISOString().slice(0, 10);
const expectedStart = zonedClockCandidates(date, "10:00", "Australia/Sydney")[0];
const expectedEnd = zonedClockCandidates(date, "11:00", "Australia/Sydney")[0];
if (!expectedStart || !expectedEnd) throw new Error("Invalid expected test time");

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const [availability, audits, shifts, publications, role] = await Promise.all([
    db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
      date: { gte: monday, lte: sunday } }, orderBy: { date: "asc" } }),
    db.availabilityScriptImport.findMany({ where: { storeId: "browser-store" } }),
    db.shift.findMany({ where: { storeId: "browser-store" }, include: { assignments: true } }),
    db.rosterPublication.count(),
    db.shiftRole.findFirst({ where: { code: "qa-front" } }),
  ]);
  const created = shifts.filter((shift) => shift.date.toISOString().slice(0, 10) === date);
  if (availability.length !== 7 || availability.some((row) => row.source !== "SCRIPT" || row.status !== "AVAILABLE" || row.version !== 1)
    || audits.length !== 1 || audits[0]?.createdCount !== 7 || audits[0]?.unchangedCount !== 0
    || shifts.length !== 4 || publications !== 1 || created.length !== 1 || !role) {
    throw new Error("Import or Shift counts changed unexpectedly");
  }
  const shift = created[0]!;
  if (shift.startAt.toISOString() !== expectedStart.toISOString() || shift.endAt.toISOString() !== expectedEnd.toISOString()
    || shift.shiftRoleId !== role.id || shift.roleNameSnapshot !== "QA Front" || shift.breakMinutes !== 0
    || shift.assignments.length !== 1 || shift.assignments[0]?.employeeId !== "browser-HandoverEmployee006") {
    throw new Error("Saved Day Shift differs from the browser draft");
  }
  console.log(JSON.stringify({ schema: state.schema, date, availabilityRows: availability.length,
    importAudits: audits.length, totalShifts: shifts.length, dayShifts: created.length, publications,
    canonicalEmployeeId: shift.assignments[0].employeeId, startAt: shift.startAt.toISOString(),
    endAt: shift.endAt.toISOString(), roleNameSnapshot: shift.roleNameSnapshot }));
} finally {
  await db.$disconnect();
}
