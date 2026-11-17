import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const target = new URL(databaseUrl);
if (!(["localhost", "127.0.0.1"].includes(target.hostname)
  && target.port === "5432" && target.pathname === "/evaluate_molly"
  && (target.searchParams.get("schema") ?? "public") === "public")) {
  throw new Error("Employee completeness audit is restricted to the local Evaluate development database.");
}

const db = new PrismaClient();
try {
  const employees = await db.employee.findMany({ select: {
    id: true, storeId: true, displayName: true, givenName: true, surname: true, englishName: true,
    employmentCommencementDate: true, status: true, archivedAt: true,
    store: { select: { isActive: true } },
    jobAssignments: { select: { storeId: true, job: { select: { storeId: true, isActive: true } } } },
  } });
  const byDisplayName = new Map<string, number>();
  for (const employee of employees) {
    const key = employee.displayName.normalize("NFKC").trim().toLowerCase();
    byDisplayName.set(key, (byDisplayName.get(key) ?? 0) + 1);
  }
  const repeatedNames = [...byDisplayName.values()].filter((count) => count > 1);
  console.log(JSON.stringify({
    scope: "read-only local development master-data completeness; counts only; names and HR values omitted",
    total: employees.length,
    active: employees.filter((employee) => employee.status === "Active").length,
    archived: employees.filter((employee) => employee.status === "Archived").length,
    blankDisplayNames: employees.filter((employee) => !employee.displayName.trim()).length,
    missingGivenName: employees.filter((employee) => !employee.givenName?.trim()).length,
    missingSurname: employees.filter((employee) => !employee.surname?.trim()).length,
    missingEnglishName: employees.filter((employee) => !employee.englishName?.trim()).length,
    missingCommencementDate: employees.filter((employee) => !employee.employmentCommencementDate).length,
    possibleDuplicateDisplayNameGroups: repeatedNames.length,
    possibleDuplicateDisplayNameRows: repeatedNames.reduce((sum, count) => sum + count, 0),
    statusTimestampMismatch: employees.filter((employee) => (employee.status === "Active") !== !employee.archivedAt).length,
    activeEmployeeInInactiveStore: employees.filter((employee) => employee.status === "Active" && !employee.store.isActive).length,
    crossStorePositionAssignments: employees.flatMap((employee) => employee.jobAssignments.filter((assignment) =>
      assignment.storeId !== employee.storeId || assignment.job.storeId !== employee.storeId)).length,
    activeEmployeesWithPositions: employees.filter((employee) => employee.status === "Active"
      && employee.jobAssignments.some((assignment) => assignment.job.isActive)).length,
  }, null, 2));
} finally {
  await db.$disconnect();
}
