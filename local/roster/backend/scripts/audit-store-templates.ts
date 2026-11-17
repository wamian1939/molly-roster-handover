import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const connection = process.env.DATABASE_URL;
if (!connection) throw new Error("DATABASE_URL is required");
const database = new URL(connection);
if (!["127.0.0.1", "localhost"].includes(database.hostname) || database.port !== "5433" ||
    database.pathname !== "/molly_roster" || ![null, "public"].includes(database.searchParams.get("schema"))) {
  throw new Error("Only the local molly_roster public schema may be audited");
}

const storeId = process.argv[2] ?? "hurstville";
if (!/^[a-zA-Z0-9_-]+$/.test(storeId)) throw new Error("Invalid store ID");
const db = new PrismaClient();
try {
  const [templates, roles, usage] = await Promise.all([
    db.shiftTemplate.findMany({
      where: { storeId },
      select: { id: true, name: true, startTime: true, endTime: true, shiftRoleId: true,
        isActive: true, version: true, createdAt: true, updatedAt: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    db.shiftRole.findMany({
      where: { OR: [{ storeId }, { storeId: null }] },
      select: { id: true, storeId: true, code: true, nameZh: true, isActive: true },
      orderBy: [{ storeId: "desc" }, { nameZh: "asc" }],
    }),
    db.shift.groupBy({ by: ["shiftRoleId"], where: { storeId }, _count: { _all: true } }),
  ]);
  console.log(JSON.stringify({ storeId, templates, roles,
    shiftUsageByRole: usage.map((row) => ({ shiftRoleId: row.shiftRoleId, count: row._count._all })) }, null, 2));
} finally {
  await db.$disconnect();
}
