CREATE TYPE "SkillMode" AS ENUM ('PROGRESSIVE', 'BINARY');

ALTER TYPE "SkillStatus" ADD VALUE IF NOT EXISTS 'Unknown';
ALTER TYPE "SkillStatus" ADD VALUE IF NOT EXISTS 'CannotDo';
ALTER TYPE "SkillStatus" ADD VALUE IF NOT EXISTS 'CanDo';

ALTER TABLE "skill_definitions"
  ADD COLUMN "skillMode" "SkillMode" NOT NULL DEFAULT 'PROGRESSIVE';

ALTER TABLE "evaluation_skill_snapshots"
  ADD COLUMN "skillMode" "SkillMode" NOT NULL DEFAULT 'PROGRESSIVE';

INSERT INTO "skill_definitions" (
  "id", "code", "nameZh", "nameEn", "category", "skillMode", "weight", "displayOrder", "isActive", "createdAt", "updatedAt"
) VALUES
  ('skill-operation-opening', 'opening', '开早', 'Opening', 'Operations', 'BINARY', 1.000, 110, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('skill-operation-closing', 'closing', '收晚', 'Closing', 'Operations', 'BINARY', 1.000, 120, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('skill-operation-weekly-cleaning', 'weekly-cleaning', '周清', 'Weekly Cleaning', 'Operations', 'BINARY', 1.000, 130, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "nameZh" = EXCLUDED."nameZh",
  "nameEn" = EXCLUDED."nameEn",
  "category" = EXCLUDED."category",
  "skillMode" = EXCLUDED."skillMode",
  "weight" = EXCLUDED."weight",
  "displayOrder" = EXCLUDED."displayOrder",
  "isActive" = TRUE,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Legacy qualification columns remain read-only for rollback/audit compatibility.
-- New application code reads and writes operational capability through EmployeeSkill.
