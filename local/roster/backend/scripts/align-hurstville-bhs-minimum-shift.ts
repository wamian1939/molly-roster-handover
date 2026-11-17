import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required");
const target = new URL(connection);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "5433" ||
    target.pathname !== "/molly_roster" || ![null, "public"].includes(target.searchParams.get("schema"))) {
  throw new Error("Only the local molly_roster public schema may be modified");
}

const apply = process.argv.includes("--apply");
const storeId = "hurstville";
const backupPath = resolve("../docs/evidence/hurstville-bhs-minimum-shift-before-2026-10-21.json");
const db = new PrismaClient();

try {
  const [settings, shiftCount, assignmentCount, publications] = await Promise.all([
    db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId } }),
    db.shift.count({ where: { storeId } }),
    db.shiftAssignment.count({ where: { shift: { storeId } } }),
    db.rosterPublication.findMany({ where: { rosterPeriod: { storeId } }, select: { id: true, periodVersion: true }, orderBy: { id: "asc" } }),
  ]);
  if (settings.minimumShiftMinutes === 30) {
    console.log(JSON.stringify({ status: "already-aligned", storeId, version: settings.version, shiftCount, assignmentCount, publicationCount: publications.length }));
  } else {
    if (settings.version !== 2 || settings.minimumShiftMinutes !== 60 || settings.slotIntervalMinutes !== 30 ||
        settings.defaultBreakMinutes !== 0 || settings.openingTime !== "09:00" || settings.closingTime !== "22:00" ||
        shiftCount !== 13 || assignmentCount !== 23 || publications.length !== 2) {
      throw new Error("Hurstville settings or schedule no longer match the audited baseline; nothing changed");
    }
    if (!apply) {
      console.log(JSON.stringify({ status: "dry-run", storeId, currentMinimumMinutes: 60, proposedMinimumMinutes: 30,
        version: settings.version, shiftCount, assignmentCount, publicationCount: publications.length, backupPath }));
    } else {
      await writeFile(backupPath, JSON.stringify({ reason: "Align Hurstville Day selection with observed BHS 30-minute grid and frontend staging",
        limitation: "BHS server Submit acceptance of a 30-minute Shift was not tested", settings, shiftCount, assignmentCount, publications }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
      const changed = await db.rosterStoreSettings.updateMany({
        where: { storeId, version: 2, minimumShiftMinutes: 60, slotIntervalMinutes: 30, defaultBreakMinutes: 0 },
        data: { minimumShiftMinutes: 30, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new Error("Concurrent settings update; backup exists, inspect current row before retrying");
      const [after, shiftsAfter, assignmentsAfter, publicationsAfter] = await Promise.all([
        db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId } }),
        db.shift.count({ where: { storeId } }),
        db.shiftAssignment.count({ where: { shift: { storeId } } }),
        db.rosterPublication.findMany({ where: { rosterPeriod: { storeId } }, select: { id: true, periodVersion: true }, orderBy: { id: "asc" } }),
      ]);
      const beforeComparable: Record<string, unknown> = { ...settings };
      const afterComparable: Record<string, unknown> = { ...after };
      delete beforeComparable.updatedAt;
      delete afterComparable.updatedAt;
      if (JSON.stringify(afterComparable) !== JSON.stringify({ ...beforeComparable, minimumShiftMinutes: 30, version: 3 }) ||
          after.updatedAt <= settings.updatedAt || shiftsAfter !== shiftCount || assignmentsAfter !== assignmentCount ||
          JSON.stringify(publicationsAfter) !== JSON.stringify(publications)) {
        throw new Error("Post-update verification failed; inspect the backup and database before further changes");
      }
      console.log(JSON.stringify({ status: "applied", storeId, minimumShiftMinutes: after.minimumShiftMinutes,
        versionBefore: settings.version, versionAfter: after.version, shiftCount: shiftsAfter,
        assignmentCount: assignmentsAfter, publicationCount: publicationsAfter.length, backupPath }));
    }
  }
} finally {
  await db.$disconnect();
}
