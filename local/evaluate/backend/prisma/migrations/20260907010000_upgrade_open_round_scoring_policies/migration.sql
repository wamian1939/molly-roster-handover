-- Apply the newly confirmed scoring policies to active work only.
-- CLOSED rounds and their evaluation snapshots remain immutable and untouched.

ALTER TABLE "evaluations"
  DROP CONSTRAINT IF EXISTS "evaluations_v1_component_ranges";

-- The shared columns must accommodate every retained historical policy as well as
-- the new REGULAR_V3 and TRAINING_V2 component maxima.
ALTER TABLE "evaluations"
  ADD CONSTRAINT "evaluations_v1_component_ranges" CHECK (
    ("skillScoreV1" IS NULL OR "skillScoreV1" BETWEEN 0 AND 60) AND
    ("speedScoreV1" IS NULL OR "speedScoreV1" BETWEEN 0 AND 15) AND
    ("initiativeScoreV1" IS NULL OR "initiativeScoreV1" BETWEEN 0 AND 25) AND
    ("attitudeScoreV1" IS NULL OR "attitudeScoreV1" BETWEEN 0 AND 25) AND
    ("availabilityScoreV1" IS NULL OR "availabilityScoreV1" BETWEEN 0 AND 10) AND
    ("textScoreV1" IS NULL OR "textScoreV1" BETWEEN 0 AND 15) AND
    ("overallScoreV1" IS NULL OR "overallScoreV1" BETWEEN 0 AND 100) AND
    ("skillCoverageV1" IS NULL OR "skillCoverageV1" BETWEEN 0 AND 1)
  );

WITH source AS (
  SELECT
    evaluation."id",
    round."employeeTypeSnapshot",
    NULLIF((evaluation."scoringPolicySnapshot" ->> 'skillWeight')::numeric, 0) AS old_skill_weight,
    NULLIF((evaluation."scoringPolicySnapshot" ->> 'speedWeight')::numeric, 0) AS old_speed_weight,
    NULLIF((evaluation."scoringPolicySnapshot" ->> 'initiativeWeight')::numeric, 0) AS old_initiative_weight,
    NULLIF((evaluation."scoringPolicySnapshot" ->> 'attitudeWeight')::numeric, 0) AS old_attitude_weight,
    NULLIF((evaluation."scoringPolicySnapshot" ->> 'availabilityWeight')::numeric, 0) AS old_availability_weight,
    NULLIF((evaluation."scoringPolicySnapshot" ->> 'textWeight')::numeric, 0) AS old_text_weight,
    CASE WHEN round."employeeTypeSnapshot" = 'TRAINING' THEN 40::numeric ELSE 60::numeric END AS new_skill_weight,
    CASE WHEN round."employeeTypeSnapshot" = 'TRAINING' THEN 10::numeric ELSE 15::numeric END AS new_speed_weight,
    CASE WHEN round."employeeTypeSnapshot" = 'TRAINING' THEN 15::numeric ELSE 5::numeric END AS new_initiative_weight,
    CASE WHEN round."employeeTypeSnapshot" = 'TRAINING' THEN 15::numeric ELSE 5::numeric END AS new_attitude_weight,
    CASE WHEN round."employeeTypeSnapshot" = 'TRAINING' THEN 5::numeric ELSE 10::numeric END AS new_availability_weight,
    CASE WHEN round."employeeTypeSnapshot" = 'TRAINING' THEN 15::numeric ELSE 5::numeric END AS new_text_weight
  FROM "evaluations" evaluation
  JOIN "evaluation_rounds" round ON round."id" = evaluation."roundId"
  WHERE round."status" = 'OPEN'
    AND evaluation."evaluationStatus" = 'Submitted'
), rescored AS (
  SELECT
    source."id",
    source."employeeTypeSnapshot",
    ROUND(evaluation."skillScoreV1" / source.old_skill_weight * source.new_skill_weight, 1) AS skill_score,
    ROUND(evaluation."speedScoreV1" / source.old_speed_weight * source.new_speed_weight, 1) AS speed_score,
    ROUND(evaluation."initiativeScoreV1" / source.old_initiative_weight * source.new_initiative_weight, 1) AS initiative_score,
    ROUND(evaluation."attitudeScoreV1" / source.old_attitude_weight * source.new_attitude_weight, 1) AS attitude_score,
    ROUND(evaluation."availabilityScoreV1" / source.old_availability_weight * source.new_availability_weight, 1) AS availability_score,
    ROUND(evaluation."textScoreV1" / source.old_text_weight * source.new_text_weight, 1) AS text_score
  FROM source
  JOIN "evaluations" evaluation ON evaluation."id" = source."id"
), totals AS (
  SELECT
    rescored.*,
    ROUND(
      rescored.skill_score
      + rescored.speed_score
      + rescored.initiative_score
      + rescored.attitude_score
      + rescored.availability_score
      + rescored.text_score,
      1
    ) AS overall_score
  FROM rescored
)
UPDATE "evaluations" evaluation
SET
  "scoringPolicySnapshot" = CASE
    WHEN totals."employeeTypeSnapshot" = 'TRAINING' THEN jsonb_build_object(
      'policyId', 'TRAINING_V2', 'tierPolicyVersion', 2,
      'skillWeight', 40, 'speedWeight', 10, 'initiativeWeight', 15,
      'attitudeWeight', 15, 'availabilityWeight', 5, 'textWeight', 15
    )
    ELSE jsonb_build_object(
      'policyId', 'REGULAR_V3', 'tierPolicyVersion', 2,
      'skillWeight', 60, 'speedWeight', 15, 'initiativeWeight', 5,
      'attitudeWeight', 5, 'availabilityWeight', 10, 'textWeight', 5
    )
  END,
  "skillScoreV1" = totals.skill_score,
  "speedScoreV1" = totals.speed_score,
  "initiativeScoreV1" = totals.initiative_score,
  "attitudeScoreV1" = totals.attitude_score,
  "availabilityScoreV1" = totals.availability_score,
  "textScoreV1" = totals.text_score,
  "overallScoreV1" = totals.overall_score,
  "tierV1" = CASE
    WHEN totals.overall_score >= 85 THEN 'T1'
    WHEN totals.overall_score >= 70 THEN 'T2'
    WHEN totals.overall_score >= 60 THEN 'T3'
    WHEN totals.overall_score >= 40 THEN 'T4'
    ELSE 'T5'
  END::"TierV1"
FROM totals
WHERE evaluation."id" = totals."id";

UPDATE "evaluation_rounds" round
SET "scoringPolicySnapshot" = CASE
  WHEN round."employeeTypeSnapshot" = 'TRAINING' THEN jsonb_build_object(
    'policyId', 'TRAINING_V2', 'tierPolicyVersion', 2,
    'skillWeight', 40, 'speedWeight', 10, 'initiativeWeight', 15,
    'attitudeWeight', 15, 'availabilityWeight', 5, 'textWeight', 15
  )
  ELSE jsonb_build_object(
    'policyId', 'REGULAR_V3', 'tierPolicyVersion', 2,
    'skillWeight', 60, 'speedWeight', 15, 'initiativeWeight', 5,
    'attitudeWeight', 5, 'availabilityWeight', 10, 'textWeight', 5
  )
END
WHERE round."status" = 'OPEN';
