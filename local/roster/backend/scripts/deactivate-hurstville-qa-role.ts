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

const id = "cmtq01x14000nivg0inbcx8yq";
const storeId = "hurstville";
const backupPath = resolve("../docs/evidence/hurstville-legacy-qa-role-before-2026-10-21.json");
const db = new PrismaClient();
try {
  const before = await db.shiftRole.findUnique({ where: { id },
    include: { _count: { select: { shifts: true, templates: true } } } });
  if (!before || before.storeId !== storeId || before.code !== "qa-role" || before.nameZh !== "验收岗" ||
      !before.isActive || before.version !== 1 || before._count.shifts !== 8 || before._count.templates !== 0) {
    throw new Error("Historical QA role no longer matches the audited baseline; no update made");
  }
  const [shiftCountBefore, publicationCountBefore, assignmentCountBefore] = await Promise.all([
    db.shift.count({ where: { storeId } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
    db.shiftAssignment.count({ where: { shift: { shiftRoleId: id } } }),
  ]);
  await writeFile(backupPath, JSON.stringify({
    reason: "Reversibly deactivate the unsupported local historical QA role, preserving all shifts",
    before, shiftCountBefore, publicationCountBefore, assignmentCountBefore,
  }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  const result = await db.shiftRole.updateMany({
    where: { id, storeId, code: "qa-role", nameZh: "验收岗", isActive: true, version: 1 },
    data: { isActive: false, version: { increment: 1 } },
  });
  if (result.count !== 1) throw new Error("Historical QA role changed concurrently; backup retained, no update made");
  const [after, shiftCountAfter, publicationCountAfter, assignmentCountAfter] = await Promise.all([
    db.shiftRole.findUniqueOrThrow({ where: { id }, include: { _count: { select: { shifts: true, templates: true } } } }),
    db.shift.count({ where: { storeId } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
    db.shiftAssignment.count({ where: { shift: { shiftRoleId: id } } }),
  ]);
  if (after.isActive || after.version !== 2 || after._count.shifts !== 8 || after._count.templates !== 0 ||
      shiftCountBefore !== shiftCountAfter || publicationCountBefore !== publicationCountAfter ||
      assignmentCountBefore !== assignmentCountAfter) {
    throw new Error("Post-update verification failed; inspect the exact backup and database");
  }
  console.log(JSON.stringify({ storeId, roleId: id, activeBefore: true, activeAfter: after.isActive,
    versionBefore: 1, versionAfter: after.version, historicalShifts: after._count.shifts,
    shiftCountBefore, shiftCountAfter, publicationCountBefore, publicationCountAfter,
    assignmentCountBefore, assignmentCountAfter, backupPath }));
} finally {
  await db.$disconnect();
}
