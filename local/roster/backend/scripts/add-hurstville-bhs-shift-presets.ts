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
const expected = [
  { code: "AA", startTime: "10:00", endTime: "22:00", breakMinutes: 60 },
  { code: "BB", startTime: "10:00", endTime: "17:00", breakMinutes: 30 },
  { code: "CC", startTime: "16:00", endTime: "22:00", breakMinutes: 0 },
] as const;
const backupPath = resolve("../docs/evidence/hurstville-bhs-shift-presets-before-2026-10-21.json");
const db = new PrismaClient();
try {
  const [templates, shortcuts, shiftCountBefore, publicationCountBefore] = await Promise.all([
    db.shiftTemplate.findMany({ where: { storeId } }),
    db.availabilityScriptShortcuts.findUnique({ where: { storeId } }),
    db.shift.count({ where: { storeId } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
  ]);
  if (templates.length !== 1 || templates[0]!.name !== "验收早班" || templates[0]!.isActive ||
      templates[0]!.shiftRoleId !== null || templates[0]!.version !== 2) {
    throw new Error("Hurstville template baseline changed; no templates created");
  }
  const saved = shortcuts?.shortcuts;
  if (!shortcuts || shortcuts.version !== 1 || !Array.isArray(saved) || saved.length !== expected.length ||
      expected.some((item, index) => {
        const row = saved[index];
        return !row || typeof row !== "object" || Array.isArray(row) ||
          row.code !== item.code || row.startTime !== item.startTime || row.endTime !== item.endTime;
      })) {
    throw new Error("Hurstville script shortcuts differ from the observed AA/BB/CC baseline; no templates created");
  }
  await writeFile(backupPath, JSON.stringify({
    reason: "Add only observed BHS Hurstville AA/BB/CC time-and-break Shift presets to local Roster",
    templates, shortcuts, shiftCountBefore, publicationCountBefore,
  }, null, 2) + "\n", { encoding: "utf8", flag: "wx" });
  await db.$transaction(async (transaction) => {
    const existingNames = await transaction.shiftTemplate.findMany({
      where: { storeId, name: { in: expected.map((item) => item.code) } }, select: { name: true },
    });
    if (existingNames.length) throw new Error("A target preset appeared concurrently; no templates created");
    await transaction.shiftTemplate.createMany({ data: expected.map((item, index) => ({
      storeId, name: item.code, startTime: item.startTime, endTime: item.endTime,
      breakMinutes: item.breakMinutes, shiftRoleId: null, isActive: true, displayOrder: index + 1,
    })) });
  });
  const [after, shiftCountAfter, publicationCountAfter] = await Promise.all([
    db.shiftTemplate.findMany({ where: { storeId, name: { in: expected.map((item) => item.code) } },
      orderBy: { displayOrder: "asc" } }),
    db.shift.count({ where: { storeId } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
  ]);
  if (after.length !== expected.length || after.some((row, index) => row.name !== expected[index]!.code ||
      row.startTime !== expected[index]!.startTime || row.endTime !== expected[index]!.endTime ||
      row.breakMinutes !== expected[index]!.breakMinutes || row.shiftRoleId !== null || !row.isActive) ||
      shiftCountBefore !== shiftCountAfter || publicationCountBefore !== publicationCountAfter) {
    throw new Error("Post-create verification failed; inspect the exact backup and database");
  }
  console.log(JSON.stringify({ storeId, added: after.map((row) => ({ id: row.id, name: row.name,
    startTime: row.startTime, endTime: row.endTime, breakMinutes: row.breakMinutes })),
    shiftCountBefore, shiftCountAfter, publicationCountBefore, publicationCountAfter, backupPath }));
} finally {
  await db.$disconnect();
}
