import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

try {
  const [employees, stores, closedRounds, openRounds, schemaFlags] = await Promise.all([
    db.employee.count(),
    db.store.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { id: "asc" } }),
    db.evaluationRound.count({ where: { status: "CLOSED" } }),
    db.evaluationRound.count({ where: { status: "OPEN" } }),
    db.$queryRaw<Array<{ has_position: boolean; has_jobs: boolean }>>`
      SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'position') AS has_position,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'store_job_definitions') AS has_jobs
    `,
  ]);
  const hasJobs = schemaFlags[0]?.has_jobs ?? false;
  const [jobDefinitionCount, assignmentCount] = hasJobs
    ? await Promise.all([db.storeJobDefinition.count(), db.employeeJobAssignment.count()])
    : [0, 0];

  console.log(JSON.stringify({
    employeeCount: employees,
    stores,
    existingJobModel: hasJobs,
    jobDefinitionCount,
    employeeJobAssignmentCount: assignmentCount,
    legacyPositionColumn: schemaFlags[0]?.has_position ?? false,
    rosterDuplicateJobModel: "Not present in the Evaluate Molly database; Molly Roster remains a read-only integration consumer.",
    closedRoundCount: closedRounds,
    openRoundCount: openRounds,
    roundJobSnapshotStrategy: "New closes snapshot jobs; legacy CLOSED rounds remain null and are labelled unavailable.",
    employeeAssignmentStrategy: "No existing employee is automatically assigned to 全岗 or 带训员.",
  }, null, 2));
} finally {
  await db.$disconnect();
}
