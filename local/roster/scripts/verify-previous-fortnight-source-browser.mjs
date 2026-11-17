import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "../backend/node_modules/@prisma/client/default.js";

const fixture = JSON.parse(readFileSync(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || url.hostname !== "127.0.0.1" || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Expected exact isolated local Roster schema");
}
const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [periods, shifts, publications, settings] = await Promise.all([
    db.rosterPeriod.findMany({ where: { storeId: "browser-store" }, orderBy: { startDate: "asc" } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId: "browser-store" } } }),
    db.rosterStoreSettings.findUnique({ where: { storeId: "browser-store" } }),
  ]);
  const priorWeek = periods.find((period) => period.startDate.toISOString().slice(0, 10) === "2026-10-19");
  if (periods.length !== 3 || priorWeek?.endDate.toISOString().slice(0, 10) !== "2026-10-25"
    || priorWeek.cycleType !== "WEEK" || priorWeek.version !== 1
    || periods.some((period) => period.cycleType === "FORTNIGHT")
    || shifts !== 3 || publications !== 1
    || settings?.cycleType !== "FORTNIGHT" || settings.fortnightAnchorDate !== "2026-10-26") {
    throw new Error("Copy Previous Fortnight changed the isolated roster state");
  }
  console.log(JSON.stringify({ verified: true, periods: periods.length, priorWeekVersion: priorWeek.version,
    shifts, publications, cycleType: settings.cycleType, anchor: settings.fortnightAnchorDate }));
} finally {
  await db.$disconnect();
}
