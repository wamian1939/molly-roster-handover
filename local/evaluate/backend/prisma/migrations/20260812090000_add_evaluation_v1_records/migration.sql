-- Expand legacy Evaluation for Scoring V1 without removing Period or legacy fields.
CREATE TYPE "TierV1" AS ENUM ('T1', 'T2', 'T3', 'T4');
CREATE TYPE "V1TextScoreSource" AS ENUM ('Ai', 'NoTextFallback', 'AiFailureFallback');
CREATE TYPE "EvaluationAiRunStatus" AS ENUM ('Success', 'Fallback');
CREATE TYPE "EvaluationAiEvidenceType" AS ENUM ('Positive', 'Concern', 'PossibleSkillUpdate');

ALTER TABLE "evaluations"
  ALTER COLUMN "attitudeScore" DROP NOT NULL,
  ALTER COLUMN "attendanceScore" DROP NOT NULL,
  ALTER COLUMN "skillScore" DROP NOT NULL,
  ALTER COLUMN "pressureHandlingScore" DROP NOT NULL,
  ALTER COLUMN "teamworkScore" DROP NOT NULL,
  ALTER COLUMN "executionScore" DROP NOT NULL,
  ALTER COLUMN "serviceQualityScore" DROP NOT NULL,
  ALTER COLUMN "growthPotentialScore" DROP NOT NULL,
  ALTER COLUMN "manualWeightedScore" DROP NOT NULL,
  ALTER COLUMN "aiTextScore" DROP NOT NULL,
  ALTER COLUMN "aiRiskScore" DROP NOT NULL,
  ALTER COLUMN "riskLevel" DROP NOT NULL,
  ALTER COLUMN "finalScore" DROP NOT NULL,
  ALTER COLUMN "grade" DROP NOT NULL,
  ADD COLUMN "speedRating" INTEGER,
  ADD COLUMN "initiativeRating" INTEGER,
  ADD COLUMN "attitudeRating" INTEGER,
  ADD COLUMN "availabilityRating" INTEGER,
  ADD COLUMN "skillScoreV1" DECIMAL(5,2),
  ADD COLUMN "speedScoreV1" DECIMAL(5,2),
  ADD COLUMN "initiativeScoreV1" DECIMAL(5,2),
  ADD COLUMN "attitudeScoreV1" DECIMAL(5,2),
  ADD COLUMN "availabilityScoreV1" DECIMAL(5,2),
  ADD COLUMN "textScoreV1" DECIMAL(5,2),
  ADD COLUMN "overallScoreV1" DECIMAL(5,2),
  ADD COLUMN "tierV1" "TierV1",
  ADD COLUMN "skillCoverageV1" DECIMAL(5,4),
  ADD COLUMN "textFeedback" TEXT,
  ADD COLUMN "textScoreSourceV1" "V1TextScoreSource",
  ADD COLUMN "selectedAiRunId" TEXT,
  ADD COLUMN "employeeNameSnapshot" TEXT,
  ADD COLUMN "employeeRoleSnapshot" TEXT,
  ADD COLUMN "storeNameSnapshot" TEXT,
  ADD COLUMN "evaluatorNameSnapshot" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_v1_rating_ranges" CHECK (
  ("speedRating" IS NULL OR "speedRating" BETWEEN 1 AND 5) AND
  ("initiativeRating" IS NULL OR "initiativeRating" BETWEEN 1 AND 5) AND
  ("attitudeRating" IS NULL OR "attitudeRating" BETWEEN 1 AND 5) AND
  ("availabilityRating" IS NULL OR "availabilityRating" BETWEEN 1 AND 5)
);
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_v1_component_ranges" CHECK (
  ("skillScoreV1" IS NULL OR "skillScoreV1" BETWEEN 0 AND 50) AND
  ("speedScoreV1" IS NULL OR "speedScoreV1" BETWEEN 0 AND 12) AND
  ("initiativeScoreV1" IS NULL OR "initiativeScoreV1" BETWEEN 0 AND 10) AND
  ("attitudeScoreV1" IS NULL OR "attitudeScoreV1" BETWEEN 0 AND 10) AND
  ("availabilityScoreV1" IS NULL OR "availabilityScoreV1" BETWEEN 0 AND 8) AND
  ("textScoreV1" IS NULL OR "textScoreV1" BETWEEN 0 AND 10) AND
  ("overallScoreV1" IS NULL OR "overallScoreV1" BETWEEN 0 AND 100) AND
  ("skillCoverageV1" IS NULL OR "skillCoverageV1" BETWEEN 0 AND 1)
);

CREATE TABLE "evaluation_skill_drafts" (
  "id" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "skillDefinitionId" TEXT NOT NULL,
  "status" "SkillStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_skill_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_skill_snapshots" (
  "id" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "skillDefinitionId" TEXT,
  "skillCode" TEXT NOT NULL,
  "skillNameZh" TEXT NOT NULL,
  "skillNameEn" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" "SkillStatus" NOT NULL,
  "statusFactor" DECIMAL(5,4) NOT NULL,
  "weight" DECIMAL(6,3) NOT NULL,
  "contribution" DECIMAL(8,4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_skill_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_ai_runs" (
  "id" TEXT NOT NULL,
  "evaluationId" TEXT NOT NULL,
  "status" "EvaluationAiRunStatus" NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "textFeedbackSnapshot" TEXT NOT NULL,
  "textScore" DECIMAL(5,2) NOT NULL,
  "rawResponse" JSONB,
  "errorMessage" TEXT,
  "selectedForScore" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_ai_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_ai_evidence" (
  "id" TEXT NOT NULL,
  "aiRunId" TEXT NOT NULL,
  "type" "EvaluationAiEvidenceType" NOT NULL,
  "dimension" TEXT,
  "skillCode" TEXT,
  "message" TEXT NOT NULL,
  "confidence" DECIMAL(5,4),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evaluation_ai_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "evaluation_skill_drafts_evaluationId_skillDefinitionId_key"
  ON "evaluation_skill_drafts"("evaluationId", "skillDefinitionId");
CREATE INDEX "evaluation_skill_drafts_evaluationId_idx" ON "evaluation_skill_drafts"("evaluationId");
CREATE UNIQUE INDEX "evaluation_skill_snapshots_evaluationId_skillCode_key"
  ON "evaluation_skill_snapshots"("evaluationId", "skillCode");
CREATE INDEX "evaluation_skill_snapshots_evaluationId_idx" ON "evaluation_skill_snapshots"("evaluationId");
CREATE INDEX "evaluation_ai_runs_evaluationId_createdAt_idx" ON "evaluation_ai_runs"("evaluationId", "createdAt");
CREATE INDEX "evaluation_ai_runs_status_idx" ON "evaluation_ai_runs"("status");
CREATE INDEX "evaluation_ai_evidence_aiRunId_type_idx" ON "evaluation_ai_evidence"("aiRunId", "type");

ALTER TABLE "evaluation_skill_drafts" ADD CONSTRAINT "evaluation_skill_drafts_evaluationId_fkey"
  FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_skill_drafts" ADD CONSTRAINT "evaluation_skill_drafts_skillDefinitionId_fkey"
  FOREIGN KEY ("skillDefinitionId") REFERENCES "skill_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_skill_snapshots" ADD CONSTRAINT "evaluation_skill_snapshots_evaluationId_fkey"
  FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_ai_runs" ADD CONSTRAINT "evaluation_ai_runs_evaluationId_fkey"
  FOREIGN KEY ("evaluationId") REFERENCES "evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_ai_evidence" ADD CONSTRAINT "evaluation_ai_evidence_aiRunId_fkey"
  FOREIGN KEY ("aiRunId") REFERENCES "evaluation_ai_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
