import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/prisma.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required.");
const target = new URL(databaseUrl);
if (!(["localhost", "127.0.0.1"].includes(target.hostname)
  && target.port === "5432" && target.pathname === "/evaluate_molly"
  && (target.searchParams.get("schema") ?? "public") === "public")) {
  throw new Error("Round integrity audit is restricted to the local Evaluate development database.");
}

const [rounds, evaluationsMissingRound, completedEvaluations, liveSubmissions, openGroups, submissionGroups, memberships, roundScopeConstraints, obsoleteDraftTable, closedTriggers, stateMismatches, orphanSkillSnapshots, orphanEmployeeSkills, archivedOpenRounds, invalidPolicySnapshots, legacyClosedRoundsWithoutDenominatorSnapshot, closedDenominatorMismatches] = await Promise.all([
  prisma.evaluationRound.count(),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*) AS count FROM evaluations WHERE "roundId" IS NULL`).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.evaluation.count({ where: { evaluationStatus: "Completed" } }),
  prisma.evaluation.count({ where: { evaluationStatus: "Submitted", round: { status: "OPEN" } } }),
  prisma.evaluationRound.groupBy({ by: ["employeeId"], where: { status: "OPEN" }, _count: { _all: true } }),
  prisma.evaluation.groupBy({ by: ["roundId", "evaluatorAccountId"], where: { evaluatorAccountId: { not: null } }, _count: { _all: true } }),
  prisma.evaluationRoundEvaluator.count(),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count
    FROM pg_constraint constraint_row
    JOIN pg_namespace namespace_row ON namespace_row.oid = constraint_row.connamespace
    WHERE namespace_row.nspname = current_schema()
      AND constraint_row.conname = 'evaluations_roundId_employeeId_storeId_fkey'
  `).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'evaluation_skill_drafts'`).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count
    FROM pg_trigger trigger_row
    JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
    JOIN pg_namespace namespace_row ON namespace_row.oid = table_row.relnamespace
    WHERE namespace_row.nspname = current_schema()
      AND NOT trigger_row.tgisinternal
      AND trigger_row.tgname IN ('evaluations_closed_round_immutable', 'evaluation_skill_snapshots_closed_round_immutable', 'evaluation_ai_runs_closed_round_immutable', 'evaluation_ai_evidence_closed_round_immutable', 'evaluation_round_evaluators_closed_round_immutable', 'evaluation_rounds_closed_immutable')
  `).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count FROM evaluation_rounds
    WHERE (status = 'CLOSED' AND "closedAt" IS NULL)
       OR (status = 'OPEN' AND "closedAt" IS NOT NULL)
  `).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count FROM evaluation_skill_snapshots snapshot
    LEFT JOIN evaluations evaluation ON evaluation.id = snapshot."evaluationId"
    WHERE evaluation.id IS NULL
  `).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count FROM employee_skills skill
    LEFT JOIN employees employee ON employee.id = skill."employeeId"
    LEFT JOIN skill_definitions definition ON definition.id = skill."skillDefinitionId"
    WHERE employee.id IS NULL OR definition.id IS NULL
  `).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count FROM evaluation_rounds round_row
    JOIN employees employee ON employee.id = round_row."employeeId"
    WHERE round_row.status = 'OPEN' AND employee.status = 'Archived'
  `).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count FROM evaluation_rounds
    WHERE "scoringVersion" = '' OR jsonb_typeof("scoringPolicySnapshot") <> 'object'
  `).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count FROM evaluation_rounds
    WHERE status = 'CLOSED'
      AND ("closedEligibleCount" IS NULL OR "closedSubmittedCount" IS NULL)
  `).then((rows) => Number(rows[0]?.count ?? 0)),
  prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
    SELECT count(*) AS count
    FROM evaluation_rounds round_row
    WHERE round_row.status = 'CLOSED'
      AND round_row."closedEligibleCount" IS NOT NULL
      AND round_row."closedSubmittedCount" IS NOT NULL
      AND (
        round_row."closedEligibleCount" <> (
          SELECT count(*) FROM evaluation_round_evaluators member
          WHERE member."roundId" = round_row.id AND member."excludedAt" IS NULL
        )
        OR round_row."closedSubmittedCount" <> (
          SELECT count(*) FROM evaluations evaluation
          JOIN evaluation_round_evaluators member
            ON member."roundId" = round_row.id
           AND member."evaluatorAccountId" = evaluation."evaluatorAccountId"
          WHERE evaluation."roundId" = round_row.id
            AND member."excludedAt" IS NULL
            AND evaluation."evaluationStatus" IN ('Submitted', 'Completed')
            AND evaluation."overallScoreV1" IS NOT NULL
        )
      )
  `).then((rows) => Number(rows[0]?.count ?? 0)),
]);

console.log(JSON.stringify({
  rounds,
  evaluationsMissingRound,
  duplicateOpenRounds: openGroups.filter((group) => group._count._all > 1).length,
  duplicateEvaluatorSubmissions: submissionGroups.filter((group) => group._count._all > 1).length,
  completedEvaluations,
  liveSubmissions,
  obsoleteDraftTablePresent: obsoleteDraftTable > 0,
  closedRoundImmutabilityTriggerCount: closedTriggers,
  allClosedRoundImmutabilityTriggersPresent: closedTriggers === 6,
  memberships,
  roundScopeConstraintPresent: roundScopeConstraints === 1,
  roundStateTimestampMismatches: stateMismatches,
  orphanSkillSnapshots,
  orphanEmployeeSkills,
  archivedEmployeeOpenRounds: archivedOpenRounds,
  invalidPolicySnapshots,
  legacyClosedRoundsWithoutDenominatorSnapshot,
  closedDenominatorMismatches,
}));

await prisma.$disconnect();
