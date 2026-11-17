import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const target = new URL(databaseUrl);
if (!(["localhost", "127.0.0.1"].includes(target.hostname)
  && target.port === "5432" && target.pathname === "/evaluate_molly"
  && (target.searchParams.get("schema") ?? "public") === "public")) {
  throw new Error("Position audit is restricted to the local Evaluate development database.");
}

const db = new PrismaClient();
try {
  const [stores, jobs, activeEmployees, assignedEmployees, skillCategories] = await Promise.all([
    db.store.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { id: "asc" } }),
    db.storeJobDefinition.findMany({
      select: { storeId: true, name: true, code: true, isActive: true, _count: { select: { assignments: true } } },
      orderBy: [{ storeId: "asc" }, { displayOrder: "asc" }, { name: "asc" }],
    }),
    db.employee.count({ where: { status: "Active", store: { isActive: true } } }),
    db.employee.count({ where: { status: "Active", store: { isActive: true }, jobAssignments: { some: {} } } }),
    db.skillDefinition.groupBy({ by: ["category"], where: { isActive: true }, _count: { id: true }, orderBy: { category: "asc" } }),
  ]);
  console.log(JSON.stringify({
    scope: "read-only local development catalog; no employee names or HR fields",
    stores,
    jobs: jobs.map((job) => ({ storeId: job.storeId, name: job.name, code: job.code, isActive: job.isActive, assignedEmployees: job._count.assignments })),
    activeEmployees,
    employeesWithFormalPositions: assignedEmployees,
    activeSkillCategories: skillCategories.map((category) => ({ category: category.category, definitions: category._count.id })),
  }, null, 2));
} finally {
  await db.$disconnect();
}
