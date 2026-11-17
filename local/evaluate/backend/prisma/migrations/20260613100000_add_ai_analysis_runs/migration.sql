-- CreateTable
CREATE TABLE "ai_analysis_runs" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "evaluationPeriod" TEXT NOT NULL,
    "evaluationId" TEXT,
    "triggeredByUserId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "textReviewSnapshot" TEXT NOT NULL,
    "includedRecentNotes" BOOLEAN NOT NULL DEFAULT false,
    "recentNotesCount" INTEGER NOT NULL DEFAULT 0,
    "aiTextScore" INTEGER,
    "aiRiskScore" INTEGER,
    "summary" TEXT,
    "strengths" JSONB,
    "improvementAreas" JSONB,
    "dimensionSignals" JSONB,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analysis_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_analysis_runs_employeeId_idx" ON "ai_analysis_runs"("employeeId");

-- CreateIndex
CREATE INDEX "ai_analysis_runs_storeId_idx" ON "ai_analysis_runs"("storeId");

-- CreateIndex
CREATE INDEX "ai_analysis_runs_evaluationId_idx" ON "ai_analysis_runs"("evaluationId");

-- CreateIndex
CREATE INDEX "ai_analysis_runs_evaluationPeriod_idx" ON "ai_analysis_runs"("evaluationPeriod");

-- CreateIndex
CREATE INDEX "ai_analysis_runs_status_idx" ON "ai_analysis_runs"("status");

-- CreateIndex
CREATE INDEX "ai_analysis_runs_createdAt_idx" ON "ai_analysis_runs"("createdAt");

-- CreateIndex
CREATE INDEX "ai_analysis_runs_employeeId_storeId_evaluationPeriod_idx" ON "ai_analysis_runs"("employeeId", "storeId", "evaluationPeriod");

-- AddForeignKey
ALTER TABLE "ai_analysis_runs" ADD CONSTRAINT "ai_analysis_runs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analysis_runs" ADD CONSTRAINT "ai_analysis_runs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
