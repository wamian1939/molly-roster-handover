ALTER TABLE "employees"
  ADD COLUMN "openingQualified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "closingQualified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "weeklyCleaningQualified" BOOLEAN NOT NULL DEFAULT false;
