-- Align only untouched built-in shift-role requirements with Evaluate's canonical SkillDefinition.code values.
-- Store-specific and customized global roles remain unchanged.
UPDATE "shift_roles"
SET "requiredSkillCodes" = ARRAY['transfer-station', 'delivery-packing', 'drink-dispatch', 'order-taking']::TEXT[],
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "storeId" IS NULL
  AND "code" = 'front'
  AND "requiredSkillCodes" = ARRAY['handoff', 'delivery-packing', 'drink-handoff', 'order-taking']::TEXT[];

UPDATE "shift_roles"
SET "requiredSkillCodes" = ARRAY['cup-labeling', 'code-scanning', 'ice-adding', 'cup-spinning']::TEXT[],
    "version" = "version" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "storeId" IS NULL
  AND "code" = 'water-bar'
  AND "requiredSkillCodes" = ARRAY['cup-labeling', 'order-scanning', 'ice-station', 'cup-finishing']::TEXT[];
