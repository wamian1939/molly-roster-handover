-- CreateEnum
CREATE TYPE "PerformanceNoteType" AS ENUM ('Positive', 'Negative', 'Neutral', 'Coaching');

-- CreateTable
CREATE TABLE "performance_notes" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "authorId" TEXT,
    "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noteType" "PerformanceNoteType" NOT NULL,
    "dimensions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "scoreImpact" INTEGER,
    "noteText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "performance_notes_employeeId_idx" ON "performance_notes"("employeeId");

-- CreateIndex
CREATE INDEX "performance_notes_storeId_idx" ON "performance_notes"("storeId");

-- CreateIndex
CREATE INDEX "performance_notes_noteType_idx" ON "performance_notes"("noteType");

-- CreateIndex
CREATE INDEX "performance_notes_noteDate_idx" ON "performance_notes"("noteDate");

-- CreateIndex
CREATE INDEX "performance_notes_storeId_noteDate_idx" ON "performance_notes"("storeId", "noteDate");

-- CreateIndex
CREATE INDEX "performance_notes_employeeId_noteDate_idx" ON "performance_notes"("employeeId", "noteDate");

-- AddForeignKey
ALTER TABLE "performance_notes" ADD CONSTRAINT "performance_notes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_notes" ADD CONSTRAINT "performance_notes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
