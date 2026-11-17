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

const targets = [
  { id: "cmtpzzy98000givg0wubtyff4", storeId: "greensquare", name: "QA 标准全天", version: 1 },
  { id: "cmtq00t8n000livg0y34vn51m", storeId: "hurstville", name: "验收标准全天", version: 3 },
] as const;
const backupPath = resolve("../docs/evidence/legacy-qa-availability-templates-before-2026-10-21.json");
const db = new PrismaClient();
try {
  const [before, shiftCount, availabilityCount, publicationCount] = await Promise.all([
    db.availabilityTemplate.findMany({ where: { id: { in: targets.map((target) => target.id) } }, orderBy: { id: "asc" } }),
    db.shift.count(),
    db.employeeAvailability.count(),
    db.rosterPublication.count(),
  ]);
  if (before.length !== targets.length || targets.some((target) => {
    const row = before.find((item) => item.id === target.id);
    return !row || row.storeId !== target.storeId || row.name !== target.name ||
      row.version !== target.version || !row.isActive || !Array.isArray(row.slots) || row.slots.length !== 7;
  })) throw new Error("QA templates changed from the audited baseline; no update made");

  await writeFile(backupPath, JSON.stringify({ before, shiftCount, availabilityCount, publicationCount,
    reason: "Reversibly hide two local QA availability templates without touching employee availability or shifts" }, null, 2) + "\n",
  { encoding: "utf8", flag: "wx" });

  await db.$transaction(async (tx) => {
    for (const target of targets) {
      const result = await tx.availabilityTemplate.updateMany({
        where: { ...target, isActive: true },
        data: { isActive: false, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new Error(`Template ${target.id} changed concurrently`);
    }
  });

  const [after, shiftCountAfter, availabilityCountAfter, publicationCountAfter] = await Promise.all([
    db.availabilityTemplate.findMany({ where: { id: { in: targets.map((target) => target.id) } }, orderBy: { id: "asc" } }),
    db.shift.count(),
    db.employeeAvailability.count(),
    db.rosterPublication.count(),
  ]);
  if (after.length !== 2 || after.some((row) => row.isActive || row.version !==
    targets.find((target) => target.id === row.id)!.version + 1) ||
    shiftCountAfter !== shiftCount || availabilityCountAfter !== availabilityCount ||
    publicationCountAfter !== publicationCount) throw new Error("Post-update verification failed; inspect backup and database");

  console.log(JSON.stringify({ backupPath, templates: after.map(({ id, storeId, name, version, isActive }) =>
    ({ id, storeId, name, version, isActive })), shiftCount, shiftCountAfter,
  availabilityCount, availabilityCountAfter, publicationCount, publicationCountAfter }));
} finally {
  await db.$disconnect();
}
