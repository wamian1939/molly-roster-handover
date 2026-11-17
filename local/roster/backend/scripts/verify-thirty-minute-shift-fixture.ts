import "dotenv/config";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { RosterService } from "../src/rosterService.js";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Unexpected disposable schema");
const target = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433" ||
    target.pathname !== "/molly_roster" || target.searchParams.get("schema") !== state.schema) {
  throw new Error("Only the named disposable Roster schema may be tested");
}

const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
const service = new RosterService(db);
try {
  const storeId = "browser-store";
  const [baselineShifts, baselinePublished, period, role] = await Promise.all([
    db.shift.count({ where: { storeId } }),
    db.rosterPublication.findMany({ where: { rosterPeriod: { storeId } }, orderBy: { id: "asc" } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } }),
    db.shiftRole.findFirstOrThrow({ where: { code: "qa-front" } }),
  ]);
  await service.saveSettings({ storeId, timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00",
    slotIntervalMinutes: 30, minimumShiftMinutes: 30, defaultBreakMinutes: 0, weekStartsOn: 1,
    cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
  await service.replaceAvailability({ storeId, employeeId: "browser-thirty-minute", dates: ["2026-10-09"], entries: [
    { date: "2026-10-09", status: "AVAILABLE", startAt: "2026-10-08T22:00:00.000Z", endAt: "2026-10-08T23:00:00.000Z" },
  ] });
  const saved = await service.createShift({ storeId, rosterPeriodId: period.id, date: "2026-10-09",
    startAt: "2026-10-08T22:00:00.000Z", endAt: "2026-10-08T22:30:00.000Z", breakMinutes: 0,
    shiftRoleId: role.id, assignments: [{ employeeId: "browser-thirty-minute", employeeNameSnapshot: "Thirty Minute QA",
      employeeTypeSnapshot: "REGULAR", employmentTypeSnapshot: "PartTime", officialScoreSnapshot: null,
      tierSnapshot: null, officialScoreRoundId: null, officialScoreClosedAt: null }],
  }, "qa-admin");
  const [persisted, currentPeriod, count, published] = await Promise.all([
    db.shift.findUniqueOrThrow({ where: { id: saved.id }, include: { assignments: true } }),
    db.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } }),
    db.shift.count({ where: { storeId } }),
    db.rosterPublication.findMany({ where: { rosterPeriod: { storeId } }, orderBy: { id: "asc" } }),
  ]);
  if (persisted.startAt.toISOString() !== "2026-10-08T22:00:00.000Z" ||
      persisted.endAt.toISOString() !== "2026-10-08T22:30:00.000Z" || persisted.assignments.length !== 1 ||
      persisted.assignments[0].employeeId !== "browser-thirty-minute" || count !== baselineShifts + 1 ||
      currentPeriod.version !== period.version + 1 || JSON.stringify(published) !== JSON.stringify(baselinePublished)) {
    throw new Error("Thirty-minute Shift persistence or publication invariant failed");
  }
  console.log(JSON.stringify({ verified: true, schema: state.schema, shiftId: saved.id,
    startAt: persisted.startAt.toISOString(), endAt: persisted.endAt.toISOString(),
    employeeId: persisted.assignments[0].employeeId, shiftsBefore: baselineShifts, shiftsAfter: count,
    periodVersionBefore: period.version, periodVersionAfter: currentPeriod.version,
    publicationsUnchanged: true }));
} finally {
  await db.$disconnect();
}
