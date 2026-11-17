import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

const dateParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
}).formatToParts(new Date());
const part = (type: Intl.DateTimeFormatPartTypes) => dateParts.find((item) => item.type === type)?.value ?? "";
const today = new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`);
const day = (today.getUTCDay() + 6) % 7;
const nextMonday = new Date(today);
nextMonday.setUTCDate(nextMonday.getUTCDate() + 7 - day);
const previousMonday = new Date(nextMonday);
previousMonday.setUTCDate(previousMonday.getUTCDate() - 7);
const previousSunday = new Date(nextMonday);
previousSunday.setUTCDate(previousSunday.getUTCDate() - 1);
const date = previousSunday.toISOString().slice(0, 10);
const startAt = zonedClockCandidates(date, "08:00", "Australia/Sydney")[0];
const endAt = zonedClockCandidates(date, "10:00", "Australia/Sydney")[0];
if (!startAt || !endAt) throw new Error("Invalid fixture time");

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const mode = process.argv[2];
  if (mode === "seed") {
    const role = await db.shiftRole.findFirstOrThrow({ where: { code: "qa-front" } });
    await db.rosterPeriod.create({ data: {
      id: "qa-script-prior-period", storeId: "browser-store", startDate: previousMonday,
      endDate: previousSunday, cycleType: "WEEK", createdByAccountId: "qa-admin",
    } });
    await db.shift.create({ data: {
      id: "qa-script-prior-shift", storeId: "browser-store", rosterPeriodId: "qa-script-prior-period",
      date: previousSunday, startAt, endAt, shiftRoleId: role.id,
      roleNameSnapshot: role.nameZh, roleColorSnapshot: role.colorToken,
      createdByAccountId: "qa-admin", updatedByAccountId: "qa-admin",
      assignments: { create: { employeeId: "browser-HandoverEmployee006", employeeNameSnapshot: "HandoverEmployee006",
        employeeTypeSnapshot: "REGULAR" } },
    } });
    console.log(JSON.stringify({ seeded: true, date, startAt: startAt.toISOString(), endAt: endAt.toISOString() }));
  } else if (mode === "verify") {
    const shift = await db.shift.findUniqueOrThrow({ where: { id: "qa-script-prior-shift" }, include: { assignments: true } });
    const rows = await db.employeeAvailability.findMany({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
      date: nextMonday, source: "SCRIPT" } });
    const audits = await db.availabilityScriptImport.count({ where: { storeId: "browser-store" } });
    const shifts = await db.shift.count({ where: { storeId: "browser-store" } });
    if (shift.startAt.toISOString() !== startAt.toISOString() || shift.endAt.toISOString() !== endAt.toISOString()
      || shift.assignments.length !== 1 || shift.assignments[0]!.employeeId !== "browser-HandoverEmployee006"
      || rows.length !== 1 || audits !== 1 || shifts !== 4) throw new Error("Unexpected QA database state");
    console.log(JSON.stringify({ verified: true, priorShiftDate: date, priorShiftUnchanged: true,
      nextMonday: nextMonday.toISOString().slice(0, 10), importedAvailability: rows.length, audits, shifts }));
  } else throw new Error("Expected seed or verify");
} finally { await db.$disconnect(); }
