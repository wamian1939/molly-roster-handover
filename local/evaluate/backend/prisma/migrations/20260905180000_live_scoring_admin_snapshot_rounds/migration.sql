-- Live scoring removes persisted drafts. Unsubmitted legacy drafts are intentionally discarded.
DELETE FROM "evaluations" WHERE "evaluationStatus" = 'Draft';

-- Earlier builds allowed several OPEN rounds for one employee. Consolidate their latest
-- per-evaluator submissions into the newest OPEN round before restoring the invariant.
WITH ranked AS (
  SELECT "id", "employeeId",
         first_value("id") OVER (PARTITION BY "employeeId" ORDER BY "createdAt" DESC, "id" DESC) AS keep_id
  FROM "evaluation_rounds"
  WHERE "status" = 'OPEN'
), duplicates AS (
  SELECT e."id"
  FROM "evaluations" e
  JOIN ranked r ON r."id" = e."roundId"
  WHERE r."id" <> r.keep_id
    AND EXISTS (
      SELECT 1 FROM "evaluations" newer
      WHERE newer."roundId" = r.keep_id
        AND newer."evaluatorAccountId" IS NOT DISTINCT FROM e."evaluatorAccountId"
    )
)
DELETE FROM "evaluations" WHERE "id" IN (SELECT "id" FROM duplicates);

WITH ranked AS (
  SELECT "id", "employeeId",
         first_value("id") OVER (PARTITION BY "employeeId" ORDER BY "createdAt" DESC, "id" DESC) AS keep_id
  FROM "evaluation_rounds"
  WHERE "status" = 'OPEN'
)
UPDATE "evaluations" e
SET "roundId" = r.keep_id
FROM ranked r
WHERE e."roundId" = r."id" AND r."id" <> r.keep_id;

WITH ranked AS (
  SELECT "id", "employeeId",
         first_value("id") OVER (PARTITION BY "employeeId" ORDER BY "createdAt" DESC, "id" DESC) AS keep_id
  FROM "evaluation_rounds"
  WHERE "status" = 'OPEN'
)
DELETE FROM "evaluation_rounds" round
USING ranked r
WHERE round."id" = r."id" AND r."id" <> r.keep_id;

ALTER TABLE "evaluation_rounds"
  ADD COLUMN "roundNumber" INTEGER,
  ADD COLUMN "openedAt" TIMESTAMP(3),
  ADD COLUMN "closedEligibleCount" INTEGER,
  ADD COLUMN "closedSubmittedCount" INTEGER,
  ADD COLUMN "finalAggregateOverall" DECIMAL(5,2),
  ADD COLUMN "finalAggregateTier" "TierV1",
  ADD COLUMN "finalAggregateComponents" JSONB,
  ADD COLUMN "finalAggregateSkillCoverage" DECIMAL(5,4);

WITH numbered AS (
  SELECT "id", row_number() OVER (PARTITION BY "employeeId" ORDER BY "createdAt", "id") AS number
  FROM "evaluation_rounds"
)
UPDATE "evaluation_rounds" round
SET "roundNumber" = numbered.number,
    "openedAt" = round."createdAt"
FROM numbered
WHERE numbered."id" = round."id";

ALTER TABLE "evaluation_rounds" ALTER COLUMN "roundNumber" SET NOT NULL;
ALTER TABLE "evaluation_rounds" ALTER COLUMN "roundNumber" SET DEFAULT 1;
ALTER TABLE "evaluation_rounds" ALTER COLUMN "openedAt" SET NOT NULL;
ALTER TABLE "evaluation_rounds" ALTER COLUMN "openedAt" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "evaluations"
  ADD COLUMN "evaluatorRoleSnapshot" "AccountRole",
  ADD COLUMN "submittedAt" TIMESTAMP(3);

UPDATE "evaluations" evaluation
SET "evaluatorRoleSnapshot" = account."role",
    "submittedAt" = COALESCE(evaluation."completedAt", evaluation."updatedAt")
FROM "user_accounts" account
WHERE account."id" = evaluation."evaluatorAccountId";

-- OPEN membership is dynamic. This table becomes a close-time historical snapshot only.
DELETE FROM "evaluation_round_evaluators" member
USING "evaluation_rounds" round
WHERE member."roundId" = round."id" AND round."status" = 'OPEN';

DROP INDEX IF EXISTS "evaluations_one_active_draft_per_employee_evaluator_idx";
CREATE UNIQUE INDEX "evaluation_rounds_one_open_per_employee_idx"
  ON "evaluation_rounds"("employeeId") WHERE "status" = 'OPEN';
CREATE UNIQUE INDEX "evaluation_rounds_employee_round_number_key"
  ON "evaluation_rounds"("employeeId", "roundNumber");

ALTER TABLE "evaluation_rounds"
  ADD CONSTRAINT "evaluation_rounds_closed_timestamp_check"
  CHECK (("status" = 'OPEN' AND "closedAt" IS NULL) OR ("status" = 'CLOSED' AND "closedAt" IS NOT NULL));

CREATE OR REPLACE FUNCTION prevent_closed_round_evaluation_mutation()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "evaluation_rounds"
    WHERE "id" = CASE WHEN TG_OP = 'INSERT' THEN NEW."roundId" ELSE OLD."roundId" END
      AND "status" = 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'Closed round evaluations are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "evaluations_closed_round_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "evaluations"
FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_evaluation_mutation();
