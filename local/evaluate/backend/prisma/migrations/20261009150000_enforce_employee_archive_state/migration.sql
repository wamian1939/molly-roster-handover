-- Preserve every employee row. Refuse to mark this migration applied if legacy
-- status/timestamp values disagree; they require an explicit HR decision.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "employees"
    WHERE ("status" = 'Active'::"EmployeeStatus" AND "archivedAt" IS NOT NULL)
       OR ("status" = 'Archived'::"EmployeeStatus" AND "archivedAt" IS NULL)
  ) THEN
    RAISE EXCEPTION 'Employee archive status and archivedAt disagree; resolve explicitly before migration';
  END IF;
END $$;

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_archive_state_check"
  CHECK (
    ("status" = 'Active'::"EmployeeStatus" AND "archivedAt" IS NULL)
    OR ("status" = 'Archived'::"EmployeeStatus" AND "archivedAt" IS NOT NULL)
  );
