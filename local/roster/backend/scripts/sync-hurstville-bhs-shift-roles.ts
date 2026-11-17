import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

// These are Roster scheduling labels for the already approved Evaluate job
// definitions. They do not create Evaluate employee job assignments.
const storeId = "hurstville";
const desired = [
  { code: "li-xiaobai", nameZh: "莉小白", colorToken: "#be185d", displayOrder: 20 },
  { code: "front-counter", nameZh: "前台", colorToken: "#b91c1c", displayOrder: 30 },
] as const;
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply") || args.filter((arg) => arg === "--apply").length > 1) {
  throw new Error("Usage: tsx scripts/sync-hurstville-bhs-shift-roles.ts [--apply]");
}
const apply = args.includes("--apply");
const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required");
const url = new URL(connection);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || (url.searchParams.get("schema") ?? "public") !== "public") {
  throw new Error("Only local molly_roster.public may be modified");
}

const db = new PrismaClient();
try {
  const [roles, counts] = await Promise.all([
    db.shiftRole.findMany({ where: { OR: [{ storeId }, { storeId: null }] },
      select: { id: true, storeId: true, code: true, nameZh: true, colorToken: true,
        requiredSkillCodes: true, displayOrder: true, isActive: true, version: true,
        _count: { select: { shifts: true, templates: true } } },
      orderBy: [{ storeId: "asc" }, { displayOrder: "asc" }, { code: "asc" }] }),
    Promise.all([
      db.shift.count({ where: { storeId } }),
      db.shiftAssignment.count({ where: { shift: { storeId } } }),
      db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
    ]),
  ]);
  for (const item of desired) {
    const codeMatches = roles.filter((role) => role.code === item.code);
    if (codeMatches.length > 1 || codeMatches.some((role) => role.storeId !== storeId
      || role.nameZh !== item.nameZh || !role.isActive || role.colorToken !== item.colorToken
      || role.displayOrder !== item.displayOrder || role.requiredSkillCodes.length !== 0)) {
      throw new Error(`Existing ${item.code} role conflicts with the approved Hurstville mapping`);
    }
  }
  const missing = desired.filter((item) => !roles.some((role) => role.code === item.code));
  if (!apply || !missing.length) {
    console.log(JSON.stringify({ mode: apply ? "already-aligned" : "dry-run", storeId,
      missing, existing: desired.filter((item) => !missing.includes(item)), counts }, null, 2));
  } else {
    const backupPath = join(tmpdir(), `molly-roster-hurstville-role-catalog-before-${Date.now()}.json`);
    await writeFile(backupPath, JSON.stringify({ storeId, roles, counts }, null, 2), { encoding: "utf8", flag: "wx" });
    await db.$transaction(async (tx) => {
      const current = await tx.shiftRole.findMany({ where: { OR: [{ storeId }, { storeId: null }] },
        select: { id: true, storeId: true, code: true, nameZh: true, isActive: true, version: true } });
      if (current.length !== roles.length || current.some((role) => {
        const original = roles.find((item) => item.id === role.id);
        return !original || original.storeId !== role.storeId || original.code !== role.code
          || original.nameZh !== role.nameZh || original.isActive !== role.isActive
          || original.version !== role.version;
      })) throw new Error("Shift Role catalog changed since preflight");
      for (const item of missing) {
        await tx.shiftRole.create({ data: { ...item, storeId, requiredSkillCodes: [] } });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const [after, shiftCount, assignmentCount, publicationCount] = await Promise.all([
      db.shiftRole.findMany({ where: { storeId, code: { in: desired.map((item) => item.code) } },
        select: { code: true, nameZh: true, colorToken: true, displayOrder: true, isActive: true, requiredSkillCodes: true,
          _count: { select: { shifts: true, templates: true } } } }),
      db.shift.count({ where: { storeId } }),
      db.shiftAssignment.count({ where: { shift: { storeId } } }),
      db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
    ]);
    if (after.length !== desired.length || after.some((role) => {
      const job = desired.find((item) => item.code === role.code);
      return !job || role.nameZh !== job.nameZh || role.colorToken !== job.colorToken
        || role.displayOrder !== job.displayOrder || !role.isActive || role.requiredSkillCodes.length
        || role._count.shifts || role._count.templates;
    }) || counts[0] !== shiftCount || counts[1] !== assignmentCount || counts[2] !== publicationCount) {
      throw new Error(`Post-write verification failed; inspect ${backupPath} and the database`);
    }
    console.log(JSON.stringify({ mode: "applied", storeId, created: missing.map((item) => item.code),
      shiftCount, assignmentCount, publicationCount, backupPath }, null, 2));
  }
} finally {
  await db.$disconnect();
}
