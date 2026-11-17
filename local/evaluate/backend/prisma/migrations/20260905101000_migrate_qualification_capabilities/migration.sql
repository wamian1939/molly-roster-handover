INSERT INTO "employee_skills" (
  "id", "employeeId", "skillDefinitionId", "status", "updatedBy", "createdAt", "updatedAt"
)
SELECT
  'migrated-' || md5(e."id" || ':' || d."code"),
  e."id",
  d."id",
  CASE d."code"
    WHEN 'opening' THEN CASE e."openingQualified"::text WHEN 'Qualified' THEN 'CanDo'::"SkillStatus" WHEN 'NotQualified' THEN 'CannotDo'::"SkillStatus" ELSE 'Unknown'::"SkillStatus" END
    WHEN 'closing' THEN CASE e."closingQualified"::text WHEN 'Qualified' THEN 'CanDo'::"SkillStatus" WHEN 'NotQualified' THEN 'CannotDo'::"SkillStatus" ELSE 'Unknown'::"SkillStatus" END
    ELSE CASE e."weeklyCleaningQualified"::text WHEN 'Qualified' THEN 'CanDo'::"SkillStatus" WHEN 'NotQualified' THEN 'CannotDo'::"SkillStatus" ELSE 'Unknown'::"SkillStatus" END
  END,
  'qualification-to-skill-migration',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "employees" e
CROSS JOIN "skill_definitions" d
WHERE d."code" IN ('opening', 'closing', 'weekly-cleaning')
ON CONFLICT ("employeeId", "skillDefinitionId") DO NOTHING;
