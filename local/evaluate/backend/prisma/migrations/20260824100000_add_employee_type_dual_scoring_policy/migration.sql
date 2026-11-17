CREATE TYPE "EmployeeType" AS ENUM ('TRAINING', 'REGULAR');

ALTER TABLE "employees"
ADD COLUMN "employeeType" "EmployeeType" NOT NULL DEFAULT 'REGULAR';

ALTER TABLE "evaluations"
ADD COLUMN "employeeTypeSnapshot" "EmployeeType",
ADD COLUMN "scoringPolicySnapshot" JSONB;

UPDATE "evaluations"
SET
  "employeeTypeSnapshot" = 'REGULAR',
  "scoringPolicySnapshot" = jsonb_build_object(
    'skillWeight', 50,
    'speedWeight', 12,
    'initiativeWeight', 10,
    'attitudeWeight', 10,
    'availabilityWeight', 8,
    'textWeight', 10
  );

ALTER TABLE "evaluations"
ALTER COLUMN "employeeTypeSnapshot" SET NOT NULL,
ALTER COLUMN "scoringPolicySnapshot" SET NOT NULL;

CREATE INDEX "employees_storeId_status_employeeType_idx"
ON "employees"("storeId", "status", "employeeType");
