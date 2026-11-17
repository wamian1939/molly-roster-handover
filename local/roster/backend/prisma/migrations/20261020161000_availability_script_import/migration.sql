ALTER TYPE "AvailabilitySource" ADD VALUE 'SCRIPT';

CREATE TABLE "availability_script_imports" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "actorAccountId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'APPEND',
    "createdCount" INTEGER NOT NULL,
    "unchangedCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "availability_script_imports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "availability_script_imports_storeId_sourceHash_key"
    ON "availability_script_imports"("storeId", "sourceHash");
CREATE INDEX "availability_script_imports_storeId_createdAt_idx"
    ON "availability_script_imports"("storeId", "createdAt");
