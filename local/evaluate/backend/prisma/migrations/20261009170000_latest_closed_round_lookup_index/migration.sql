-- Supports the per-employee latest valid CLOSED round lookup without sorting
-- every historical round. This is additive and does not modify employee data.
CREATE INDEX "evaluation_rounds_employeeId_status_createdAt_id_idx"
ON "evaluation_rounds"("employeeId", "status", "createdAt" DESC, "id" DESC);
