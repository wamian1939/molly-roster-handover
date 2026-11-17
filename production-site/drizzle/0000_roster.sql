-- Generated from backend/prisma/schema.prisma; inspect before deployment.
--> statement-breakpoint
-- No seed records or employee data in this migration.
--> statement-breakpoint
CREATE TABLE "roster_periods" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "startDate" TEXT NOT NULL,
  "endDate" TEXT NOT NULL,
  "cycleType" TEXT NOT NULL CHECK ("cycleType" IN ('WEEK','FORTNIGHT')),
  "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT','PUBLISHED')),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "createdByAccountId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  "publishedAt" TEXT,
  UNIQUE ("storeId","startDate","endDate"),
  UNIQUE ("id","storeId"),
  CHECK ("startDate" <= "endDate")
);
--> statement-breakpoint
CREATE INDEX "roster_periods_idx_0" ON "roster_periods" ("storeId","status","startDate");
--> statement-breakpoint
CREATE INDEX "roster_periods_idx_1" ON "roster_periods" ("storeId","endDate");
--> statement-breakpoint
CREATE TABLE "shift_roles" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT,
  "code" TEXT NOT NULL,
  "nameZh" TEXT NOT NULL,
  "colorToken" TEXT NOT NULL,
  "requiredSkillCodes" TEXT NOT NULL DEFAULT '[]' CHECK (json_valid("requiredSkillCodes")),
  "isActive" INTEGER NOT NULL DEFAULT 1 CHECK ("isActive" IN (0,1)),
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  UNIQUE ("storeId","code"),
  CHECK (length("colorToken")=7 AND substr("colorToken",1,1)='#' AND substr("colorToken",2) NOT GLOB '*[^0-9A-Fa-f]*')
);
--> statement-breakpoint
CREATE INDEX "shift_roles_idx_0" ON "shift_roles" ("storeId","isActive","displayOrder");
--> statement-breakpoint
CREATE TABLE "shifts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "rosterPeriodId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startAt" TEXT NOT NULL,
  "endAt" TEXT NOT NULL,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "shiftRoleId" TEXT NOT NULL,
  "roleNameSnapshot" TEXT NOT NULL,
  "roleColorSnapshot" TEXT NOT NULL,
  "publicNote" TEXT,
  "internalNote" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "createdByAccountId" TEXT NOT NULL,
  "updatedByAccountId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  FOREIGN KEY ("rosterPeriodId","storeId") REFERENCES "roster_periods" ("id","storeId") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("shiftRoleId") REFERENCES "shift_roles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CHECK ("startAt" < "endAt"),
  CHECK ("breakMinutes" >= 0 AND "breakMinutes" < (julianday("endAt")-julianday("startAt"))*1440)
);
--> statement-breakpoint
CREATE INDEX "shifts_idx_0" ON "shifts" ("storeId","date","startAt");
--> statement-breakpoint
CREATE INDEX "shifts_idx_1" ON "shifts" ("rosterPeriodId","date");
--> statement-breakpoint
CREATE INDEX "shifts_idx_2" ON "shifts" ("shiftRoleId");
--> statement-breakpoint
CREATE TABLE "shift_assignments" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shiftId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "employeeNameSnapshot" TEXT NOT NULL,
  "employeeTypeSnapshot" TEXT NOT NULL,
  "employmentTypeSnapshot" TEXT,
  "officialScoreSnapshot" TEXT,
  "tierSnapshot" TEXT,
  "officialScoreRoundId" TEXT,
  "officialScoreClosedAt" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("shiftId","employeeId"),
  FOREIGN KEY ("shiftId") REFERENCES "shifts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ("officialScoreSnapshot" IS NULL OR CAST("officialScoreSnapshot" AS REAL) BETWEEN 0 AND 100),
  CHECK ("tierSnapshot" IS NULL OR "tierSnapshot" IN ('T1','T2','T3','T4','T5'))
);
--> statement-breakpoint
CREATE INDEX "shift_assignments_idx_0" ON "shift_assignments" ("employeeId");
--> statement-breakpoint
CREATE INDEX "shift_assignments_idx_1" ON "shift_assignments" ("shiftId");
--> statement-breakpoint
CREATE TABLE "shift_create_requests" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "shiftId" TEXT NOT NULL UNIQUE,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
--> statement-breakpoint
CREATE INDEX "shift_create_requests_idx_0" ON "shift_create_requests" ("storeId","accountId");
--> statement-breakpoint
CREATE TABLE "employee_availability" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "employeeId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startAt" TEXT,
  "endAt" TEXT,
  "status" TEXT NOT NULL CHECK ("status" IN ('AVAILABLE','UNAVAILABLE','UNKNOWN')),
  "note" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANUAL' CHECK ("source" IN ('MANUAL','TEMPLATE','SCRIPT')),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  CHECK (("status"='UNKNOWN' AND "startAt" IS NULL AND "endAt" IS NULL) OR ("status" IN ('AVAILABLE','UNAVAILABLE') AND "startAt" IS NOT NULL AND "endAt" IS NOT NULL AND "startAt" < "endAt"))
);
--> statement-breakpoint
CREATE INDEX "employee_availability_idx_0" ON "employee_availability" ("storeId","date");
--> statement-breakpoint
CREATE INDEX "employee_availability_idx_1" ON "employee_availability" ("employeeId","date");
--> statement-breakpoint
CREATE INDEX "employee_availability_idx_2" ON "employee_availability" ("storeId","employeeId","date");
--> statement-breakpoint
CREATE TABLE "availability_script_imports" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "actorAccountId" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "weekStart" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'APPEND',
  "createdCount" INTEGER NOT NULL,
  "unchangedCount" INTEGER NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE ("storeId","sourceHash")
);
--> statement-breakpoint
CREATE INDEX "availability_script_imports_idx_0" ON "availability_script_imports" ("storeId","createdAt");
--> statement-breakpoint
CREATE TABLE "availability_script_shortcuts" (
  "storeId" TEXT NOT NULL PRIMARY KEY,
  "shortcuts" TEXT NOT NULL CHECK (json_valid("shortcuts")),
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "updatedByAccountId" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "breakMinutes" INTEGER NOT NULL DEFAULT 0,
  "shiftRoleId" TEXT,
  "isActive" INTEGER NOT NULL DEFAULT 1 CHECK ("isActive" IN (0,1)),
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  UNIQUE ("storeId","name"),
  FOREIGN KEY ("shiftRoleId") REFERENCES "shift_roles" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CHECK ("breakMinutes" >= 0)
);
--> statement-breakpoint
CREATE INDEX "shift_templates_idx_0" ON "shift_templates" ("storeId","isActive","displayOrder");
--> statement-breakpoint
CREATE TABLE "availability_templates" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slots" TEXT NOT NULL CHECK (json_valid("slots")),
  "isActive" INTEGER NOT NULL DEFAULT 1 CHECK ("isActive" IN (0,1)),
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  UNIQUE ("storeId","name")
);
--> statement-breakpoint
CREATE INDEX "availability_templates_idx_0" ON "availability_templates" ("storeId","isActive","displayOrder");
--> statement-breakpoint
CREATE TABLE "roster_publications" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "rosterPeriodId" TEXT NOT NULL,
  "periodVersion" INTEGER NOT NULL,
  "publishedByAccountId" TEXT NOT NULL,
  "publishedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "snapshot" TEXT NOT NULL CHECK (json_valid("snapshot")),
  UNIQUE ("rosterPeriodId","periodVersion"),
  FOREIGN KEY ("rosterPeriodId") REFERENCES "roster_periods" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
--> statement-breakpoint
CREATE INDEX "roster_publications_idx_0" ON "roster_publications" ("rosterPeriodId","publishedAt");
--> statement-breakpoint
CREATE TABLE "roster_store_settings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL UNIQUE,
  "timezone" TEXT NOT NULL DEFAULT 'Australia/Sydney',
  "openingTime" TEXT NOT NULL DEFAULT '09:00',
  "closingTime" TEXT NOT NULL DEFAULT '22:00',
  "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
  "minimumShiftMinutes" INTEGER NOT NULL DEFAULT 60,
  "defaultBreakMinutes" INTEGER NOT NULL DEFAULT 30,
  "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
  "cycleType" TEXT NOT NULL DEFAULT 'WEEK' CHECK ("cycleType" IN ('WEEK','FORTNIGHT')),
  "fortnightAnchorDate" TEXT,
  "weeklyHourWarning" INTEGER NOT NULL DEFAULT 38,
  "dailyHourWarning" INTEGER NOT NULL DEFAULT 10,
  "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" >= 1),
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "updatedAt" TEXT NOT NULL,
  CHECK ("slotIntervalMinutes" IN (15,30,60)),
  CHECK ("minimumShiftMinutes" >= "slotIntervalMinutes"),
  CHECK ("defaultBreakMinutes" >= 0),
  CHECK ("weekStartsOn" BETWEEN 0 AND 6),
  CHECK ("weeklyHourWarning" > 0 AND "dailyHourWarning" > 0)
);
--> statement-breakpoint
CREATE TRIGGER "period_no_overlap_insert" BEFORE INSERT ON roster_periods
WHEN EXISTS(SELECT 1 FROM roster_periods p WHERE p.storeId=NEW.storeId AND p.id<>NEW.id AND p.startDate<=NEW.endDate AND p.endDate>=NEW.startDate)
BEGIN SELECT RAISE(ABORT,'ROSTER_PERIOD_OVERLAP'); END;
--> statement-breakpoint
CREATE TRIGGER "period_no_overlap_update" BEFORE UPDATE ON roster_periods
WHEN EXISTS(SELECT 1 FROM roster_periods p WHERE p.storeId=NEW.storeId AND p.id<>NEW.id AND p.startDate<=NEW.endDate AND p.endDate>=NEW.startDate)
BEGIN SELECT RAISE(ABORT,'ROSTER_PERIOD_OVERLAP'); END;
