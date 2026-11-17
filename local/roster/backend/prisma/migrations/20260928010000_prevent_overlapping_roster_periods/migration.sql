CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "roster_periods"
  ADD CONSTRAINT "roster_periods_store_date_no_overlap"
  EXCLUDE USING gist (
    "storeId" WITH =,
    daterange("startDate", "endDate", '[]') WITH &&
  );
