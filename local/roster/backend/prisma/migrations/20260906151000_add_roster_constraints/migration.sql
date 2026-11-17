ALTER TABLE "roster_periods"
  ADD CONSTRAINT "roster_periods_date_range_check" CHECK ("startDate" <= "endDate"),
  ADD CONSTRAINT "roster_periods_version_check" CHECK ("version" >= 1);

ALTER TABLE "shift_roles"
  ADD CONSTRAINT "shift_roles_version_check" CHECK ("version" >= 1),
  ADD CONSTRAINT "shift_roles_color_token_check" CHECK ("colorToken" ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE "shifts"
  ADD CONSTRAINT "shifts_time_range_check" CHECK ("startAt" < "endAt"),
  ADD CONSTRAINT "shifts_break_check" CHECK ("breakMinutes" >= 0 AND "breakMinutes" * 60 < EXTRACT(EPOCH FROM ("endAt" - "startAt"))),
  ADD CONSTRAINT "shifts_version_check" CHECK ("version" >= 1);

ALTER TABLE "shift_assignments"
  ADD CONSTRAINT "shift_assignments_score_check" CHECK ("officialScoreSnapshot" IS NULL OR ("officialScoreSnapshot" >= 0 AND "officialScoreSnapshot" <= 100)),
  ADD CONSTRAINT "shift_assignments_tier_check" CHECK ("tierSnapshot" IS NULL OR "tierSnapshot" IN ('T1', 'T2', 'T3', 'T4', 'T5'));

ALTER TABLE "employee_availability"
  ADD CONSTRAINT "employee_availability_time_check" CHECK (
    ("status" = 'UNKNOWN' AND "startAt" IS NULL AND "endAt" IS NULL)
    OR
    ("status" IN ('AVAILABLE', 'UNAVAILABLE') AND "startAt" IS NOT NULL AND "endAt" IS NOT NULL AND "startAt" < "endAt")
  ),
  ADD CONSTRAINT "employee_availability_version_check" CHECK ("version" >= 1);

ALTER TABLE "shift_templates"
  ADD CONSTRAINT "shift_templates_break_check" CHECK ("breakMinutes" >= 0),
  ADD CONSTRAINT "shift_templates_version_check" CHECK ("version" >= 1);

ALTER TABLE "availability_templates"
  ADD CONSTRAINT "availability_templates_version_check" CHECK ("version" >= 1);

ALTER TABLE "roster_store_settings"
  ADD CONSTRAINT "roster_store_settings_slot_check" CHECK ("slotIntervalMinutes" IN (15, 30, 60)),
  ADD CONSTRAINT "roster_store_settings_minimum_shift_check" CHECK ("minimumShiftMinutes" >= "slotIntervalMinutes"),
  ADD CONSTRAINT "roster_store_settings_default_break_check" CHECK ("defaultBreakMinutes" >= 0),
  ADD CONSTRAINT "roster_store_settings_week_start_check" CHECK ("weekStartsOn" BETWEEN 0 AND 6),
  ADD CONSTRAINT "roster_store_settings_hour_warning_check" CHECK ("weeklyHourWarning" > 0 AND "dailyHourWarning" > 0),
  ADD CONSTRAINT "roster_store_settings_version_check" CHECK ("version" >= 1);

