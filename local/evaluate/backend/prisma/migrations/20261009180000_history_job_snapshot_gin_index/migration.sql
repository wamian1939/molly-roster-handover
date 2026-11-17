-- Evaluation history filters frozen job snapshots with JSONB containment.
-- This additive index does not change historical snapshot contents.
CREATE INDEX "evaluation_rounds_employeeJobsSnapshot_idx"
ON "evaluation_rounds" USING GIN ("employeeJobsSnapshot" jsonb_path_ops);
