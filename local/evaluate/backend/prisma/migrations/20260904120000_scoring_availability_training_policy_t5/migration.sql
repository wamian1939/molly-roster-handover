ALTER TYPE "TierV1" ADD VALUE IF NOT EXISTS 'T5';

DROP INDEX IF EXISTS "evaluation_rounds_one_open_per_employee_idx";

CREATE UNIQUE INDEX "evaluations_one_active_draft_per_employee_evaluator_idx"
  ON "evaluations"("employeeId", "evaluatorAccountId")
  WHERE "evaluationStatus" = 'Draft'
    AND "scoringVersion" = 'v1'
    AND "evaluatorAccountId" IS NOT NULL;
