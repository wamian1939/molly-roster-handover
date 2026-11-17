ALTER TABLE "stores"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "stores_isActive_name_idx" ON "stores"("isActive", "name");

ALTER TABLE "evaluations" ALTER COLUMN "evaluationPeriod" DROP NOT NULL;

CREATE UNIQUE INDEX "evaluations_one_active_v1_draft_per_employee_idx"
ON "evaluations"("employeeId")
WHERE "scoringVersion" = 'v1' AND "evaluationStatus" = 'Draft';

ALTER TABLE "employees" DROP CONSTRAINT "employees_storeId_fkey";
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_employeeId_fkey";
ALTER TABLE "evaluations" DROP CONSTRAINT "evaluations_storeId_fkey";
ALTER TABLE "ai_analysis_runs" DROP CONSTRAINT "ai_analysis_runs_employeeId_fkey";
ALTER TABLE "ai_analysis_runs" DROP CONSTRAINT "ai_analysis_runs_storeId_fkey";
ALTER TABLE "evaluation_activities" DROP CONSTRAINT "evaluation_activities_employeeId_fkey";
ALTER TABLE "evaluation_activities" DROP CONSTRAINT "evaluation_activities_storeId_fkey";
ALTER TABLE "performance_notes" DROP CONSTRAINT "performance_notes_employeeId_fkey";
ALTER TABLE "performance_notes" DROP CONSTRAINT "performance_notes_storeId_fkey";

ALTER TABLE "employees"
ADD CONSTRAINT "employees_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluations"
ADD CONSTRAINT "evaluations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluations"
ADD CONSTRAINT "evaluations_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_analysis_runs"
ADD CONSTRAINT "ai_analysis_runs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_analysis_runs"
ADD CONSTRAINT "ai_analysis_runs_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_activities"
ADD CONSTRAINT "evaluation_activities_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_activities"
ADD CONSTRAINT "evaluation_activities_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_notes"
ADD CONSTRAINT "performance_notes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance_notes"
ADD CONSTRAINT "performance_notes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
