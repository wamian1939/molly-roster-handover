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

const id = "cmtq00lt7000iivg0tc4rr8ql";
const storeId = "hurstville";
const backupPath = resolve("../docs/evidence/hurstville-legacy-qa-template-before-2026-10-20.json");
const db = new PrismaClient();
try {
  const before = await db.shiftTemplate.findUnique({ where: { id } });
  if (!before || before.storeId !== storeId || before.name !== "验收早班" ||
      before.shiftRoleId !== null || !before.isActive || before.version !== 1 ||
      before.startTime !== "09:00" || before.endTime !== "17:00") {
    throw new Error("The legacy QA template no longer matches the audited record; no update made");
  }
  const shiftCountBefore = await db.shift.count({ where: { storeId } });
  await writeFile(backupPath, JSON.stringify({ reason: "Reversible deactivation of an old QA-named time-only preset", before }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  const result = await db.shiftTemplate.updateMany({
    where: { id, storeId, name: "验收早班", shiftRoleId: null, isActive: true, version: 1 },
    data: { isActive: false, version: { increment: 1 } },
  });
  if (result.count !== 1) throw new Error("Template changed concurrently; backup retained, no update made");
  const [after, shiftCountAfter] = await Promise.all([
    db.shiftTemplate.findUniqueOrThrow({ where: { id } }),
    db.shift.count({ where: { storeId } }),
  ]);
  if (after.isActive || after.version !== 2 || shiftCountAfter !== shiftCountBefore) {
    throw new Error("Post-update verification failed; inspect the backup and database immediately");
  }
  console.log(JSON.stringify({ storeId, templateId: id, activeBefore: true, activeAfter: after.isActive,
    versionBefore: before.version, versionAfter: after.version, shiftCountBefore, shiftCountAfter, backupPath }));
} finally {
  await db.$disconnect();
}
