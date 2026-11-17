import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workspace = dirname(dirname(fileURLToPath(import.meta.url)));
const requireBackend = createRequire(join(workspace, "backend", "package.json"));
const { PrismaClient } = requireBackend("@prisma/client");
const fixture = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8"));
const url = new URL(fixture.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(fixture.schema)
  || !["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || url.searchParams.get("schema") !== fixture.schema) {
  throw new Error("Requires the exact disposable local Roster schema");
}

const db = new PrismaClient({ datasourceUrl: fixture.isolatedUrl });
try {
  const [shifts, settings, availability] = await Promise.all([
    db.shift.count({ where: { storeId: "browser-store" } }),
    db.rosterStoreSettings.count({ where: { storeId: "browser-store" } }),
    db.employeeAvailability.count({ where: { storeId: "browser-store" } }),
  ]);
  if (shifts !== 3 || settings !== 0 || availability !== 0) throw new Error("Unexpected disposable fixture baseline");
  await db.$transaction([
    db.rosterStoreSettings.create({ data: { storeId: "browser-store", timezone: "Australia/Sydney", openingTime: "18:00", closingTime: "03:00", minimumShiftMinutes: 60, slotIntervalMinutes: 30, defaultBreakMinutes: 0 } }),
    db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-cindy", date: new Date("2026-10-09"), status: "AVAILABLE", startAt: new Date("2026-10-09T11:00:00.000Z"), endAt: new Date("2026-10-09T16:00:00.000Z") } }),
    db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006", date: new Date("2026-10-09"), status: "AVAILABLE", startAt: new Date("2026-10-09T09:00:00.000Z"), endAt: new Date("2026-10-09T16:00:00.000Z") } }),
  ]);
  console.log(JSON.stringify({ seeded: true, employeeId: "browser-cindy", availabilityDate: "2026-10-09", localWindow: "22:00-next-day-03:00" }));
} finally {
  await db.$disconnect();
}
