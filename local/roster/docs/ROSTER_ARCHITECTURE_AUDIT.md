# Roster architecture audit — initial current-tree pass, 2026-10-09

## 2026-10-21 formal Job matching boundary

The Calendar/Settings frontend matcher and backend formal-role matcher now use the same code-first association. Display-name equality cannot promote a historical Roster Shift Role to an Evaluate formal Job. The sole existing compatibility alias is Evaluate `full-role`/全岗 to Roster `all-rounder`/全岗. Explicit store-scoped role creation remains in Settings, with current Evaluate code/name validation and store authorization. Disposable Chrome/API/PostgreSQL verified a same-name old role remained historical while the new code-matched role became selectable, with published snapshots unchanged. This narrowing needs no migration. The alias itself should be confirmed against authoritative business mapping before any catalog-wide cleanup.

## 2026-10-17 published display grouping

`groupShiftsForCalendar` previously keyed only date/time/role ID/break. It could merge published Shifts whose immutable role-name/color snapshots differed and expose only the first Shift's label/color. The group key now also includes the resolved display name/color after the published-snapshot override. Distinct historical snapshots render as separate cards; identical current draft roles retain grouping. Unit red-green and disposable Month browser/database verification passed. No persistence schema or Evaluate boundary changed.

## 2026-10-17 formal-job reconciliation read path

Settings reads current formal jobs through the existing Evaluate adapter and DRAFT role usage through a store-authorized Roster read endpoint. The frontend compares role IDs selected by `verifiedShiftRoles` with the DRAFT usage inventory and shows only unmatched, used roles for manual review. The Roster endpoint does not define or change official jobs, employees, skills or scoring. An inventory failure is displayed separately so Settings edits remain available. This is a read-only aid to legacy schedule repair, not an automatic role mapping.

## 2026-10-17 read-only replay before current Evaluate checks

For a valid store-authorized `clientShiftId`, the create-with-period route first asks Roster whether the durable request ledger already owns this exact account/store/payload. A match returns the saved Shift read-only, even if Evaluate has since retired its formal job. An unseen ID proceeds through current Evaluate workforce/job validation and the original transaction. The service makes the same early replay check for direct calls and repeats it under the store lock to close the concurrent first-create race. Calendar Copy target snapshots now disable Save and identify the selected employee when a new overlap appears. No Evaluate ownership boundary changed.

## 2026-10-17 Calendar create identity and Roster ownership

Calendar generates a UUID for each new Shift draft payload and sends it to `/roster/shifts/with-period` as `clientShiftId`. Roster stores it as Shift ID and records the same ID, account, store and canonical payload hash in `shift_create_requests` atomically with the Shift and period version increment. Retries read this Roster ledger under the store lock. The ledger has no cascading Shift relation, so deletion cannot make an old create request valid again. An uncertain frontend result queries the exact Shift ID, then checks fields. No Evaluate schema or authority changed. The former preflight list-ID recovery described in older checkpoints is historical.

## 2026-10-16 Shift identity read for uncertain DELETE

Added `GET /roster/shifts/:shiftId?storeId=...` behind Evaluate session authentication and `requireStore`. `RosterService.getShift` reads by both ID and store, serializes the current Shift, and returns 404 only when that identity is absent. Calendar uses this read after a network-uncertain DELETE instead of consulting its old date range. A concurrently moved Shift therefore remains distinguishable from a deleted Shift. The editor marks the former stale and blocks Save/Delete until reopened from current Calendar data. This adds no employee authority, cross-database write or migration.

## 2026-10-16 store authorization trace

Evaluate `auth/me` supplies the authenticated role and store IDs to Roster. The Publish, Reopen, single Shift Delete and Batch Delete routes parse a target store ID and call `requireStore` before integration reads or Roster service mutations. Publication and deletion services also scope period/shift queries and conditional updates by store ID, with version and draft/published checks. A new cross-store route regression exercised all four endpoints and observed 403 before downstream calls; the full guarded PostgreSQL suite passed 136/136. This source and synthetic-session evidence does not establish target HTTPS authorization with a real evaluator.

## 2026-10-16 transaction and cross-system audit

Current-source review found Publish, Copy Period, Copy Day and Repeat execution inside Roster PostgreSQL transactions with store-period locks and version checks. The route reads current Evaluate workforce before the Roster transaction, so an employee change in that interval cannot be made atomically across the two independent databases. Real-PostgreSQL backend integration tests passed 135/135 on a disposable six-migration schema; normal `public` migration status is current. The remaining inter-system race and target real-account acceptance must stay visible in deployment readiness.

## 2026-10-16 formal position versus Shift Role skill filtering

The employee picker previously showed Evaluate formal positions but only filtered on Roster Shift Role required skills. It now builds a separate formal-position selector from current Evaluate position IDs, including an explicit unconfirmed group, and intersects that with the existing skill filter without treating skills as authorization. The selected Shift Role and canonical employee IDs remain unchanged. Fresh paired disposable Evaluate/Roster browser and direct database evidence confirmed a HandoverEmployee006-only QA Water formal assignment, a HandoverEmployee006-only filtered picker, one saved HandoverEmployee006 Shift and unchanged published history. Evaluate application/schema and Roster backend ownership were not changed.

## 2026-10-13 store and visible-range boundary

Before this fix, CalendarPage retained old shift/summary state while a new store loaded or failed. A local Chrome failure reproduction showed Browser Acceptance's two shifts under an Other Store title. The page now remounts store-owned content when account/store identity changes while retaining view/date in a small outer shell. It also displays loaded Calendar data and its summary only when the response matches the active store and full visible range. New Shift, pointer selection and Calendar editing wait for that scope to load; store and date navigation is locked during a save. The paired-schema browser check verified the old content disappeared immediately on a failed switch and a healthy round trip restored the source shifts at the same week. This is a frontend scope boundary; server authorization remains an independent required control.

## 2026-10-13 Calendar refresh consistency

The previous `load()` wrote visible shifts, workforce and settings before awaiting the active-period summary. A summary failure could leave those new values beside old summary and warning state. `loadCalendarSnapshot` now returns one assembled read result, or rejects without returning a partial result; CalendarPage commits its fields together after the current request-sequence check. It also checks supersession after the initial parallel requests and after the summary. A fresh 500-person Chrome saved-deletion pass verified the matching board and summary after save and reload; failure and supersession branches have four focused automated regressions. This is a read consistency improvement. It does not change server transactions or prove a reduction in the earlier 135 ms React commit.

## 2026-10-13 Calendar read-path follow-up

When the visible Calendar response already encloses the selected roster period, the frontend now reuses its shifts for period warnings and filters carryover shifts from another period. Day or other partial ranges still request the complete period. This removes one redundant full-period Calendar GET from the complete-range path without weakening the summary. A paired-schema Chrome trace verified one actual Calendar GET for a populated Week and two for a Day; the apparent duplicate same-URL events were CORS preflight plus GET. No claim is made about the 135 ms React refresh commit until a comparable before/after profile exists.

## 2026-10-13 board mutation render follow-up

The employee board's transient saving state now locks interaction at the board with `inert`/`aria-busy` and stable handlers whose latest parent callbacks are read from layout-effect refs. The 127-test frontend suite includes a regression for blocked saving-state pointer/click/key actions and fresh callbacks after saving. In one 600-card successful HandoverEmployee006-to-Cindy transfer, gesture commits were 3.1–10.9 ms and the authoritative refresh produced one 135.0 ms React commit. Guarded PostgreSQL reads confirmed the exact Shift ID's canonical assignment and period version after the browser environment interruption. A separately observed one-second `requestAnimationFrame` cadence occurred at idle as well as during dragging, so it cannot diagnose app frame pacing. No database migration or Evaluate application edit was made in this follow-up.

The working tree is `master` at `5d2c9f6` with extensive pre-existing tracked and untracked changes; `codex/roster-evaluate-integration` also exists. No checkout, merge or reset was performed. No Git remote is configured. The old normal 4020 `dist/server.js` process was identified and stopped after backup; the backend then passed a fresh production build and `scripts/start-dev.ps1` restarted 4020 from current `src/server.ts`. The 5176 Vite process serves current frontend source.

Calendar data path: FullCalendar/EmployeeLaneBoard → CalendarPage draft or gesture handler → rosterRepository → Roster routes → rosterService transaction → independent Roster PostgreSQL. Workforce reads go through Evaluate HTTP; Roster does not own an employee master or official scoring.

The time-grid click path had an actual defect: `dateClick` always changed to Day, so Day/Week empty clicks created no draft. Reproduced in Chrome and fixed in `CalendarPage.tsx`. Drag select was already working. Time-grid move/resize calls atomic reposition; employee row transfer calls versioned update. The frontend reloads authoritative data after successful writes and reverts time-grid previews on failure.

## Calendar data-processing performance

`scripts/benchmark-calendar.ts` generates five weekdays with two distinct shifts per employee per day and measures median grouping/layout CPU over five timed runs after one warm-up. At 50, 100 and 500 employees this produces 500, 1,000 and 5,000 ungrouped shift cards. Before the change, median grouping was 3.69/13.54/168.02 ms and layout 4.68/9.70/68.01 ms. Caching each group's parsed timestamps for the final ordering reduced grouping to 2.52/8.95/136.40 ms; layout remained 4.31/10.60/72.76 ms in the same environment. The 500-employee grouping median improved about 19%, with unchanged grouping order covered by 20 focused tests.

The employee board caps its initial rows at 60 and offers incremental loading. This benchmark measures JavaScript data processing only; it does not establish FullCalendar DOM render time, drag frame rate, browser memory, API latency or 500-employee picker responsiveness. Those require a real-browser fixture with a suitably large authorized workforce. The 5,000-card case still spends about 209 ms in grouping plus layout, so browser profiling should determine whether further optimization is needed.

The Week employee board now derives former-employee display rows from existing assignment snapshots when Evaluate no longer returns an active current-store employee. These are view models only; Evaluate remains the employee authority. Draft rows are surfaced for reassignment and cannot accept new drops; published-only rows are labeled historical and retain the snapshot name. A disposable Evaluate transfer plus browser pointer reallocation and direct Roster/publication database reads verified this path. This closes the earlier hidden-draft-row gap without changing the database schema.

A subsequent isolated Chrome scale run supplied that large workforce. FullCalendar rendered all 501/1,001/5,001 cards at 50/100/500 employees (each count includes one existing fixture event). At 500, the week view took 23.9 seconds to settle and CDP DOM queries timed out while rendering; 100 employees settled in about 3.1 seconds. The employee board's 60-row initial cap does not limit FullCalendar's 5,001 event nodes. The week event rendering path is therefore a demonstrated capacity bottleneck for a large store. The current timing combines network, React and FullCalendar work; further profiling is needed before attributing a precise share. A bounded employee/role view that preserves access to every shift is a candidate fix, followed by a repeat browser measurement and interaction regression.

Implemented a bounded employee window for the main FullCalendar views: Month 25, Week 100, Day 10. The employee list includes saved assignment snapshots for people absent from the current workforce response, so such shifts remain reachable. `shiftsForEmployees` keeps a shared shift whole when any assigned employee is in the window; the server roster, copy/publish workflow and saved data remain unfiltered. React commits the target view's window before FullCalendar changes layout. The second Chrome pass showed the 500-person week settling in 5.835 seconds with 1,000 cards and verified paging, searching and editing a late employee. It also verified 20 Day cards and 250 Month cards on their first windows. Further work should profile drag frames and large-store API latency and check the filtered presentation with actual schedulers.

Screenshot review exposed a second bottleneck: 501 Week cards at 50 employees loaded but collapsed into narrow, unclickable lines when many shifts overlapped. The current implementation uses a cheap sweep of shift start/end instants to detect more than four simultaneous cards. In that case, Week and Day time grids present one employee and Week defaults to the existing employee-row board for overview and cross-row operations. A row-name button selects an exact canonical employee ID and scrolls to the focused time grid. This keeps normal FullCalendar pointer move/resize/create in the detailed view and makes the broad roster readable. The same 500-person fixture settled in 1.737 seconds with 60 board rows and 10 time-grid cards; browser click/drag create carried employee 0499 into the form. `ShiftDialog` raises selected employees to the first picker page, so a late employee remains visible. Screenshot evidence is in `docs/evidence/`. This is a presentation change only; the backend still validates writes over the complete roster.

The disposable paired-schema browser pass subsequently verified create, move, both resizes, employee transfer, invalid rollback, copy flows, publication history and stale two-tab rejection, with direct database reads. Remaining audit work: target HTTPS, real authorized evaluator acceptance against normal 4020, 50/100/500 employee frame-time measurement, and unobserved BHS saved mutation behaviour.

## Copy Week capacity — 2026-10-10

A guarded 500-employee/5,000-shift PostgreSQL fixture exposed a 37.7-second successful copy preview and a `P2028` timeout in the first full copy attempt. The service now bulk reads target Availability and existing assignments, checks each copied interval in memory, caches repeated wall-clock conversions by source date/start/end and target offset, and writes validated shifts plus assignments in 500-row batches inside one transaction. Single local runs measured 266 ms for full preview and 1,761 ms for the complete copy after the change. The source publication stayed immutable and the first timeout left no partial target period. These timings cover the Roster service and local database only; full-stack 5,000-shift browser copy and target infrastructure remain unmeasured.

## Copy Day and Repeat capacity — 2026-10-10

Copy Day shared the Copy Week scale issue: its per-assignment Availability/conflict queries made a 1,000-shift preview take one 4,879 ms local run, and the first transaction timed out with `P2028`. `inspectDayCopy` now bulk reads and groups the target employee windows/conflicts, and caches repeated wall-clock conversions. Copy Day writes validated shifts and assignment snapshots in 500-row batches within one bounded transaction. One local 1,000-shift preview took 99 ms and execution took 753 ms. A 42-target Repeat Shift preview/save took 496/705 ms on the same fixture, so its existing atomic write path was retained. These are individual service/database samples, with a separate small browser Copy Day save and reload check.

## Employee-row drag rendering — 2026-10-10

An isolated valid 500-employee/5,000-shift week renders 60 employee rows and 600 shift cards in its initial board window. Before this pass, every hover-target change rebuilt all visible rows and formatted every displayed shift with store-local time conversion; temporary React Profiler samples during one invalid cross-row gesture included 147–163 ms commits. The board now memoizes each row, passes only that row's active target/source state, stabilizes pointer handlers, and caches formatted times for shifts belonging to visible employees. One repeat gesture produced 4.8–6.9 ms active-state commits. Post-drop data refresh still produced 70–110 ms commits. Full frame-rate acceptance remains open because a short frame probe supplied only five intervals and a longer browser-control gesture timed out. Temporary measurement code was removed.

Follow-up source tracing found the 70–110 ms invalid-drop commits were transient `saving` and changing parent callback identities, not a database reload. The board now stores current callbacks in layout-effect refs, passes stable callbacks to memoized rows, and locks the board with `inert`/`aria-busy` during saving. On a fresh equivalent 600-card browser fixture, one rejected gesture produced 3.8–7.2 ms commits across hover and completion. This does not measure a successful save's subsequent data reload or sustained animation FPS.


## 2026-10-14 employee-board refresh cost

The 500-person Week board's authoritative post-save refresh re-rendered unchanged employee rows and formatted repeated shift times independently. `EmployeeLaneBoard` now compares complete row display/shift/editability signatures and retains unchanged rows; employee selection resolves the latest workforce object. A per-render interval map shares store-time formatting for identical date/start/end triples and is rebuilt when shifts or timezone change. Focused tests cover stale-object and changed-row risks. One local saved-deletion sample changed from board/page 143.0/213.4 ms before optimization to 22.3/91.5 ms after both steps, with 49.5/102.0 ms between them. Browser cross-row save, reload and direct database verification passed. These samples do not establish sustained FPS.

## 2026-10-14 failed-read mutation boundary

A same-store Calendar refresh failure previously retained the prior Calendar response and summary after showing an error. Because controls consulted the retained data, New Shift and Copy Day stayed enabled despite an unconfirmed snapshot. Browser reproduction used an isolated stopped Roster API. The latest-request failure path now clears Calendar/summary/period shifts and stale batch/copy choices; `beginMutation` requires loaded data and no active read. The Week board and summary are inert during refresh, while an open ShiftDialog retains input but disables writes until the snapshot recovers. Chrome verified the unavailable and Retry states. This is a frontend read/write gate; backend authorization and concurrency validation still apply independently.

## 2026-10-14 workforce-read and export audit

Roster had a one-page gap in its Evaluate 1.4 workforceRevision final check. That check now runs after every complete 1.4 paged list, before create/update/copy/publish call sites use the workforce. Unit and paired local Evaluate HTTP evidence cover changed and stable revisions respectively. The separate databases still have a race after the final read.

CSV/print export formatting was fixed to use the Roster store timezone instead of hardcoded Sydney. Route tests cover Adelaide's half-hour offset and an overnight end-date marker. Published snapshots remain immutable, while legacy publications without a timezone field use the current store settings; the current settings lock prevents timezone changes after roster data exists. No schema migration or Evaluate application code change.

## 2026-10-14 publication timezone ownership

Published revision JSON now includes the store timezone captured under Roster's store-period lock. `exportPublication` returns that frozen timezone; CSV and print prefer it to current settings. The field is optional in normalization so pre-existing snapshots remain readable and use the current store timezone fallback. The source data needed to infer the original timezone of a legacy snapshot may no longer exist. The isolated PostgreSQL history test changed fixture settings between two publications and confirmed both revisions remained stable. This changed no schema or Evaluate ownership boundary.

ExportPage now formats historical detail shift instants with the snapshot timezone, falling back to current Roster settings for older snapshots. It remounts store-specific state on account/store change, preventing previous periods and publication selection from surviving. Direct CSV/print links derive from the configured API base. The isolated browser confirmed frozen clocks in detail/print and store-switch clearing. No Evaluate application or schema change.

Export period lookup now uses explicit annual ranges and year navigation, so old published periods remain reachable without an unbounded all-history query. A year change remounts the scoped page; a period change synchronously clears its publication/detail state. Publication responses are tagged with their period ID, and detail responses are guarded against a subsequent selection. The browser confirmed a disposable 2025 revision and no cross-year or cross-period stale export link. Backend API and ownership boundaries did not change.

Copy Shift date edits now retain local form state and trigger a new scoped target-date Availability read. The dialog accepts Availability only when its store/date match the current draft, ignores superseded requests and blocks Save while the target read is pending or failed. ShiftDialog derives target wall-clock instants and exposes nonexistent DST times as an inline blocking error. Backend Create/Availability validation remains the final authority. The browser verified an available employee swap and an API-outage guard; no database schema or Evaluate ownership boundary changed.

## 2026-10-15 Employee-row diagonal operation

`EmployeeLaneBoard` now permits a single-employee card to target a different employee and date in one gesture. `CalendarPage` preserves elapsed duration when converting the original store-local start clock to the target date; `rosterRepository` sends the paired employee IDs on the existing reposition endpoint. The route uses the current Evaluate workforce snapshot, and `RosterService.repositionShift` applies date/period/assignment changes in one PostgreSQL transaction with version, Availability and overlap guards. Same-day multi-assignment row transfers retain their existing update path; multi-assignment date moves remain explicitly blocked. This is an interaction and API extension, not a visual redesign or database ownership change.

## 2026-10-15 Week employee-row create

An active employee's editable Week date cell now provides direct click creation plus a focusable '+' button for keyboard and touch use. CalendarPage passes the canonical Evaluate employee ID and store-local date into its existing ShiftDialog, using Roster store openingTime and minimum duration defaults. The board blocks published dates and historical-only rows; it keeps chip editing separate and suppresses the click following a drag. Normal Roster create validation and ownership boundaries are unchanged. Isolated Chromium and PostgreSQL verified one saved create and one canceled blank-cell draft. No migration or Evaluate application edit.
## 2026-10-15 Month click routing

FullCalendar's Month event overlay receives some blank-cell clicks without invoking `dateClick`. `CalendarPage` now interprets Month clicks at the enclosing Calendar surface in capture phase, using the clicked cell's `data-date`. It leaves event and overflow clicks to FullCalendar, routes the date number to Day, and sends the remaining blank cell to the existing ShiftDialog draft path. The clicked date's period status controls the published lock. Week/Day time-grid `dateClick` and the Week employee board remain separate. No additional API or database owner was introduced.

Week employee-row invalid-drop feedback and release now share one local target assessment. This removes the previous disagreement where a target was visibly red for a known overlap but pointer release still sent an update request. The assessment only blocks states derivable from the loaded board; current employee, Availability, cross-store, publication, overlap and version checks remain authoritative in Roster/Evaluate-backed server paths.
2026-10-15 Staff state scope: Availability drafts now carry a loaded store/employee/from/to identity. Switching any of those fields immediately hides the prior draft and disables Availability mutations until the matching read succeeds. A failed read keeps the scope unavailable and exposes Retry. Successful Save responses re-check the live selection before replacing Staff state, preventing an earlier employee's late response from overwriting a later employee's draft. The overnight operating-hours preset now uses the current store settings. Component tests and isolated Chromium fault/delayed-response runs proved the previously unsafe paths and the correction.

## 2026-10-15 prior-day Availability audit
Calendar's complete snapshot and the Shift dialog now request the preceding local date's Availability as well as the visible/current date and next date. Roster remains the scheduling owner; Evaluate remains the employee authority. No integration contract or schema change. The widened read is necessary because an Availability interval is keyed by its local start date and can cover a separate Shift beginning just after midnight on the following date.
## 2026-10-15 Shift ownership constraint

Roster now binds each Shift to a period in the same Roster store using a validated composite foreign key. Publish and Copy Week also reject legacy source Shifts with a store or date outside their period; Copy Week preview reports the defect. This enforces the Roster scheduling boundary without adding an Employee authority or modifying Evaluate. Local public schema was backed up and migrated after a zero-mismatch read-only audit; the target deployment remains separately unverified.

## 2026-10-15 FORTNIGHT architecture

Roster owns the cycle definition and store-configured `fortnightAnchorDate`; Evaluate remains the source of employee identity, eligibility and score. The anchor is a store-local date string whose weekday must match `weekStartsOn`. The first day of each 14-day period is `anchor + 14*n` calendar days, including dates before the anchor. All writers creating periods use the same UTC date-only calculation. Existing WEEK/FORTNIGHT period records and immutable publication snapshots retain their stored shape when Settings change. The week-sized employee-lane display still shows one week at a time within a 14-day period; Month and Calendar APIs span both weeks. Direct BHS comparison remains unverified.

The Week employee board now derives same-week overnight continuation chips from the existing Shift interval and store timezone. These are view-only references to the original Shift ID; they do not create assignments or change publication snapshots. The prior-week continuation path remains intact. Browser and guarded PostgreSQL acceptance for a normal 22:00–02:00 Shift is recorded in ROSTER_BROWSER_QA.md.

For Week-scale data, the continuation index computes the named-zone midnight boundary once per visible date and compares each Shift end with that instant. It does not instantiate a Luxon conversion per Shift. Adelaide spring-DST, Sydney exact-midnight and browser regressions cover the semantics; sustained frame rate on store devices is still unmeasured.

## 2026-10-15 Calendar navigation context

Calendar's selected Store, view and current date are encoded as validated replace-only URL query parameters. Roster data remains in authenticated API responses, not URL state. The initial requested store is applied once after the authorized Evaluate store list loads; subsequent store changes come from current user selection. The StoreCalendarPage key still isolates loaded roster data by account and store. Invalid or unauthorized store IDs are ignored and the selected authorized store rewrites the URL. No Evaluate API or database ownership changed.

## 2026-10-15 Calendar Availability request boundary

The Calendar snapshot previously awaited a store/date-range Availability GET that no Calendar component consumed; ShiftDialog already makes a separate guarded request for its draft date and adjacent dates. Removing the unused snapshot dependency prevents an Availability service failure from blanking Month/Week/Day without weakening the ShiftDialog save gate or backend write validation. A red unit test, current-source Chromium 503 injection, retry and guarded PostgreSQL no-write check verified the path. This is fault isolation and request reduction; an Availability overlay on Calendar remains a separate product requirement.

## 2026-10-15 independent Week Availability projection

`EmployeeLaneBoard` now owns a separately retriable Availability read keyed to store, week and loaded Shift array. `calendarAvailabilityByCell` projects each recorded interval into store-local day cells using named timezone midnight, including DST and overnight windows, and indexes badges by canonical employee ID/date. It does not introduce employee authority or change the Calendar core snapshot dependency repaired earlier. Initial rows remain capped at 60. Browser 503/retry and direct PostgreSQL checks passed; a 500-person overlay frame-rate measurement after this change remains to be performed on a valid large workforce fixture.

## 2026-10-15 500-person Availability overlay measurement

The new Week badge projection was measured on a valid paired disposable Evaluate/Roster fixture: 500 canonical employees, 5,000 Shifts and 2,500 Availability rows. Current-source headless Chromium rendered 60 initial employee rows and 300 badges; one timed load was 2,178 ms and a high-index employee search was 59 ms. Three authenticated requests each produced 511 ms Calendar and 96 ms Availability median latency. A canceled active row drag recorded 364 rAF intervals with p95 16.7 ms, maximum 16.8 ms and zero above 33.3 ms. This is a short local headless sample, not a physical-device or sustained-use claim. Direct PostgreSQL found unchanged versions/counts; the paired schemas were removed. The prior note that the overlay frame-rate probe was pending is now resolved locally; target infrastructure remains unmeasured.

## 2026-10-15 Staff Availability occurrence model

`src/lib/availability.ts` now carries a first/second occurrence index alongside each draft wall clock. `buildAvailabilityDrafts` derives the index from canonical saved UTC timestamps; `availabilityEntries` reconstructs those exact instants through the store timezone candidates. The backend still owns persisted UTC intervals and transactional write validation. Reusable Availability templates remain wall-clock based, so Staff blocks saving a second-occurrence draft as a template rather than silently losing its offset choice. Roster does not change Evaluate employee authority.

## 2026-10-15 Availability write snapshot

The Staff Availability editor holds the rows returned by its employee/date-scoped read. Save submits their IDs and versions as `expectedRows`; the backend compares them inside the locked PostgreSQL replacement transaction. A 409 keeps the Staff draft visible and requires an explicit reload before further saves. This closes the local two-editor lost-update path without adding a second employee authority or modifying Evaluate. The separate Evaluate read before the Roster transaction remains subject to the documented cross-database race.

## 2026-10-15 Settings store-scope boundary

`SettingsPage` previously held one unscoped settings object while a selected store could change. A late read or save response could repopulate the wrong store's form, and Save could target the new store ID with the old store's values. It now keys response acceptance to the active store and request sequence, records which store actually loaded the form, resets old fields on switch, and blocks writes until the selected store has loaded. The same guard covers Shift Role writes. This prevents the observed frontend cross-store write path; backend authorization remains the final gate.

## 2026-10-15 Templates store-scope boundary

`TemplatesPage` previously loaded lists with an effect cleanup guard but left the previous store's edit form and lists active while the next store loaded; mutation methods used the newly selected store ID. The page now gates all template writes on the loaded store, verifies a selected template's store ID, resets drafts/lists on store switch, and ignores late read/mutation results using the active store and load revision. Backend store authorization and template ownership validation remain the final gates.

## 2026-10-15 Copy Shift target snapshot

A copy draft can point outside the source Calendar viewport. The dialog formerly used source-view Shifts for client conflict feedback, while it refreshed only workforce and Availability for the target. `loadDialogContext` now optionally fetches the target date's versioned Calendar, ties all responses to the dialog request sequence, and feeds target Shifts to `ShiftDialog`. Save stays disabled until the target read is available and for a published target period. This improves preflight feedback; server-side create and publication validation still decide the write atomically.

## 2026-10-15 DST TimeGrid resize source of truth

FullCalendar's named-zone Day grid displayed a one-hour first-to-second Sydney 02:30 Shift but exposed `oldEvent.end` as undefined during bottom resize. Its `endDelta` was 30 minutes while its reconstructed `event.end` advanced 90 minutes. `calendarResizeInstants` now applies same-day resize deltas to the persisted Shift UTC timestamps; Calendar keeps its current date-aware event result for deltas containing calendar days/months/years. This stays within the existing atomic/versioned backend reposition path and does not alter the Roster/Evaluate ownership contract. Browser and direct PostgreSQL verified both edges, whole-card move and rejected Availability rollback.

## 2026-10-17 Week employee-row historical identity

Current Evaluate employee names remain authoritative for active row headings and draft workflows. Published Shift cards now announce their frozen assignment name; if the current name differs, the card also displays `发布时：<snapshot name>`. This preserves the historical identity in the weekly board while keeping the active employee row usable. Paired disposable browser and database checks confirmed the behavior after an Evaluate rename and browser reload without publication mutation. No database migration or Evaluate API change.
