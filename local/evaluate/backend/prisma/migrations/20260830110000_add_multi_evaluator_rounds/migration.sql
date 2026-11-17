CREATE TYPE "EvaluationRoundStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "evaluation_rounds" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "employeeTypeSnapshot" "EmployeeType" NOT NULL,
  "scoringVersion" TEXT NOT NULL,
  "scoringPolicySnapshot" JSONB NOT NULL,
  "skillBaselineSnapshot" JSONB NOT NULL,
  "status" "EvaluationRoundStatus" NOT NULL DEFAULT 'OPEN',
  "createdByAccountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CONSTRAINT "evaluation_rounds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_round_evaluators" (
  "id" TEXT NOT NULL,
  "roundId" TEXT NOT NULL,
  "evaluatorAccountId" TEXT,
  "evaluatorDisplayNameSnapshot" TEXT NOT NULL,
  "excludedAt" TIMESTAMP(3),
  "exclusionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_round_evaluators_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "evaluations" ADD COLUMN "roundId" TEXT;

INSERT INTO "evaluation_rounds" (
  "id", "employeeId", "storeId", "employeeTypeSnapshot", "scoringVersion",
  "scoringPolicySnapshot", "skillBaselineSnapshot", "status",
  "createdByAccountId", "createdAt", "closedAt"
)
SELECT
  'legacy-round-' || evaluation."id",
  evaluation."employeeId",
  evaluation."storeId",
  evaluation."employeeTypeSnapshot",
  evaluation."scoringVersion",
  evaluation."scoringPolicySnapshot",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'skillDefinitionId', draft."skillDefinitionId",
      'status', draft."status"
    ) ORDER BY draft."skillDefinitionId")
    FROM "evaluation_skill_drafts" draft
    WHERE draft."evaluationId" = evaluation."id"
  ), '[]'::jsonb),
  CASE WHEN evaluation."evaluationStatus" = 'Draft'
    THEN 'OPEN'::"EvaluationRoundStatus"
    ELSE 'CLOSED'::"EvaluationRoundStatus"
  END,
  evaluation."evaluatorAccountId",
  evaluation."createdAt",
  CASE WHEN evaluation."evaluationStatus" = 'Draft'
    THEN NULL
    ELSE COALESCE(evaluation."completedAt", evaluation."updatedAt")
  END
FROM "evaluations" evaluation;

UPDATE "evaluations"
SET "roundId" = 'legacy-round-' || "id";

INSERT INTO "evaluation_round_evaluators" (
  "id", "roundId", "evaluatorAccountId", "evaluatorDisplayNameSnapshot", "createdAt"
)
SELECT
  'legacy-member-' || evaluation."id",
  'legacy-round-' || evaluation."id",
  evaluation."evaluatorAccountId",
  COALESCE(evaluation."evaluatorNameSnapshot", account."displayName", 'Legacy evaluator'),
  evaluation."createdAt"
FROM "evaluations" evaluation
LEFT JOIN "user_accounts" account ON account."id" = evaluation."evaluatorAccountId";

INSERT INTO "evaluation_round_evaluators" (
  "id", "roundId", "evaluatorAccountId", "evaluatorDisplayNameSnapshot", "createdAt"
)
SELECT
  'open-member-' || evaluation."id" || '-' || account."id",
  'legacy-round-' || evaluation."id",
  account."id",
  account."displayName",
  evaluation."createdAt"
FROM "evaluations" evaluation
JOIN "user_accounts" account
  ON account."storeId" = evaluation."storeId"
 AND account."role" = 'STORE_EVALUATOR'
 AND account."isActive" = true
WHERE evaluation."evaluationStatus" = 'Draft'
ON CONFLICT DO NOTHING;

ALTER TABLE "evaluations" ALTER COLUMN "roundId" SET NOT NULL;

DROP INDEX IF EXISTS "evaluations_one_active_v1_draft_per_employee";
DROP INDEX IF EXISTS "evaluations_one_active_v1_draft_per_employee_idx";

CREATE UNIQUE INDEX "evaluation_rounds_one_open_per_employee_idx"
  ON "evaluation_rounds"("employeeId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "evaluation_round_evaluators_roundId_evaluatorAccountId_key"
  ON "evaluation_round_evaluators"("roundId", "evaluatorAccountId");
CREATE UNIQUE INDEX "evaluations_roundId_evaluatorAccountId_key"
  ON "evaluations"("roundId", "evaluatorAccountId");

CREATE INDEX "evaluation_rounds_employeeId_status_idx" ON "evaluation_rounds"("employeeId", "status");
CREATE INDEX "evaluation_rounds_storeId_status_idx" ON "evaluation_rounds"("storeId", "status");
CREATE INDEX "evaluation_rounds_status_createdAt_idx" ON "evaluation_rounds"("status", "createdAt");
CREATE INDEX "evaluation_round_evaluators_roundId_excludedAt_idx" ON "evaluation_round_evaluators"("roundId", "excludedAt");
CREATE INDEX "evaluation_round_evaluators_evaluatorAccountId_roundId_idx" ON "evaluation_round_evaluators"("evaluatorAccountId", "roundId");
CREATE INDEX "evaluations_roundId_evaluationStatus_completedAt_idx" ON "evaluations"("roundId", "evaluationStatus", "completedAt");

ALTER TABLE "evaluation_rounds"
  ADD CONSTRAINT "evaluation_rounds_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "evaluation_rounds_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "evaluation_rounds_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evaluation_round_evaluators"
  ADD CONSTRAINT "evaluation_round_evaluators_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "evaluation_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "evaluation_round_evaluators_evaluatorAccountId_fkey" FOREIGN KEY ("evaluatorAccountId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "evaluations"
  ADD CONSTRAINT "evaluations_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "evaluation_rounds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
