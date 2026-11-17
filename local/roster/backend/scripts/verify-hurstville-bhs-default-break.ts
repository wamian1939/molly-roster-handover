import "dotenv/config";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const raw = process.env.DATABASE_URL;
if (!raw) throw new Error("DATABASE_URL is required");
const target = new URL(raw);
if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "5433" ||
    target.pathname !== "/molly_roster" || ![null, "public"].includes(target.searchParams.get("schema"))) {
  throw new Error("Only the local molly_roster public schema may be inspected");
}
const backupPath = resolve("../docs/evidence/hurstville-bhs-default-break-before-2026-10-21.json");
const backup = JSON.parse(await readFile(backupPath, "utf8")) as {
  settings: Record<string, unknown>; shiftCountBefore: number; publicationCountBefore: number;
};
const db = new PrismaClient();
try {
  const [settings, shiftCount, publicationCount] = await Promise.all([
    db.rosterStoreSettings.findUniqueOrThrow({ where: { storeId: "hurstville" } }),
    db.shift.count({ where: { storeId: "hurstville" } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId: "hurstville" } } }),
  ]);
  const previousStableFields = { ...backup.settings };
  const currentStableFields: Record<string, unknown> = { ...settings };
  delete previousStableFields.updatedAt;
  delete currentStableFields.updatedAt;
  const expected = { ...previousStableFields, defaultBreakMinutes: 0, version: 2 };
  if (JSON.stringify(currentStableFields) !== JSON.stringify(expected) ||
      settings.updatedAt <= new Date(String(backup.settings.updatedAt)) ||
      shiftCount !== backup.shiftCountBefore || publicationCount !== backup.publicationCountBefore) {
    throw new Error("Current local settings or scheduling counts differ from the guarded backup");
  }
  console.log(JSON.stringify({ verified: true, storeId: "hurstville", defaultBreakMinutes: settings.defaultBreakMinutes,
    version: settings.version, shiftCount, publicationCount, backupPath }));
} finally {
  await db.$disconnect();
}
