CREATE INDEX "evaluations_scoringVersion_evaluationStatus_completedAt_idx"
ON "evaluations"("scoringVersion", "evaluationStatus", "completedAt");

CREATE INDEX "evaluations_storeId_scoringVersion_evaluationStatus_completedAt_idx"
ON "evaluations"("storeId", "scoringVersion", "evaluationStatus", "completedAt");

CREATE INDEX "evaluations_employeeId_scoringVersion_evaluationStatus_completedAt_idx"
ON "evaluations"("employeeId", "scoringVersion", "evaluationStatus", "completedAt");
