ALTER TABLE "evaluations"
  DROP CONSTRAINT IF EXISTS "evaluations_v1_component_ranges";

ALTER TABLE "evaluations"
  ADD CONSTRAINT "evaluations_v1_component_ranges" CHECK (
    ("skillScoreV1" IS NULL OR "skillScoreV1" BETWEEN 0 AND 60) AND
    ("speedScoreV1" IS NULL OR "speedScoreV1" BETWEEN 0 AND 12) AND
    ("initiativeScoreV1" IS NULL OR "initiativeScoreV1" BETWEEN 0 AND 25) AND
    ("attitudeScoreV1" IS NULL OR "attitudeScoreV1" BETWEEN 0 AND 25) AND
    ("availabilityScoreV1" IS NULL OR "availabilityScoreV1" BETWEEN 0 AND 10) AND
    ("textScoreV1" IS NULL OR "textScoreV1" BETWEEN 0 AND 10) AND
    ("overallScoreV1" IS NULL OR "overallScoreV1" BETWEEN 0 AND 100) AND
    ("skillCoverageV1" IS NULL OR "skillCoverageV1" BETWEEN 0 AND 1)
  );
