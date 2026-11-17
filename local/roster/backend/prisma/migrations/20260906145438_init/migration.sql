-- CreateEnum
CREATE TYPE "RosterCycleType" AS ENUM ('WEEK', 'FORTNIGHT');

-- CreateEnum
CREATE TYPE "RosterStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AvailabilitySource" AS ENUM ('MANUAL', 'TEMPLATE');

-- CreateTable
CREATE TABLE "roster_periods" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "cycleType" "RosterCycleType" NOT NULL,
    "status" "RosterStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "roster_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_roles" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "code" TEXT NOT NULL,
    "nameZh" TEXT NOT NULL,
    "colorToken" TEXT NOT NULL,
    "requiredSkillCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" TEXT NOT NULL,
    "rosterPeriodId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "shiftRoleId" TEXT NOT NULL,
    "roleNameSnapshot" TEXT NOT NULL,
    "roleColorSnapshot" TEXT NOT NULL,
    "publicNote" TEXT,
    "internalNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByAccountId" TEXT NOT NULL,
    "updatedByAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeNameSnapshot" TEXT NOT NULL,
    "employeeTypeSnapshot" TEXT NOT NULL,
    "employmentTypeSnapshot" TEXT,
    "officialScoreSnapshot" DECIMAL(5,2),
    "tierSnapshot" TEXT,
    "officialScoreRoundId" TEXT,
    "officialScoreClosedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_availability" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "status" "AvailabilityStatus" NOT NULL,
    "note" TEXT,
    "source" "AvailabilitySource" NOT NULL DEFAULT 'MANUAL',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_templates" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "shiftRoleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_templates" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slots" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "availability_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_publications" (
    "id" TEXT NOT NULL,
    "rosterPeriodId" TEXT NOT NULL,
    "periodVersion" INTEGER NOT NULL,
    "publishedByAccountId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "roster_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_store_settings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
    "openingTime" TEXT NOT NULL DEFAULT '09:00',
    "closingTime" TEXT NOT NULL DEFAULT '22:00',
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "minimumShiftMinutes" INTEGER NOT NULL DEFAULT 60,
    "defaultBreakMinutes" INTEGER NOT NULL DEFAULT 30,
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "cycleType" "RosterCycleType" NOT NULL DEFAULT 'WEEK',
    "weeklyHourWarning" INTEGER NOT NULL DEFAULT 38,
    "dailyHourWarning" INTEGER NOT NULL DEFAULT 10,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roster_store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roster_periods_storeId_status_startDate_idx" ON "roster_periods"("storeId", "status", "startDate");

-- CreateIndex
CREATE INDEX "roster_periods_storeId_endDate_idx" ON "roster_periods"("storeId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "roster_periods_storeId_startDate_endDate_key" ON "roster_periods"("storeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "shift_roles_storeId_isActive_displayOrder_idx" ON "shift_roles"("storeId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "shift_roles_storeId_code_key" ON "shift_roles"("storeId", "code");

-- CreateIndex
CREATE INDEX "shifts_storeId_date_startAt_idx" ON "shifts"("storeId", "date", "startAt");

-- CreateIndex
CREATE INDEX "shifts_rosterPeriodId_date_idx" ON "shifts"("rosterPeriodId", "date");

-- CreateIndex
CREATE INDEX "shifts_shiftRoleId_idx" ON "shifts"("shiftRoleId");

-- CreateIndex
CREATE INDEX "shift_assignments_employeeId_idx" ON "shift_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "shift_assignments_shiftId_idx" ON "shift_assignments"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_assignments_shiftId_employeeId_key" ON "shift_assignments"("shiftId", "employeeId");

-- CreateIndex
CREATE INDEX "employee_availability_storeId_date_idx" ON "employee_availability"("storeId", "date");

-- CreateIndex
CREATE INDEX "employee_availability_employeeId_date_idx" ON "employee_availability"("employeeId", "date");

-- CreateIndex
CREATE INDEX "employee_availability_storeId_employeeId_date_idx" ON "employee_availability"("storeId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "shift_templates_storeId_isActive_displayOrder_idx" ON "shift_templates"("storeId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "shift_templates_storeId_name_key" ON "shift_templates"("storeId", "name");

-- CreateIndex
CREATE INDEX "availability_templates_storeId_isActive_displayOrder_idx" ON "availability_templates"("storeId", "isActive", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "availability_templates_storeId_name_key" ON "availability_templates"("storeId", "name");

-- CreateIndex
CREATE INDEX "roster_publications_rosterPeriodId_publishedAt_idx" ON "roster_publications"("rosterPeriodId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "roster_publications_rosterPeriodId_periodVersion_key" ON "roster_publications"("rosterPeriodId", "periodVersion");

-- CreateIndex
CREATE UNIQUE INDEX "roster_store_settings_storeId_key" ON "roster_store_settings"("storeId");

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_rosterPeriodId_fkey" FOREIGN KEY ("rosterPeriodId") REFERENCES "roster_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_shiftRoleId_fkey" FOREIGN KEY ("shiftRoleId") REFERENCES "shift_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_shiftRoleId_fkey" FOREIGN KEY ("shiftRoleId") REFERENCES "shift_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_publications" ADD CONSTRAINT "roster_publications_rosterPeriodId_fkey" FOREIGN KEY ("rosterPeriodId") REFERENCES "roster_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
