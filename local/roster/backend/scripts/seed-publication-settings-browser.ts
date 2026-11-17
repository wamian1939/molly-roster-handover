import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const state = JSON.parse(await readFile(join(tmpdir(), "molly-roster-calendar-name-browser.json"), "utf8")) as { schema: string; isolatedUrl: string };
const url = new URL(state.isolatedUrl);
if (!/^codex_calendar_name_[0-9]+_[0-9a-f]{4}$/.test(state.schema) || url.searchParams.get("schema") !== state.schema
  || url.port !== "5433" || url.pathname !== "/molly_roster" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
  throw new Error("Expected guarded disposable Roster schema");
}
const db = new PrismaClient({ datasourceUrl: state.isolatedUrl });
try {
  const command = process.argv[2];
  const period = await db.rosterPeriod.findUniqueOrThrow({ where: { id: "qa-draft-period" } });
  if (period.storeId !== "browser-store") throw new Error("Unexpected fixture period");
  if (command === "seed") {
    if (period.status !== "DRAFT" || period.version !== 1) throw new Error("Expected untouched draft");
    for (const employeeId of ["browser-regular", "browser-training"]) {
      await db.employeeAvailability.create({ data: { storeId: "browser-store", employeeId, date: new Date("2026-10-09"), status: "AVAILABLE",
        startAt: new Date("2026-10-08T22:00:00.000Z"), endAt: new Date("2026-10-09T02:00:00.000Z") } });
    }
    await db.rosterStoreSettings.create({ data: { storeId: "browser-store", timezone: "Australia/Sydney", openingTime: "09:00", closingTime: "22:00", minimumShiftMinutes: 300 } });
    console.log(JSON.stringify({ seeded: true, periodVersion: period.version, minimumShiftMinutes: 300 }));
  } else if (command === "relax") {
    const settings = await db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId: "browser-store" } });
    if (settings.minimumShiftMinutes !== 300 || period.status !== "DRAFT" || period.version !== 1) throw new Error("Invalid rejection state");
    await db.rosterStoreSettings.update({ where: { storeId: "browser-store" }, data: { minimumShiftMinutes: 60, version: { increment: 1 } } });
    console.log(JSON.stringify({ relaxed: true, minimumShiftMinutes: 60 }));
  } else if (command === "verify-rejected" || command === "verify-published") {
    const [shiftCount, publicationCount, published] = await Promise.all([
      db.shift.count({ where: { rosterPeriodId: period.id } }),
      db.rosterPublication.count({ where: { rosterPeriodId: period.id } }),
      db.rosterPeriod.findUniqueOrThrow({ where: { id: period.id } }),
    ]);
    if (shiftCount !== 2 || (command === "verify-rejected" && (published.status !== "DRAFT" || published.version !== 1 || publicationCount !== 0))
      || (command === "verify-published" && (published.status !== "PUBLISHED" || published.version !== 2 || publicationCount !== 1))) {
      throw new Error("Unexpected publication or Shift state");
    }
    console.log(JSON.stringify({ verified: true, status: published.status, version: published.version, shiftCount, publicationCount }));
  } else throw new Error("Expected seed, relax, verify-rejected or verify-published");
} finally {
  await db.$disconnect();
}
