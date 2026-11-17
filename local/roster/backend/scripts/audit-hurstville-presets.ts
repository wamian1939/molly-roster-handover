import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  const storeId = "hurstville";
  const [templates, shortcuts, roles, shiftCount, publicationCount, availabilityCount, importCount] = await Promise.all([
    db.shiftTemplate.findMany({ where: { storeId }, select: {
      id: true, name: true, startTime: true, endTime: true, breakMinutes: true,
      shiftRoleId: true, isActive: true, displayOrder: true, version: true,
    }, orderBy: { displayOrder: "asc" } }),
    db.availabilityScriptShortcuts.findUnique({ where: { storeId } }),
    db.shiftRole.findMany({ where: { storeId, isActive: true }, select: { id: true, nameZh: true } }),
    db.shift.count({ where: { storeId } }),
    db.rosterPublication.count({ where: { rosterPeriod: { storeId } } }),
    db.employeeAvailability.count({ where: { storeId } }),
    db.availabilityScriptImport.count({ where: { storeId } }),
  ]);
  console.log(JSON.stringify({ storeId, templates, shortcuts, roles, shiftCount, publicationCount,
    availabilityCount, importCount }, null, 2));
} finally {
  await db.$disconnect();
}
