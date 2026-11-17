CREATE TYPE "EvaluationStatus" AS ENUM ('NotStarted', 'Draft', 'Completed', 'NeedsReview');
CREATE TYPE "Grade" AS ENUM ('A_PLUS', 'A', 'B', 'C', 'D', 'E');
CREATE TYPE "RiskLevel" AS ENUM ('Low', 'Medium', 'High');
CREATE TYPE "EmploymentType" AS ENUM ('FullTime', 'PartTime', 'Seasonal');
CREATE TYPE "EvaluationActivityType" AS ENUM ('completed', 'draft_saved', 'risk_flagged', 'needs_review');

CREATE TABLE "stores" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "region" TEXT NOT NULL,
  "managerName" TEXT NOT NULL,
  "city" TEXT NOT NULL,

  CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employees" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "employmentType" "EmploymentType" NOT NULL,
  "tenure" TEXT NOT NULL,

  CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluations" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "evaluatorId" TEXT,
  "evaluationPeriod" TEXT NOT NULL,
  "evaluationStatus" "EvaluationStatus" NOT NULL,
  "attitudeScore" INTEGER NOT NULL,
  "attendanceScore" INTEGER NOT NULL,
  "skillScore" INTEGER NOT NULL,
  "pressureHandlingScore" INTEGER NOT NULL,
  "teamworkScore" INTEGER NOT NULL,
  "executionScore" INTEGER NOT NULL,
  "serviceQualityScore" INTEGER NOT NULL,
  "growthPotentialScore" INTEGER NOT NULL,
  "manualWeightedScore" DECIMAL(5,2) NOT NULL,
  "textReview" TEXT NOT NULL DEFAULT '',
  "aiTextScore" INTEGER NOT NULL,
  "aiRiskScore" INTEGER NOT NULL,
  "riskLevel" "RiskLevel" NOT NULL,
  "finalScore" DECIMAL(5,2) NOT NULL,
  "grade" "Grade" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "evaluation_activities" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "type" "EvaluationActivityType" NOT NULL,
  "message" TEXT NOT NULL,
  "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "evaluation_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employees_storeId_idx" ON "employees"("storeId");
CREATE INDEX "evaluations_storeId_idx" ON "evaluations"("storeId");
CREATE INDEX "evaluations_employeeId_idx" ON "evaluations"("employeeId");
CREATE INDEX "evaluations_evaluationPeriod_idx" ON "evaluations"("evaluationPeriod");
CREATE INDEX "evaluations_evaluationStatus_idx" ON "evaluations"("evaluationStatus");
CREATE INDEX "evaluations_riskLevel_idx" ON "evaluations"("riskLevel");
CREATE INDEX "evaluations_finalScore_idx" ON "evaluations"("finalScore");
CREATE INDEX "evaluations_storeId_evaluationPeriod_idx" ON "evaluations"("storeId", "evaluationPeriod");
CREATE INDEX "evaluations_employeeId_evaluationPeriod_idx" ON "evaluations"("employeeId", "evaluationPeriod");
CREATE UNIQUE INDEX "evaluations_employeeId_storeId_evaluationPeriod_key" ON "evaluations"("employeeId", "storeId", "evaluationPeriod");
CREATE INDEX "evaluation_activities_storeId_idx" ON "evaluation_activities"("storeId");
CREATE INDEX "evaluation_activities_employeeId_idx" ON "evaluation_activities"("employeeId");
CREATE INDEX "evaluation_activities_timestamp_idx" ON "evaluation_activities"("timestamp");

ALTER TABLE "employees" ADD CONSTRAINT "employees_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_activities" ADD CONSTRAINT "evaluation_activities_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evaluation_activities" ADD CONSTRAINT "evaluation_activities_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
