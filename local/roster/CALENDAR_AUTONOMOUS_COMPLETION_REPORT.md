# Calendar autonomous completion report

Status: high-value local implementation complete with known external and interaction limits. Updated 2026-10-08 (Australia/Sydney).

## Cycle 1 — publication and mutation integrity

Reproduced and fixed a publication snapshot race. A mocked concurrent edit could enter after the old pre-transaction read and before publication; the saved snapshot then omitted that edit. Publication now obtains the shared store-period advisory lock and reads the definitive shift set inside the same transaction that updates status and saves the immutable snapshot. Shift create, edit, delete, batch mutations, reopen, and week copy take the same lock before checking mutable period state. Single-shift reposition already did so.

Evidence: the new regression failed before the fix and passes after it. PostgreSQL integration tested publish racing with a second shift create and rejection of deletion from the resulting published roster. Backend: 59/59 tests with database integration and TypeScript check passed. Isolated integration fixtures were cleaned.

## Cycle 2 — store-local time and availability integrity

Calendar now uses FullCalendar's named-zone Luxon plugin, so rendered instants, selection, drag and resize use the configured store timezone. Manual shift input, copy-draft date changes, event labels, conflict feedback and Staff availability editing convert between store wall clock and absolute timestamps. Date movement uses calendar dates instead of fixed 24-hour offsets. Nonexistent DST times are rejected; repeated clock times choose the earlier occurrence. Configured week starts now control implicit period targeting. Backend availability writes reject a start timestamp whose store-local date differs from the submitted availability date. Weekly hours use the persisted roster date instead of browser-local week boundaries. [FullCalendar named timezone documentation](https://legacy.fullcalendar.io/v6/timeZone) explains why the named-zone plugin is required.

Automated evidence: frontend 91/91 after the timezone and week-boundary changes; backend database suite reached 60/60 before copy-batch regression was added. Browser confirmed the local Calendar loads with Australia/Sydney selected and the shift dialog shows the store timezone. A non-persistent draft was closed.

## Cycle 3 — copy and editing efficiency

The Add Shift action now retains the current Week view. A first-class Copy Previous Week button fetches the previous completed period, reuses the existing all-or-nothing preview and atomic copy endpoint, and shows assignment-level availability/conflict blockers before any write. Browser confirmed a previous-week preview with one unavailable employee, disabled confirmation and no write. Week copy now checks overlapping assignments *within* the copied batch in both preview and transactional execution; formerly only existing database shifts were checked. A database regression seeds a legacy overlapping source and confirms target period count remains unchanged.

## Cycle 4 — Copy Day and stale-preview protection

Copy Day now has source/target date fields, an all-or-nothing preview, and a transactional backend operation. The server checks active employee scope, target availability, existing same-store and cross-store assignments, collisions within the batch, store operating rules and published target lock. It preserves role, break, notes, assignments and store-local clock time. The target week is created only inside the successful transaction. Both Copy Day and Copy Week carry source period versions from preview to execution; Copy Day also carries target period version, so intervening manager edits return 409 and require a new preview. Database tests cover successful copy, unavailable target, overlap, stale versions and a Sydney DST transition. Browser confirmed the Copy Day dialog and blocked no-source preview; no local business record was written.

Network interruptions and timeouts on mutations now explicitly report an unconfirmed outcome. Drag/resize reverts its temporary visual move and refreshes authoritative state when possible; other mutations preserve the open draft or preview and refresh the Calendar before further action. A recoverable 5xx is also treated as uncertain in Calendar feedback.

## Cycle 5 — repeated shifts

An existing concrete shift can now generate a weekly pattern for selected weekdays through a chosen end date, capped at 42 target shifts. The manager checks a structured all-or-nothing preview before generating. The backend rechecks active employee scope, availability, overlap, cross-store conflict, operating rules and published target periods under the same locks as other roster mutations. It verifies source and target period versions from preview, creates all destination periods and shifts inside one transaction, and preserves role, break, notes, assignments and local clock time through DST. Database integration covers a blocked mixed pattern with zero writes, stale preview and a successful Sydney pattern. The frontend component test confirms the unavailable employee is named and confirmation disabled. Browser QA opened an actual local shift, showed four unavailable target dates, and closed the preview without writing.

## Cycle 6 — employee-row movement

The current Calendar uses free FullCalendar TimeGrid with employee names inside events; it has no employee resources or row coordinates. FullCalendar's resource timeline with employee rows and drag between resources is part of [FullCalendar Premium](https://fullcalendar.io/docs/premium); [resource timeline](https://fullcalendar.io/docs/timeline-view) provides a horizontal time axis with employee rows. Its free trial is unsuitable for commercial production.

To preserve the existing TimeGrid, Molly now offers an additional week-only employee-row panel. Every chip represents one real shift assignment rather than a visually grouped Calendar event. Dragging to another employee on the same date uses the existing atomic shift edit; dragging to another date for the same employee uses the existing atomic reposition endpoint and preserves absolute duration. Diagonal employee+date movement asks for two validated steps. Multi-employee shifts cannot move dates from this panel because doing so would silently move coworkers; a same-day employee transfer updates only the dragged assignment. No local assignment is changed before the server confirms. The panel shows destination highlighting, active-employee search, incremental rows, published locks and keyboard opening of the edit dialog. Component tests cover drop dispatch and published drag lock.

Browser QA exercised a real local drag from one employee row to another unavailable employee. The server blocked it, the chip stayed with its original employee, the period summary remained unchanged, and the toast named the target employee, date, hours and availability reason. No business data was modified. A successful row drag in the real browser remains unverified because the available local employee was unavailable at the target time; backend mutation tests cover the underlying update/reposition paths.

## Cycle 7 — failure recovery and scale

The local Roster API was stopped briefly during a real employee-row drag. The Calendar retained the original chip and summary, reported an unconfirmed result, and remained usable; the API was restarted and health returned database=true and evaluateMolly=true. The save flow now queries the authoritative target day after an uncertain response and closes the unsaved draft only if all persisted shift fields and employee IDs match; otherwise it keeps the draft for correction or retry. A 5xx without structured validation also reports an unconfirmed outcome. Focused tests cover exact-match reconciliation, mismatched employee/note rejection, timeout and disconnect wording.

Synthetic frontend tests render the employee lane editor with 100, 300 and 500 employees plus 300 shifts. Each case limits the initial display to 60 employees and can find an employee near the end by search. These are functional bounds in the component test environment, not browser performance timings.

## Cycle 8 — two-tab concurrency and publication browser QA

An isolated QA period was created in an otherwise empty local week, with one temporary availability row and one marked shift. Both signed-in Molly tabs loaded the shift. Tab B changed its note and saved; Tab A then submitted an older version. Tab A received a 409-style stale message, kept its unsaved text, disabled further save, and did not overwrite Tab B. The same QA period was published, reopened, edited, and republished. Read-only database inspection before cleanup found two publication snapshots with distinct original and new notes, while the live shift held the new note. This demonstrates version history remained stable across reopen/edit/republish.

The QA fixture was then removed by exact marker in one transaction: its two QA publication rows, one QA period with its shift, and one QA availability row. Both browser tabs refreshed to an empty week. The first cleanup attempt correctly rolled back because the publication foreign key restricted period deletion; the corrected cleanup deleted QA publications first and verified zero marked records. No pre-existing Molly business data was deleted.

## Cycle 9 — store timezone mutation integrity and warning contract

Store settings writes now take the store-period advisory lock, use a version-conditional update, and reject a timezone change after any shift or availability exists, including a first settings save that would change the Sydney default. Availability replacement takes the same store lock before reading settings and validating store-local dates, so the setting cannot change between validation and persistence. The rejection uses `STORE_TIMEZONE_LOCKED`; a stale settings update uses `STALE_VERSION`. Availability changes that would uncover a saved shift now return `EMPLOYEE_UNAVAILABLE` with the affected employee and absolute shift timestamps, and the transaction retains the original availability.

Calendar break, daily-hours and weekly-hours advice now has structured `WARNING` codes and affected shift or employee metadata; the existing Chinese manager-facing wording and nonblocking behaviour are retained. This is calculated from the loaded period, so it is advisory rather than a server-side publication gate. Tests cover codes, severity, metadata, timezone lock, stale settings, and no-write availability rejection. Database integration tests use separate UTC and Sydney fixture stores so the DST copy test does not rely on changing a populated store's timezone.

## Final validation evidence gathered so far

Frontend: 103/103 tests passed, ESLint passed, TypeScript/Vite production build passed. Backend: 68/68 tests with database integrations passed, TypeScript check, Prisma generation and backend production build passed after the final service edit. Prisma migrations are up to date. Read-only DB audit after fixture cleanup: zero marked QA shifts, zero copy-day fixture periods, zero empty periods, zero overlapping employee assignments, zero published periods lacking a snapshot. Runtime health after backend restart: database=true and evaluateMolly=true. The local browser loaded Calendar and Staff after this cycle; Staff showed store-scoped employees and availability controls without a write. `git diff --check` passed; Git reported only Windows line-ending conversion notices.

## Active next work

The following limits remain explicit. A successful employee-row drag in the real browser is unverified because the available local target employee was unavailable at the test time; the real invalid drop and backend mutation path were verified. Diagonal employee/date row drops require two steps; time-axis movement remains in TimeGrid. The 100/300/500-person checks bound rendered rows but do not measure browser frame time. Warning advice is structured on the frontend; server persistence still enforces blocking rules and does not return an advisory warning set. An unknown transport outcome for batch copy or publish requires authoritative refresh; automatic exact-match reconciliation currently applies to single-shift save. Responsive behaviour of the new lane panel at narrow widths was not measured in the available browser viewport. Saved drag/resize/copy/publication behaviour in BHS remains unverified because testing it would mutate live BHS data; no BHS write was made.
