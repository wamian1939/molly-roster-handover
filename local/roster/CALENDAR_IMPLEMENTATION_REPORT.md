# Calendar Implementation Report

Last updated: 2026-09-09 (Australia/Sydney)

## Outcome

The ShiftHelper study was completed as a strictly read-only, anonymized product-behaviour audit. Molly Roster now has a clearer visible Month/Week/Day switch, deterministic overlap preprocessing, a stronger centered Shift card contract, a clearer saved-role selector, and a separate multi-select Job filter for employee candidates. Existing Shift CRUD, multi-employee assignment, configured store hours, publication locking and responsive Week scrolling were preserved.

The independent implementation follows Molly's current product register: restrained `#e9b2b6` accents, compact information density, 44px controls, rectangular rounded cards, clear focus states and reduced-motion support. It does not copy ShiftHelper source, CSS, HTML, private APIs or brand assets.

## Reference conclusions used

- Month: Monday-first, compact Shift entries and date-to-Day navigation. The reference clips dense narrow layouts; Molly intentionally retains its explicit `+N` overflow handling.
- Week and Day: role, time, Break and employee names are vertically ordered and centered. Different or partially overlapping Shifts occupy independent columns. Touching endpoints may reuse a lane.
- Drag: one read-only reference drag from 09:00 to 10:00 opened Add Shift with exact prefill; Cancel returned to Calendar without a write.
- Job filter: the reference exposes colored multi-select Job controls linked to staff candidates. Molly keeps its own single persisted `shiftRoleId` and implements Job filtering as a clearly separate staff-search aid.
- Detailed evidence and the unverified reference edge case for same-role/time but different Break are recorded in `SHIFTHELPER_CALENDAR_REFERENCE_AUDIT.md`.

## Grouping and layout contract

A visual group is created only when all five fields match:

1. Local calendar date.
2. Start instant.
3. End instant.
4. Role ID.
5. Break minutes.

The group's assignments are the stable, de-duplicated union of matching employees and are always an array. Any date, start, end, role or Break difference produces a separate group.

`layoutCalendarShiftGroups` then partitions each date into overlap clusters, sorts groups deterministically, assigns the lowest reusable column, treats touching endpoints as non-overlapping, and calculates available column span. FullCalendar remains responsible for pixel geometry with `slotEventOverlap={false}`; the generated lane order is attached to each event and participates in strict event ordering. This avoids a second custom coordinate system while making complete overlap, partial overlap, containment, endpoint reuse and three-way overlap independently testable.

The renderer receives the normalized `CalendarShiftGroup` through event `extendedProps`. Selection mirrors render through their own component path, and an invalid isolated event renders a compact unavailable placeholder instead of taking down the entire Calendar.

## Local files

### New

- `src/lib/calendarOverlap.ts` — deterministic date/cluster/lane preprocessing.
- `src/lib/calendarOverlap.test.ts` — complete, triple, partial, touching, containment and free-space-span fixtures.
- `src/components/calendar/CalendarViewSwitch.tsx` and test — visible accessible Month/Week/Day segmented control.
- `src/components/calendar/StaffRoleFilter.tsx` and test — keyboard-accessible multi-select staff Job filter with All/Clear and role color states.
- `SHIFTHELPER_CALENDAR_REFERENCE_AUDIT.md` — anonymized read-only findings and zero-write ledger.
- `CALENDAR_PARITY_MATRIX.md` — completed before local Calendar changes.
- `CALENDAR_IMPLEMENTATION_REPORT.md` — this report.

### Refined

- `src/pages/CalendarPage.tsx` — overlap preprocessing/metadata and visible view switch integration.
- `src/components/calendar/ShiftEventCard.tsx` and test — full-content tooltip, assignment-count diagnostic attribute and Break 0/30/60 coverage.
- `src/components/calendar/RoleChipSelector.tsx` — clearer saved-role semantics, per-role selected treatment and explicit accessible radio labels.
- `src/components/calendar/ShiftDialog.tsx` and test — independent staff Job filters, OR filtering, result count, hidden-selected warning, matching-role emphasis and mobile grid-boundary fix.
- `src/lib/scheduling.ts` and test — reusable skill-based multi-role employee filtering.
- `src/styles.css` — view switch, role/Job chips, card name clipping/tooltip behaviour, 1024 toolbar breakpoint and responsive dialog correction.
- `.gitignore` — ignores `.private-reference/`.
- `GOAL_MODE_PROGRESS.md` — final evidence and continuation state.

The existing `calendarGrouping.ts` and `CalendarEventContent.tsx` normalized event boundary were audited and deliberately preserved rather than duplicated or weakened.

## UI behaviour

- Shift block hierarchy is role, `HH:mm ~ HH:mm`, `Break: Nh`, then centered employee names.
- Break stays explicit for 0h, 0.5h and 1h.
- Names wrap within two readable lines; the complete accessible label and native tooltip retain the full list when a narrow card clips it.
- Saved Shift role remains a single radio selection and visibly states that it controls the persisted role, Calendar color and skill hints.
- Staff Job filters are independent checkboxes. One or several may be selected; employee matching uses OR semantics across role requirements. `全部员工` clears the filter. Filtering never silently changes the saved role or selected employees.
- Selected employees hidden by any active search/type/Tier/Job filter remain selected and produce an explicit count warning.
- At 1024 and below, the toolbar stacks before the page title becomes cramped. Narrow Week keeps a readable 1232px internal canvas with Calendar-local horizontal scrolling.
- The dialog's content sections use an explicit shrink boundary so 390px no longer creates an internal horizontal scrollbar.

## Automated validation

| Gate | Result |
|---|---|
| Frontend Vitest | 10 files, 57 tests passed |
| Frontend ESLint | Passed |
| TypeScript + Vite production build | Passed |
| Backend Vitest | 4 files, 33 tests passed |
| Backend Prisma generation + TypeScript build | Passed after briefly stopping the local process that held the Windows Prisma engine DLL, then restarting it |
| Live Roster health | `ok=true`, database=true, evaluateMolly=true |
| Live Evaluate health | `ok=true` |

Focused automated coverage includes:

- Exact grouping equality, different role/time/Break separation, assignment counts, stable composite IDs, absent assignments normalization and incomplete optimistic-shape rejection.
- Two and three complete overlaps, partial overlap, touching endpoints, long-Shift containment and later free-column reuse/span.
- Shift card single/multiple/empty assignments, long names, absent optional score/Tier and Break 0/30/60.
- Valid group rendering, selection mirrors and invalid/stale event isolation.
- View switching and Job filter single/multiple/clear/keyboard behaviour.
- Job filtering integration without changing the saved primary role.

## Browser validation

Authenticated local ADMIN browser testing covered:

- Week: existing merged multi-employee groups and independent overlapping roles/times rendered in separate columns with centered text and explicit Break.
- Day: a two-employee same-role/time/Break group reported one card with assignment count 2; another same-role but different-time group remained separate. Three overlapping role/time groups occupied three distinct x-columns.
- Month: all eight existing groups rendered as compact cards with Break and names; Month date click switched to the correct Day.
- Drag Cancel: 09:00–10:00 prefilled exactly; Cancel closed the dialog and left the period at eight Shifts.
- Drag Save: exact 09:00–10:00 was saved after selecting a role and employee, rendered correctly, then deleted.
- Edit: a temporary 09:00–10:30 Shift was opened, its role changed and saved, then deleted through the two-step confirmation.
- A first Save attempt while Evaluate API was offline failed safely with a user-facing error and no partial Shift. After restoring Evaluate, Save succeeded without a Calendar render crash.
- Database cleanup: direct read-only query found zero Shift rows whose internal note matched the two QA markers.
- No `Cannot read properties of undefined (reading 'assignments')`, Error Boundary, application-origin console error or application-origin console warning occurred. The final clean tab only reported unrelated browser-extension warnings.

Responsive checks:

| Requested viewport | Result |
|---|---|
| 1920×1080 | Week controls and card hierarchy clear; centered card had zero internal overflow |
| 1366×768 | Week card widths remained usable; body overflow 0, Calendar-local horizontal overflow intentional |
| 1024×768 | Toolbar stacked cleanly after breakpoint fix; title stayed intact; Day had no Calendar overflow; Week scrolled internally |
| 768×1024 | Day card overflow 0; Week body overflow 0 with intentional internal scroll |
| 390×844 | Day defaulted correctly; body/card overflow 0; dialog overflow reduced from 60px to 0 and role cards became one column |

The controlled browser reports scaled CSS viewport dimensions on this Windows session; the table uses the requested physical viewport values.

## Regression risks and guards

- FullCalendar ultimately owns pixel positioning. Its package upgrade could change layout geometry; focused lane tests plus the browser x-coordinate assertions guard expected semantics.
- Very dense Week overlap can still make cards narrow. Container-query typography, two-line name clipping, full tooltip/accessibility label and the internal minimum-width canvas prevent content overlap and page-level overflow.
- Role requirements may be empty. Such a role intentionally matches every employee under OR filtering; this is covered by filter logic and makes “全岗” useful without altering the stored Shift role.
- Evaluate availability is required for server-side workforce validation. Failure is surfaced and produces no optimistic half-object; successful retry refetches normalized Calendar data.
- Multi-record visual groups remain non-draggable and route to the existing concrete-Shift chooser, protecting CRUD version/audit semantics.

## External reference zero-modification confirmation

Confirmed:

- No ShiftHelper Shift was saved or deleted.
- No Save, Submit, Delete, Batch Operation, Publish or Export action was invoked.
- No Staff, Setting or Availability record was changed.
- No mutation request was called or replayed.
- No credential, cookie, token, authorization header, employee identifier or other sensitive employee detail was recorded.
- No reference screenshot was saved, uploaded, committed or used as a production asset.
- No ShiftHelper source, CSS, HTML, bundle, source map, private API or brand asset was copied.

## Remaining issues

- The inspected ShiftHelper data did not contain a clean same-date/same-time/same-role/different-Break pair. Molly therefore keeps its explicit Break-separation rule from the local business contract rather than claiming direct reference evidence for that edge.
- The user's existing long-term master-contract gates for a real STORE_EVALUATOR browser account and a legitimate newly closed Evaluate round are unchanged and outside this scoped Calendar parity task.
