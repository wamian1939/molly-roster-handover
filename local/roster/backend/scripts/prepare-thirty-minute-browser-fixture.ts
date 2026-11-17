import "dotenv/config";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { RosterService } from "../src/rosterService.js";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema)) throw new Error("Expected a disposable Roster schema");
const target = new URL(state.isolatedUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "5433" ||
    target.pathname !== "/molly_roster" || target.searchParams.get("schema") !== state.schema) {
  throw new Error("Expected the exact disposable Roster database");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const service = new RosterService(db);
  if (await db.rosterStoreSettings.count({ where: { storeId: "browser-store" } }) !== 0 ||
      await db.employeeAvailability.count({ where: { storeId: "browser-store", employeeId: "browser-HandoverEmployee006" } }) !== 0) {
    throw new Error("Disposable browser baseline differs; nothing changed");
  }
  await service.saveSettings({ storeId: "browser-store", timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00",
    slotIntervalMinutes: 30, minimumShiftMinutes: 30, defaultBreakMinutes: 0, weekStartsOn: 1,
    cycleType: "WEEK", weeklyHourWarning: 38, dailyHourWarning: 10 });
  await service.replaceAvailability({ storeId: "browser-store", employeeId: "browser-HandoverEmployee006", dates: ["2026-10-09"], entries: [
    { date: "2026-10-09", status: "AVAILABLE", startAt: "2026-10-08T22:00:00.000Z", endAt: "2026-10-08T23:00:00.000Z" },
  ] });
  console.log(JSON.stringify({ prepared: true, schema: state.schema, storeId: "browser-store", employeeId: "browser-HandoverEmployee006",
    date: "2026-10-09", available: "09:00-10:00", minimumShiftMinutes: 30 }));
} finally {
  await db.$disconnect();
}
