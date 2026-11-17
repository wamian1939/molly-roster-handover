-- Expand employee classification with store-scoped, reusable job definitions.
CREATE TABLE "store_job_definitions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "colorToken" TEXT NOT NULL DEFAULT 'slate',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "store_job_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_job_assignments" (
    "employeeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedByAccountId" TEXT,
    CONSTRAINT "employee_job_assignments_pkey" PRIMARY KEY ("employeeId", "jobId")
);

ALTER TABLE "evaluation_rounds"
ADD COLUMN "employeeJobsSnapshot" JSONB,
ADD COLUMN "employeeDisplayNameSnapshot" TEXT,
ADD COLUMN "storeNameSnapshot" TEXT;

CREATE UNIQUE INDEX "store_job_definitions_storeId_name_key"
ON "store_job_definitions"("storeId", "name");
CREATE INDEX "store_job_definitions_storeId_isActive_displayOrder_idx"
ON "store_job_definitions"("storeId", "isActive", "displayOrder");
CREATE INDEX "employee_job_assignments_jobId_idx"
ON "employee_job_assignments"("jobId");
CREATE INDEX "employee_job_assignments_assignedByAccountId_idx"
ON "employee_job_assignments"("assignedByAccountId");

ALTER TABLE "store_job_definitions"
ADD CONSTRAINT "store_job_definitions_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_job_assignments"
ADD CONSTRAINT "employee_job_assignments_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_job_assignments"
ADD CONSTRAINT "employee_job_assignments_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "store_job_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_job_assignments"
ADD CONSTRAINT "employee_job_assignments_assignedByAccountId_fkey"
FOREIGN KEY ("assignedByAccountId") REFERENCES "user_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed only the two confirmed initial jobs for each active store. Existing
-- employees intentionally remain unassigned.
INSERT INTO "store_job_definitions"
    ("id", "storeId", "name", "code", "colorToken", "displayOrder", "isActive")
SELECT
    'job_' || md5(store."id" || ':full-role'),
    store."id",
    '全岗',
    'full-role',
    'teal',
    10,
    true
FROM "stores" AS store
WHERE store."isActive" = true
ON CONFLICT ("storeId", "name") DO NOTHING;

INSERT INTO "store_job_definitions"
    ("id", "storeId", "name", "code", "colorToken", "displayOrder", "isActive")
SELECT
    'job_' || md5(store."id" || ':trainer'),
    store."id",
    '带训员',
    'trainer',
    'violet',
    20,
    true
FROM "stores" AS store
WHERE store."isActive" = true
ON CONFLICT ("storeId", "name") DO NOTHING;
