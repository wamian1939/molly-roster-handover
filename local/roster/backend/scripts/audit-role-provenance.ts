import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
try {
  const roles = await db.shiftRole.findMany({
    select: { id: true, code: true, nameZh: true, storeId: true, isActive: true, version: true,
      _count: { select: { shifts: true, templates: true } } },
    orderBy: [{ storeId: "asc" }, { displayOrder: "asc" }, { code: "asc" }],
  });
  const qaShifts = await db.shift.findMany({ where: { shiftRole: { code: "qa-role" } },
    select: { storeId: true, date: true, rosterPeriod: { select: { status: true, startDate: true, endDate: true } } },
    orderBy: { date: "asc" } });
  console.log(JSON.stringify({ roles: roles.map((role) => ({
    id: role.id, code: role.code, name: role.nameZh, storeId: role.storeId, scope: role.storeId === null ? "GLOBAL" : "STORE",
    active: role.isActive, version: role.version, shifts: role._count.shifts, templates: role._count.templates,
  })), qaRoleShifts: qaShifts.map((shift) => ({ storeId: shift.storeId,
    date: shift.date.toISOString().slice(0, 10), periodStatus: shift.rosterPeriod.status,
    periodStart: shift.rosterPeriod.startDate.toISOString().slice(0, 10),
    periodEnd: shift.rosterPeriod.endDate.toISOString().slice(0, 10) })) }, null, 2));
} finally {
  await db.$disconnect();
}
