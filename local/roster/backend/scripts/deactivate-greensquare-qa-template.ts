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

const id = "cmtpzzm9f000divg07fqgh76q";
const storeId = "greensquare";
const backupPath = resolve("../docs/evidence/greensquare-legacy-qa-template-before-2026-10-21.json");
const db = new PrismaClient();
try {
  const before = await db.shiftTemplate.findUnique({ where: { id } });
  if (!before || before.storeId !== storeId || before.name !== "QA 早班" ||
      before.shiftRoleId !== null || !before.isActive || before.version !== 1 ||
      before.startTime !== "09:00" || before.endTime !== "17:00" || before.breakMinutes !== 30) {
    throw new Error("The QA template no longer matches the audited record; no update made");
  }
  const [shiftCountBefore, publicationCountBefore] = await Promise.all([
    db.shift.count({ where: { storeId } }), db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
  ]);
  await writeFile(backupPath, JSON.stringify({ reason: "Reversible deactivation of a QA-named time-only preset", before }, null, 2) + "\n",
    { encoding: "utf8", flag: "wx" });
  const result = await db.shiftTemplate.updateMany({
    where: { id, storeId, name: "QA 早班", shiftRoleId: null, isActive: true, version: 1 },
    data: { isActive: false, version: { increment: 1 } },
  });
  if (result.count !== 1) throw new Error("Template changed concurrently; backup retained, no update made");
  const [after, shiftCountAfter, publicationCountAfter] = await Promise.all([
    db.shiftTemplate.findUniqueOrThrow({ where: { id } }),
    db.shift.count({ where: { storeId } }), db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
  ]);
  if (after.isActive || after.version !== 2 || shiftCountAfter !== shiftCountBefore || publicationCountAfter !== publicationCountBefore) {
    throw new Error("Post-update verification failed; inspect the backup and database immediately");
  }
  console.log(JSON.stringify({ storeId, templateId: id, activeBefore: true, activeAfter: after.isActive,
    versionBefore: before.version, versionAfter: after.version, shiftCountBefore, shiftCountAfter,
    publicationCountBefore, publicationCountAfter, backupPath }));
} finally {
  await db.$disconnect();
}
