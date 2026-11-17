-- Retain all employee/job identities; add the store as a shared FK component.
ALTER TABLE "employee_job_assignments" ADD COLUMN "storeId" TEXT;

UPDATE "employee_job_assignments" AS assignment
SET "storeId" = employee."storeId"
FROM "employees" AS employee
WHERE employee."id" = assignment."employeeId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "employee_job_assignments" AS assignment
    JOIN "store_job_definitions" AS job ON job."id" = assignment."jobId"
    WHERE assignment."storeId" IS NULL OR assignment."storeId" <> job."storeId"
  ) THEN
    RAISE EXCEPTION 'Employee job assignments contain cross-store rows; resolve explicitly before migration';
  END IF;
END $$;

ALTER TABLE "employee_job_assignments" ALTER COLUMN "storeId" SET NOT NULL;
CREATE UNIQUE INDEX "employees_id_storeId_key" ON "employees"("id", "storeId");
CREATE UNIQUE INDEX "store_job_definitions_id_storeId_key" ON "store_job_definitions"("id", "storeId");
CREATE INDEX "employee_job_assignments_jobId_storeId_idx" ON "employee_job_assignments"("jobId", "storeId");

ALTER TABLE "employee_job_assignments" DROP CONSTRAINT "employee_job_assignments_employeeId_fkey";
ALTER TABLE "employee_job_assignments" DROP CONSTRAINT "employee_job_assignments_jobId_fkey";
ALTER TABLE "employee_job_assignments" ADD CONSTRAINT "employee_job_assignments_employeeId_storeId_fkey"
  FOREIGN KEY ("employeeId", "storeId") REFERENCES "employees"("id", "storeId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_job_assignments" ADD CONSTRAINT "employee_job_assignments_jobId_storeId_fkey"
  FOREIGN KEY ("jobId", "storeId") REFERENCES "store_job_definitions"("id", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
