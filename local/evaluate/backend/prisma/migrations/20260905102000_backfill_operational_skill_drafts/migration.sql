INSERT INTO "evaluation_skill_drafts" (
  "id", "evaluationId", "skillDefinitionId", "status", "createdAt", "updatedAt"
)
SELECT
  'migrated-' || md5(ev."id" || ':' || d."code"),
  ev."id",
  d."id",
  es."status",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "evaluations" ev
JOIN "skill_definitions" d ON d."code" IN ('opening', 'closing', 'weekly-cleaning')
LEFT JOIN "employee_skills" es
  ON es."employeeId" = ev."employeeId" AND es."skillDefinitionId" = d."id"
WHERE ev."evaluationStatus" = 'Draft' AND ev."scoringVersion" = 'v1'
ON CONFLICT ("evaluationId", "skillDefinitionId") DO NOTHING;
