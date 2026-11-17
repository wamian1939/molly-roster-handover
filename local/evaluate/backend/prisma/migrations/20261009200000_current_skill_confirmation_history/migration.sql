CREATE TABLE "current_skill_confirmations" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "skillDefinitionId" TEXT NOT NULL,
    "previousStatus" "SkillStatus",
    "confirmedStatus" "SkillStatus" NOT NULL,
    "confirmedByAccountId" TEXT NOT NULL,
    "reason" VARCHAR(500),
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "current_skill_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "current_skill_confirmations_employeeId_confirmedAt_idx"
    ON "current_skill_confirmations"("employeeId", "confirmedAt");
CREATE INDEX "current_skill_confirmations_skillDefinitionId_confirmedAt_idx"
    ON "current_skill_confirmations"("skillDefinitionId", "confirmedAt");

ALTER TABLE "current_skill_confirmations"
    ADD CONSTRAINT "current_skill_confirmations_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "current_skill_confirmations"
    ADD CONSTRAINT "current_skill_confirmations_skillDefinitionId_fkey"
    FOREIGN KEY ("skillDefinitionId") REFERENCES "skill_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "current_skill_confirmations"
    ADD CONSTRAINT "current_skill_confirmations_confirmedByAccountId_fkey"
    FOREIGN KEY ("confirmedByAccountId") REFERENCES "user_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_current_skill_confirmation_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Current skill confirmation history is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER current_skill_confirmations_immutable
    BEFORE UPDATE OR DELETE ON "current_skill_confirmations"
    FOR EACH ROW EXECUTE FUNCTION prevent_current_skill_confirmation_mutation();
