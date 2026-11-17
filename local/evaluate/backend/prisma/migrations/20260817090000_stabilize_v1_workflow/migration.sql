DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "evaluations"
    WHERE "scoringVersion" = 'v1'
      AND "evaluationStatus" = 'Draft'
    GROUP BY "employeeId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add active V1 draft uniqueness: duplicate employee drafts exist';
  END IF;
END $$;

CREATE TYPE "QualificationStatus" AS ENUM ('Unknown', 'Qualified', 'NotQualified');

ALTER TABLE "employees"
  ALTER COLUMN "openingQualified" DROP DEFAULT,
  ALTER COLUMN "openingQualified" TYPE "QualificationStatus"
    USING (CASE WHEN "openingQualified" THEN 'Qualified' ELSE 'Unknown' END)::"QualificationStatus",
  ALTER COLUMN "openingQualified" SET DEFAULT 'Unknown',
  ALTER COLUMN "closingQualified" DROP DEFAULT,
  ALTER COLUMN "closingQualified" TYPE "QualificationStatus"
    USING (CASE WHEN "closingQualified" THEN 'Qualified' ELSE 'Unknown' END)::"QualificationStatus",
  ALTER COLUMN "closingQualified" SET DEFAULT 'Unknown',
  ALTER COLUMN "weeklyCleaningQualified" DROP DEFAULT,
  ALTER COLUMN "weeklyCleaningQualified" TYPE "QualificationStatus"
    USING (CASE WHEN "weeklyCleaningQualified" THEN 'Qualified' ELSE 'Unknown' END)::"QualificationStatus",
  ALTER COLUMN "weeklyCleaningQualified" SET DEFAULT 'Unknown';

ALTER TABLE "evaluation_skill_drafts"
  ALTER COLUMN "status" DROP NOT NULL;

ALTER TABLE "evaluation_ai_runs"
  DROP COLUMN "selectedForScore";

CREATE UNIQUE INDEX "evaluations_one_active_v1_draft_per_employee"
  ON "evaluations" ("employeeId")
  WHERE "scoringVersion" = 'v1' AND "evaluationStatus" = 'Draft';
