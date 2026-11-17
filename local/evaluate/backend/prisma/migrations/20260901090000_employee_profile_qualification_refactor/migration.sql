-- Employee display names remain intact. Legal-name fields are deliberately nullable
-- because legacy names cannot be safely split into surname and given name.
ALTER TYPE "EmploymentType" RENAME VALUE 'Seasonal' TO 'Casual';

CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE');

ALTER TABLE "employees" RENAME COLUMN "name" TO "displayName";

ALTER TABLE "employees"
  ADD COLUMN "surname" TEXT,
  ADD COLUMN "givenName" TEXT,
  ADD COLUMN "englishName" TEXT,
  ADD COLUMN "gender" "Gender",
  ADD COLUMN "dateOfBirth" DATE,
  ADD COLUMN "emailAddress" TEXT,
  ADD COLUMN "mobileTelephoneNumber" TEXT,
  ADD COLUMN "addressLine" TEXT,
  ADD COLUMN "suburb" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "postcode" TEXT,
  ADD COLUMN "employmentCommencementDate" DATE,
  ADD COLUMN "bankAccountName" TEXT,
  ADD COLUMN "bsbNumber" TEXT,
  ADD COLUMN "bankAccountNumber" TEXT,
  ADD COLUMN "taxFileNumber" TEXT,
  ADD COLUMN "abn" TEXT,
  ADD COLUMN "holdsWorkingHolidayVisa" BOOLEAN,
  ADD COLUMN "visaType" TEXT,
  ADD COLUMN "superannuationCompany" TEXT,
  ADD COLUMN "superannuationAccountNumber" TEXT,
  ADD COLUMN "uniqueSuperannuationIdentifier" TEXT;

-- Position and manually-maintained tenure are no longer Employee sources of truth.
ALTER TABLE "employees" DROP COLUMN "role";
ALTER TABLE "employees" DROP COLUMN "tenure";

ALTER TABLE "evaluations"
  ADD COLUMN "openingQualificationSnapshot" "QualificationStatus" NOT NULL DEFAULT 'Unknown',
  ADD COLUMN "closingQualificationSnapshot" "QualificationStatus" NOT NULL DEFAULT 'Unknown',
  ADD COLUMN "weeklyCleaningQualificationSnapshot" "QualificationStatus" NOT NULL DEFAULT 'Unknown';

ALTER TABLE "evaluation_rounds"
  ADD COLUMN "qualificationsAppliedAt" TIMESTAMP(3),
  ADD COLUMN "qualificationsAppliedByAccountId" TEXT;

CREATE INDEX "employees_displayName_idx" ON "employees"("displayName");
CREATE INDEX "employees_englishName_idx" ON "employees"("englishName");
