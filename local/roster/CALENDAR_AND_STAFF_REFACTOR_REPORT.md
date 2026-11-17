# Calendar and Staff refactor report

Completed: 2026-09-10 (Australia/Sydney)

## Outcome

Molly Roster now keeps the local database as the only runtime ShiftRole source while adopting the useful information architecture observed in ShiftHelper. Month is substantially denser, Day/Week cards use their height for readable staff information, role colours are consistent across calendar and staff surfaces, and Staff provides practical type/Tier/role discovery without copying or maintaining a second employee directory.

## Reference study conclusions

- Month succeeds through one-line event rows rather than miniature multi-line Day cards.
- Week and Day keep Role, Time and Break in a compact header and give staff names stronger visual weight below it.
- Exact-equivalent shifts consolidate before overlap placement; different roles, ranges or Break values remain independent.
- Calendar and shift-dialog roles use stable colour families.
- Shift Job selection and employee filtering are separate concepts.
- Staff discovery benefits from a dense searchable/filterable index; the richer staff selection card belongs inside the scheduling dialog.

Full anonymised evidence is in `SHIFTHELPER_CALENDAR_AND_STAFF_AUDIT.md`, `CALENDAR_READABILITY_AUDIT.md` and `SHIFTHELPER_PARITY_MATRIX.md`.

## Database role architecture

Current database evidence: 7 active ShiftRole rows, comprising 6 global roles and 1 Hurstville role. Hurstville receives 7; stores without a scoped override receive the 6 global roles.

Final chain:

`shift_roles → RosterService.listRoles(storeId) → GET /roster/roles → Calendar / Shift Dialog / Staff filter / Legend / Staff role tags`

- Normal runtime calls return active global + active current-store roles only.
- `includeInactive=true` is restricted to ADMIN and used only by Settings so a deactivated store role can be re-enabled.
- Shift event normalisation prefers current related DB role name/code/colour and falls back to historical snapshots only when the relation is unavailable.
- Invalid/missing colours use a stable role identity hash over an approved palette. No role name, array index or randomness is used.
- The existing database hex constraint remains the input safety boundary; no migration was needed.
- The six-role seed array remains seed-only initial data. No frontend production role array or name-to-colour mapping exists.

See `ROLE_DATA_SOURCE_AUDIT.md` for the complete source matrix.

## Calendar changes

### Month

- Dedicated 30 px compact event row.
- Visible row prioritises Role, Time and compact Break.
- Full staff list remains in title/accessibility text.
- Three-event day limit and `more` behaviour remain intact.

### Week and Day

- Cards are now a two-row grid: compact header plus a flexible centred assignment body.
- Tall events use up to 18 px Role and 17 px staff names; medium events use 14/13.5 px; short events retain a practical 11–12 px hierarchy.
- Short events show the first employee plus `+N`; tooltip/accessibility text contains the full list.
- Break renders as `无休息`, `休息 30 分钟` or `休息 1 小时`; constrained cards use `休 0`, `休 30m` or `休 1h`.
- Explicit two/three/four-column CSS contracts prevent wide-font overflow in Week overlap lanes. The former 7–8 px fallback was removed.
- A compact active-role Legend is sourced from the same API and colour helper as cards and selectors.

### Grouping and overlap

The unchanged merge key is:

`date + startAt + endAt + roleId + breakMinutes`

Only all-five-equal records merge, with deduplicated and sorted `assignments[]`. Any role, start, end, Break or date difference remains an independent event. Grouping occurs before deterministic overlap clustering. Touching endpoints do not overlap and completed lanes can be reused.

`CalendarShiftGroup.role` now includes `id`, `code`, `name` and normalised `colorToken`; `assignments` remains a required array. Invalid optimistic/event shapes cannot reach `ShiftEventCard`.

## Shift dialog

- The shift Role remains a database-driven single-select because Shift stores one `shiftRoleId`.
- The staff Role filter remains an independent OR-style multi-select based on each role's `requiredSkillCodes`.
- Both use the shared role colour contract, visible selected state, native radio/checkbox keyboard semantics and focus-visible behaviour.
- Save, edit, multi-employee selection, conflict checks, availability warnings and two-step delete remain intact.

## Staff page

- Employee master data continues to come read-only from Evaluate Molly. No employee row is duplicated into Roster.
- Added compact filters for active Employee Type, official Tier and a DB ShiftRole match, alongside name search.
- Role matching joins `ShiftRole.requiredSkillCodes` to current Evaluate `qualifiedSkillCodes`.
- Directory cards show official type/score/Tier, up to three colour-consistent matching roles, `+N`, cycle hours and an availability summary.
- Detail header shows all matching roles, official score/Tier, current-cycle hours and availability status.
- Availability editing remains the Roster-owned data surface. HR contact/address/evaluator-level data stays excluded.
- The 680 px availability table remains internally horizontally scrollable on mobile; page body overflow remains zero.

## Files changed

- `backend/src/rosterService.ts` — active/inactive role query mode with unchanged global/current-store scope.
- `backend/src/routes.ts` — validated `includeInactive` query and ADMIN gate.
- `backend/tests/rosterService.test.ts`, `backend/tests/rosterRoutes.test.ts` — role scope and inactive administration coverage.
- `src/lib/roleColor.ts`, `src/lib/roleColor.test.ts` — shared persisted-colour validation and deterministic fallback.
- `src/lib/calendarGrouping.ts`, `src/lib/calendarGrouping.test.ts` — role code/current DB display normalisation and fallback tests.
- `src/components/calendar/ShiftEventCard.tsx`, tests and `src/styles.css` — view/duration-specific event structure, typography and responsive density.
- `src/components/calendar/RoleLegend.tsx` and test — DB-driven active role legend.
- `src/components/calendar/RoleChipSelector.tsx`, `StaffRoleFilter.tsx` — shared role colour application.
- `src/pages/CalendarPage.tsx` — Legend and overlap column-count presentation contract.
- `src/pages/StaffPage.tsx` — DB role filters/matches, cycle hours and availability summaries.
- `src/pages/SettingsPage.tsx` — inactive role visibility/reactivation and source explanation.
- `src/components/ui/AppSelect.tsx` — explicit accessible labels for compact filter controls.
- Four audit/matrix documents and this report.

## Automated verification

- Frontend: 12 files, 68 tests passed.
- Backend: 4 files, 36 tests passed.
- ESLint: passed.
- Frontend TypeScript/Vite production build: passed.
- Backend Prisma generation and TypeScript production build: passed.
- Live health: database=true, evaluateMolly=true.
- Database after QA cleanup: 7 roles, 7 active roles, 10 total existing shifts across stores, 0 shifts with the temporary Codex QA note.

Coverage includes exact grouping differences, stable composite IDs, assignments normalisation, current-role/snapshot fallback, deterministic colours, role Legend, 0/30/60 Break, empty/multiple/long staff names, short/medium/tall/month card contracts, two/three/mixed overlap, role scope, inactive administration, staff type/Tier/role filtering helpers, conflicts and availability.

## Browser QA

- Hurstville Legend displayed exactly 7 active scoped roles; Green Square displayed 6 global roles.
- Week displayed 9 grouped visual blocks for Hurstville with merged assignment counts of 3, 2, 4, 2 and 2 where the five-field keys matched.
- Three concurrent lanes rendered side by side with an 11 px Role floor after the final overlap-width adjustment.
- Tall Week cards measured up to 18 px Role and 17 px employee names; staff names occupied the flexible card body.
- Month event rows measured 30 px and retained compact Break content.
- Day 09:00→10:00 real pointer drag snapped to exact 09:00/10:00 dialog values. Cancel produced no write.
- A local temporary shift was created, reopened, changed from 30-minute Break to zero, saved, reopened and deleted. The period summary returned to 9 shifts / 17 assignments / 72.0 hours and the QA note count returned to zero.
- Role radio selection and staff-role checkbox selection produced visible colour/state changes without changing data until Save.
- Staff search reached zero results; Tier T1 reduced 25 active employees to 4; the DB 后厨 role filter returned 12 after clearing search.
- Requested 1920×1080, 1366×768, 1024×768, tablet and 390×844 layouts were exercised. Week uses calendar-local horizontal scrolling at constrained widths; Day/Month and page body had no horizontal overflow. Staff availability table scrolls internally at 390.
- Final browser error log: empty; no uncaught runtime error or Error Boundary.

## External zero-write confirmation

No ShiftHelper Save, Delete, Submit, Publish, Batch Operation, Staff mutation, Settings mutation, Availability mutation, Export or mutation API was used. Existing dialogs were closed with Cancel. No sensitive employee data, credential, cookie, token, full API response or reference screenshot was committed or copied into Molly Roster.

## Remaining risks

- The current local database intentionally contains both `验收岗` and `前场` with the same configured blue. The UI honours the database and always includes text labels, but an administrator may choose a distinct colour in Settings for stronger visual separation.
- A strict role match requires every `requiredSkillCode`. A role can legitimately return zero candidates; the UI reports the count rather than silently weakening requirements.
- Prisma reports that package.json configuration will be deprecated in Prisma 7. This does not affect the current Prisma 6 build.
- The pre-existing full browser pass for a real STORE_EVALUATOR account still requires user-controlled login; route/store-scope tests remain green.

