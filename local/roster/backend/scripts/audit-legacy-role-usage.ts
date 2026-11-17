import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required");
const url = new URL(connection);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5433"
  || url.pathname !== "/molly_roster" || ![null, "public"].includes(url.searchParams.get("schema"))) {
  throw new Error("This read-only audit targets the local molly_roster public schema only");
}

const db = new PrismaClient();
try {
  const [roles, shifts, templates] = await Promise.all([
    db.shiftRole.findMany({ select: { id: true, code: true, nameZh: true, storeId: true,
      isActive: true, version: true }, orderBy: [{ storeId: "asc" }, { code: "asc" }] }),
    db.shift.findMany({ select: { shiftRoleId: true, storeId: true,
      rosterPeriod: { select: { status: true } } } }),
    db.shiftTemplate.findMany({ select: { shiftRoleId: true, storeId: true, isActive: true } }),
  ]);
  console.log(JSON.stringify({ roles: roles.map((role) => {
    const used = shifts.filter((shift) => shift.shiftRoleId === role.id);
    const attachedTemplates = templates.filter((template) => template.shiftRoleId === role.id);
    return { id: role.id, code: role.code, name: role.nameZh, storeId: role.storeId,
      active: role.isActive, version: role.version,
      draftShifts: used.filter((shift) => shift.rosterPeriod.status === "DRAFT").length,
      publishedShifts: used.filter((shift) => shift.rosterPeriod.status === "PUBLISHED").length,
      shiftStores: Object.fromEntries([...new Set(used.map((shift) => shift.storeId))].sort()
        .map((storeId) => [storeId, used.filter((shift) => shift.storeId === storeId).length])),
      activeTemplates: attachedTemplates.filter((template) => template.isActive).length,
      inactiveTemplates: attachedTemplates.filter((template) => !template.isActive).length,
    };
  }) }, null, 2));
} finally { await db.$disconnect(); }
