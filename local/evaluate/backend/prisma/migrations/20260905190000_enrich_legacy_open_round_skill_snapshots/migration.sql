-- Legacy OPEN rounds stored only skillDefinitionId/status pairs. Live scoring needs
-- the round-owned name/category/mode/weight authority, so enrich those OPEN-only
-- snapshots without touching CLOSED history or changing their policy snapshot.
WITH rebuilt AS (
  SELECT round."id" AS round_id, jsonb_agg(
    jsonb_build_object(
      'skillDefinitionId', definition."id",
      'skillCode', definition."code",
      'skillNameZh', definition."nameZh",
      'skillNameEn', definition."nameEn",
      'category', definition."category",
      'skillMode', definition."skillMode",
      'weight', definition."weight",
      'status', COALESCE(previous.status, current_skill."status"::text, 'Unknown')
    ) ORDER BY definition."displayOrder", definition."id"
  ) AS snapshot
  FROM "evaluation_rounds" round
  CROSS JOIN "skill_definitions" definition
  LEFT JOIN "employee_skills" current_skill
    ON current_skill."employeeId" = round."employeeId"
   AND current_skill."skillDefinitionId" = definition."id"
  LEFT JOIN LATERAL (
    SELECT item ->> 'status' AS status
    FROM jsonb_array_elements(round."skillBaselineSnapshot"::jsonb) item
    WHERE item ->> 'skillDefinitionId' = definition."id"
    LIMIT 1
  ) previous ON TRUE
  WHERE round."status" = 'OPEN'
    AND definition."isActive" = TRUE
    AND (
    jsonb_array_length(round."skillBaselineSnapshot"::jsonb) = 0
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(round."skillBaselineSnapshot"::jsonb) item
      WHERE NOT (item ? 'weight')
         OR NOT (item ? 'skillMode')
         OR NOT (item ? 'category')
    )
    )
  GROUP BY round."id"
)
UPDATE "evaluation_rounds" round
SET "skillBaselineSnapshot" = rebuilt.snapshot
FROM rebuilt
WHERE round."id" = rebuilt.round_id;
