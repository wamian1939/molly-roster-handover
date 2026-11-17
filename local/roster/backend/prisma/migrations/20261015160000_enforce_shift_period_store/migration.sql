BEGIN;

CREATE UNIQUE INDEX "roster_periods_id_storeId_key" ON "roster_periods"("id", "storeId");

ALTER TABLE "shifts" ADD CONSTRAINT "shifts_rosterPeriodId_storeId_fkey"
  FOREIGN KEY ("rosterPeriodId", "storeId") REFERENCES "roster_periods"("id", "storeId")
  ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "shifts" VALIDATE CONSTRAINT "shifts_rosterPeriodId_storeId_fkey";
ALTER TABLE "shifts" DROP CONSTRAINT "shifts_rosterPeriodId_fkey";

COMMIT;
