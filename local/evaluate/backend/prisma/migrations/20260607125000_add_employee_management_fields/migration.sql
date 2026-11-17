CREATE TYPE "EmployeeStatus" AS ENUM ('Active', 'Archived');

ALTER TABLE "employees"
  ADD COLUMN "status" "EmployeeStatus" NOT NULL DEFAULT 'Active',
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "employees_status_idx" ON "employees"("status");
CREATE INDEX "employees_storeId_status_idx" ON "employees"("storeId", "status");
