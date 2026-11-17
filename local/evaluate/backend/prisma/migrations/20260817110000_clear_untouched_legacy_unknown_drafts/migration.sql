-- Drafts created before Unknown support could contain manufactured NotTrained rows.
-- Only clear untouched first-evaluation drafts; edited drafts and initialized profiles are preserved.
UPDATE "evaluation_skill_drafts" AS draft
SET "status" = NULL
FROM "evaluations" AS evaluation
WHERE draft."evaluationId" = evaluation."id"
  AND evaluation."scoringVersion" = 'v1'
  AND evaluation."evaluationStatus" = 'Draft'
  AND evaluation."speedRating" IS NULL
  AND evaluation."initiativeRating" IS NULL
  AND evaluation."attitudeRating" IS NULL
  AND evaluation."availabilityRating" IS NULL
  AND BTRIM(COALESCE(evaluation."textFeedback", '')) = ''
  AND NOT EXISTS (
    SELECT 1
    FROM "employee_skills" AS current_skill
    WHERE current_skill."employeeId" = evaluation."employeeId"
  )
  AND EXISTS (
    SELECT 1
    FROM "evaluation_skill_drafts" AS candidate
    WHERE candidate."evaluationId" = evaluation."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "evaluation_skill_drafts" AS edited_skill
    WHERE edited_skill."evaluationId" = evaluation."id"
      AND edited_skill."status" IS DISTINCT FROM 'NotTrained'::"SkillStatus"
  );
