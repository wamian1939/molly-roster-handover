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
  const [periods, shifts, assignments, publications, settings] = await Promise.all([
    db.rosterPeriod.findMany({ where: { storeId: "browser-store" }, select: { id: true, version: true, status: true } }),
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.shiftAssignment.count({ where: { shift: { storeId: "browser-store" } } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId: "browser-store" } } }),
    db.rosterStoreSettings.count({ where: { storeId: "browser-store" } }),
  ]);
  if (periods.length !== 2 || periods.some((period) => period.version !== 1)
    || periods.find((period) => period.id === "qa-draft-period")?.status !== "DRAFT"
    || periods.find((period) => period.id === "qa-published-period")?.status !== "PUBLISHED"
    || shifts !== 3 || assignments !== 3 || publications !== 1 || settings !== 0) {
    throw new Error("Calendar URL navigation mutated the isolated roster fixture");
  }
  console.log(JSON.stringify({ verified: true, periods: periods.length, shifts, assignments, publications, settings }));
} finally {
  await db.$disconnect();
}
