-- Live scoring stores one latest submission per evaluator in an OPEN round.
-- Unsubmitted legacy drafts have no business value and are intentionally discarded.
DELETE FROM "evaluations" WHERE "evaluationStatus" = 'Draft';

DROP TABLE IF EXISTS "evaluation_skill_drafts";

-- The existing protection is replaced below. It must be suspended while the enum
-- column is rebuilt; all changes in this migration are metadata-preserving.
DROP TRIGGER IF EXISTS "evaluations_closed_round_immutable" ON "evaluations";

CREATE TYPE "EvaluationStatus_live" AS ENUM ('NotStarted', 'Submitted', 'Completed', 'NeedsReview');

ALTER TABLE "evaluations" ADD COLUMN "evaluationStatusLive" "EvaluationStatus_live";

UPDATE "evaluations" evaluation
SET "evaluationStatusLive" = (
  CASE
    WHEN evaluation."evaluationStatus"::text = 'Completed' AND round."status" = 'OPEN' THEN 'Submitted'
    ELSE evaluation."evaluationStatus"::text
  END
)::"EvaluationStatus_live"
FROM "evaluation_rounds" round
WHERE round."id" = evaluation."roundId";

ALTER TABLE "evaluations" ALTER COLUMN "evaluationStatusLive" SET NOT NULL;
ALTER TABLE "evaluations" RENAME COLUMN "evaluationStatus" TO "evaluationStatusLegacy";
ALTER TABLE "evaluations" RENAME COLUMN "evaluationStatusLive" TO "evaluationStatus";
ALTER TABLE "evaluations" DROP COLUMN "evaluationStatusLegacy";

DROP TYPE "EvaluationStatus";
ALTER TYPE "EvaluationStatus_live" RENAME TO "EvaluationStatus";

CREATE INDEX "evaluations_evaluationStatus_idx" ON "evaluations"("evaluationStatus");
CREATE INDEX "evaluations_scoringVersion_evaluationStatus_completedAt_idx" ON "evaluations"("scoringVersion", "evaluationStatus", "completedAt");
CREATE INDEX "evaluations_storeId_scoringVersion_evaluationStatus_completedAt_idx" ON "evaluations"("storeId", "scoringVersion", "evaluationStatus", "completedAt");
CREATE INDEX "evaluations_employeeId_scoringVersion_evaluationStatus_completedAt_idx" ON "evaluations"("employeeId", "scoringVersion", "evaluationStatus", "completedAt");
CREATE INDEX "evaluations_roundId_evaluationStatus_completedAt_idx" ON "evaluations"("roundId", "evaluationStatus", "completedAt");

ALTER TABLE "employees"
  DROP COLUMN IF EXISTS "openingQualified",
  DROP COLUMN IF EXISTS "closingQualified",
  DROP COLUMN IF EXISTS "weeklyCleaningQualified";

ALTER TABLE "evaluations"
  DROP COLUMN IF EXISTS "openingQualificationSnapshot",
  DROP COLUMN IF EXISTS "closingQualificationSnapshot",
  DROP COLUMN IF EXISTS "weeklyCleaningQualificationSnapshot";

ALTER TABLE "evaluation_rounds"
  DROP COLUMN IF EXISTS "qualificationsAppliedAt",
  DROP COLUMN IF EXISTS "qualificationsAppliedByAccountId";

DROP TYPE IF EXISTS "QualificationStatus";

-- An evaluation cannot be inserted into, moved into, changed in, or removed from a CLOSED round.
CREATE OR REPLACE FUNCTION prevent_closed_round_evaluation_mutation()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "evaluation_rounds"
    WHERE "id" IN (
      CASE WHEN TG_OP <> 'INSERT' THEN OLD."roundId" ELSE NULL END,
      CASE WHEN TG_OP <> 'DELETE' THEN NEW."roundId" ELSE NULL END
    )
      AND "status" = 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'Closed round evaluations are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_closed_round_skill_snapshot_mutation()
RETURNS trigger AS $$
DECLARE
  target_evaluation_id TEXT;
BEGIN
  target_evaluation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."evaluationId" ELSE NEW."evaluationId" END;
  IF EXISTS (
    SELECT 1
    FROM "evaluations" evaluation
    JOIN "evaluation_rounds" round ON round."id" = evaluation."roundId"
    WHERE evaluation."id" = target_evaluation_id AND round."status" = 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'Closed round skill snapshots are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "evaluation_skill_snapshots_closed_round_immutable" ON "evaluation_skill_snapshots";
CREATE TRIGGER "evaluation_skill_snapshots_closed_round_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "evaluation_skill_snapshots"
FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_skill_snapshot_mutation();

CREATE OR REPLACE FUNCTION prevent_closed_round_ai_run_mutation()
RETURNS trigger AS $$
DECLARE
  target_evaluation_id TEXT;
BEGIN
  target_evaluation_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."evaluationId" ELSE NEW."evaluationId" END;
  IF EXISTS (
    SELECT 1
    FROM "evaluations" evaluation
    JOIN "evaluation_rounds" round ON round."id" = evaluation."roundId"
    WHERE evaluation."id" = target_evaluation_id AND round."status" = 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'Closed round AI results are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "evaluation_ai_runs_closed_round_immutable" ON "evaluation_ai_runs";
CREATE TRIGGER "evaluation_ai_runs_closed_round_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "evaluation_ai_runs"
FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_ai_run_mutation();

CREATE OR REPLACE FUNCTION prevent_closed_round_ai_evidence_mutation()
RETURNS trigger AS $$
DECLARE
  target_run_id TEXT;
BEGIN
  target_run_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."aiRunId" ELSE NEW."aiRunId" END;
  IF EXISTS (
    SELECT 1
    FROM "evaluation_ai_runs" run
    JOIN "evaluations" evaluation ON evaluation."id" = run."evaluationId"
    JOIN "evaluation_rounds" round ON round."id" = evaluation."roundId"
    WHERE run."id" = target_run_id AND round."status" = 'CLOSED'
  ) THEN
    RAISE EXCEPTION 'Closed round AI evidence is immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "evaluation_ai_evidence_closed_round_immutable" ON "evaluation_ai_evidence";
CREATE TRIGGER "evaluation_ai_evidence_closed_round_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "evaluation_ai_evidence"
FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_ai_evidence_mutation();

CREATE OR REPLACE FUNCTION prevent_closed_round_membership_mutation()
RETURNS trigger AS $$
DECLARE
  target_round_id TEXT;
BEGIN
  target_round_id := CASE WHEN TG_OP = 'DELETE' THEN OLD."roundId" ELSE NEW."roundId" END;
  IF EXISTS (SELECT 1 FROM "evaluation_rounds" WHERE "id" = target_round_id AND "status" = 'CLOSED') THEN
    RAISE EXCEPTION 'Closed round evaluator snapshots are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "evaluation_round_evaluators_closed_round_immutable" ON "evaluation_round_evaluators";
CREATE TRIGGER "evaluation_round_evaluators_closed_round_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "evaluation_round_evaluators"
FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_membership_mutation();

CREATE OR REPLACE FUNCTION prevent_closed_round_mutation()
RETURNS trigger AS $$
BEGIN
  IF OLD."status" = 'CLOSED' THEN
    RAISE EXCEPTION 'Closed rounds are immutable';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "evaluation_rounds_closed_immutable" ON "evaluation_rounds";
CREATE TRIGGER "evaluation_rounds_closed_immutable"
BEFORE UPDATE OR DELETE ON "evaluation_rounds"
FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_mutation();
