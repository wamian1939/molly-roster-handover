import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required");
const database = new URL(connection);
if (!["127.0.0.1", "localhost"].includes(database.hostname) || database.port !== "5433" ||
    database.pathname !== "/molly_roster" || ![null, "public"].includes(database.searchParams.get("schema"))) {
  throw new Error("Only the local molly_roster public schema may be modified");
}

const storeId = "hurstville";
const backupPath = resolve("../docs/evidence/hurstville-bhs-default-break-before-2026-10-21.json");
const db = new PrismaClient();
try {
  const [settings, shiftCountBefore, publicationCountBefore] = await Promise.all([
    db.rosterStoreSettings.findUnique({ where: { storeId } }),
    db.shift.count({ where: { storeId } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
  ]);
  if (!settings || settings.version !== 1 || settings.defaultBreakMinutes !== 30 ||
      settings.minimumShiftMinutes !== 60 || settings.openingTime !== "09:00" || settings.closingTime !== "22:00") {
    throw new Error("Hurstville settings no longer match the audited baseline; nothing changed");
  }

  await writeFile(backupPath, JSON.stringify({
    reason: "Align only Hurstville's new-Shift default break with read-only BHS Day Add evidence",
    observedReference: "BHS 2026-10-21 Day Add 08:00-08:30 and unsaved 08:00-10:00 both showed Break Time 0",
    settings, shiftCountBefore, publicationCountBefore,
  }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });

  const changed = await db.rosterStoreSettings.updateMany({
    where: { storeId, version: 1, defaultBreakMinutes: 30 },
    data: { defaultBreakMinutes: 0, version: { increment: 1 } },
  });
  if (changed.count !== 1) throw new Error("Concurrent settings change; backup exists but no setting was updated");

  const [after, shiftCountAfter, publicationCountAfter] = await Promise.all([
    db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId } }),
    db.shift.count({ where: { storeId } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
  ]);
  const stableBefore: Record<string, unknown> = { ...settings };
  const stableAfter: Record<string, unknown> = { ...after };
  delete stableBefore.updatedAt;
  delete stableAfter.updatedAt;
  const expectedSettings = { ...stableBefore, defaultBreakMinutes: 0, version: settings.version + 1 };
  if (after.version !== 2 || after.defaultBreakMinutes !== 0 ||
      JSON.stringify(stableAfter) !== JSON.stringify(expectedSettings) || after.updatedAt <= settings.updatedAt ||
      shiftCountAfter !== shiftCountBefore || publicationCountAfter !== publicationCountBefore) {
    throw new Error("Post-update verification failed; inspect the backup and exact database before any further action");
  }
  console.log(JSON.stringify({ storeId, previousBreakMinutes: settings.defaultBreakMinutes,
    currentBreakMinutes: after.defaultBreakMinutes, versionBefore: settings.version, versionAfter: after.version,
    shiftCountBefore, shiftCountAfter, publicationCountBefore, publicationCountAfter, backupPath }));
} finally {
  await db.$disconnect();
}
