# Calendar interaction contract

**Saved-card double-click:** On Day and Week, the first press opens the same Edit/detail path as a single click. The second press of that double-click can hit the newly mounted dialog backdrop; it must not immediately dismiss the dialog. A later separate backdrop click retains the ordinary close behavior. Current-source Chromium and a focused dialog regression verified this without a Shift write. BHS's own saved-card double-click result remains unobserved; this prevents conflict with Molly's required single-click Edit action.

**Week date-column boundary:** Blank-grid dragging in Week selects time only within the pointer's starting date column. Even an adjacent-column gesture whose UTC endpoints are less than 24 hours apart must cancel; it must not silently create an overnight draft. Use Add/Edit with the explicit `次日结束` control for an overnight Shift. The live selection gate and final commit gate both check pointer columns. An isolated Chromium red/green case reproduced Thursday 11:00→Friday 10:30 incorrectly opening Add before the fix, then confirmed zero dialog/write after the fix while same-column selection and overnight form remained usable. BHS's adjacent-column rule is not verified.

**Blank-grid outside release:** Releasing a Day/Week blank-grid drag outside the calendar must cancel it without opening Add. Current-source isolated Chromium verified outside release in both views, alongside 1/3/5 px blank-grid click jitter and saved-card clicks, with zero writes and unchanged draft/published Calendar data. This is Molly behavior evidence; BHS outside release has not been observed.

**Day overnight Worklog time:** A same-day entry displays its start and end store-local clocks. When the end falls on another store-local date, Worklog includes that end date (and year when it changes), for example `22:00–11月1日 02:00`. This uses the store IANA timezone, including Adelaide half-hour offsets. It changes display only; duration, `Shift.date` attribution and persisted UTC instants are unchanged. BHS overnight Worklog formatting has not been observed.

**Day keyboard path:** A saved card participates in tab navigation and Enter opens its detail or grouped chooser; Escape closes that dialog. The footer `排班操作 → 新增班次` is a keyboard and form alternative to blank-grid drag creation. During a pending Calendar refresh, keyboard activation of an old card follows the same busy guard as a mouse click.

**Busy Day cards:** While the Calendar is loading or saving, visible saved-card clicks and overnight continuation buttons do not open an editor from the prior snapshot. After the read completes, the current card can open normally. Blank-grid creation already follows the same loading/saving guard.

**Day employee-window count:** The optional staff pager shows page-visible Shifts and all view-visible Shifts separately. A Shift counts when its actual UTC interval overlaps the selected store-local date range; exact-midnight endings do not count on the next day. This avoids reporting roster-period-loaded Shifts from other dates as cards visible in Day. Search and paging do not mutate roster data.

**Overnight date cue:** The optional Scheduled Shift mini-calendar marks each store-local date overlapped by a Shift interval, including next-day continuation, but excludes a date reached only at the exact end midnight. The side panel's existing net-hour total remains attributed to `Shift.date`; a continuation-only selection explains that rule and points users to Day for the visible segment. This does not establish BHS payroll or break-allocation semantics.

**Secondary Copy Day:** Opening its footer dialog or changing a source/target date starts a debounced, read-only conflict preview. An old response must not replace the currently visible dates. Copy stays disabled until the matching preview succeeds and permits it; a failed preview shows an error and allows manual recheck. Commit still uses the preview's source/target period versions, and Cancel does not mutate Roster.

**2026-10-21 Day Add role selection:** A new blank-grid click or drag opens a form with no Shift Role selected, matching the observed BHS Add default. Save requires an explicit current Evaluate-verified role. Editing or copying an existing Shift retains its source role, and selecting a role-bearing template may fill one. A synthetic STORE_EVALUATOR browser confirmed zero Shift writes before Job selection and exactly one after selection; see [Browser QA](ROSTER_BROWSER_QA.md).

## 2026-10-21 Day Scheduled Shift historical-name search

The Day work-hours sidebar may show a frozen employee name for a published Shift. Its employee-name search accepts both that published snapshot name and the employee's current Evaluate display name, while leaving the historical card, Worklog and publication JSON unchanged. Fresh disposable Chromium reproduced the prior zero-result current-name search, then verified both names before/after reload after the fix; direct PostgreSQL confirmed frozen assignment/publication names and version unchanged with zero Roster mutation requests. BHS behavior after a name change remains unverified.

## 2026-10-20 Day sparse-schedule display

Day paging is based on distinct employees with visible Shifts, rather than every employee in the store. When the scheduled count fits the readable page, Day shows every Shift without the unused search/paging panel; this restores 136 CSS pixels of vertical room in the measured Hurstville page with one Shift and 25 workforce members. A dense Day or active search/focus still shows paging controls. Week/Month retain their prior paging rules. This preserves a clean Day interaction surface while keeping the employee picker inside Add/Edit.

## 2026-10-20 directional Day/Week selection

On ordinary store dates, downward drag includes the destination slot, while upward drag uses the initial slot's **start** as the exclusive end. A blank Day 10:30→09:00 drag therefore previews, highlights, prepopulates and saves **09:00–10:30**. The held BHS Day mirror and cancelled Add showed the same directional rule for 09:30→08:00 as **08:00–09:30**. Molly's Day downward 14:00→15:00 remained **14:00–15:30**; Week upward 12:00→11:00 became **11:00–12:00**. On store clock-change dates the existing wall-clock slot mapping is retained because BHS DST semantics are unobserved. Browser/PostgreSQL evidence and fixture isolation are in `docs/ROSTER_BROWSER_QA.md`. Earlier upward-gap text below is superseded.

## 2026-10-20 Day-first control hierarchy

Day is the primary operating view. **Current 2026-10-21 layout supersedes this older top-row description:** the top controls are store when needed, previous/today/next and Month/Week/Day. Add Shift, refresh, employee rows, draft staging, batch actions and all Copy actions are in the footer `排班操作` menu; the adjacent footer button opens the work-hours sidebar. The period summary keeps Publish/Reopen. Copy's preview/validation and explicit commit remain. Current-source Chrome verified no top Copy button, Month/Week blank Add with explicit Job choice, and Day template save/reload. Clicking a saved Shift remains Edit only; blank time-grid drag creates an unsaved time selection. The observed ordinary-day BHS upward selection endpoint matches Molly's mirror, highlight and form as described above.

## 2026-10-20 live BHS gesture evidence and Molly boundary

In the authenticated BHS Day grid, click 08:00 gave an unsaved 08:00–08:30 Add form; downward 08:00→09:30-slot drag gave 08:00–10:00; upward 09:30-slot→08:00 gave 08:00–09:30. The same downward Week gesture targeted the correct Wednesday and 08:00–10:00. All reference forms were cancelled. Molly's 30-minute click and blank-grid drag semantics are aligned at the level of click, date and downward selection, but exact upward endpoint behavior should be checked before claiming 1:1 parity. BHS saved-card drag was not attempted because it could mutate a real shift; Molly's saved-card click-only behavior is the user's explicit rule.

2026-10-17 browser evidence: both Day and Week blank-grid 14:00–15:30 drags left `window.getSelection().toString()` empty during pointer hold and after release. Each opened one unsaved Add draft; Cancel sent zero Roster mutations. This is Molly behavior evidence on disposable data, not a current BHS snap claim.

The same browser gate captures the live mirror text before pointer release and requires `14:00 - 15:30` to equal the subsequent Add form's start/end clocks in both views. This protects preview-to-commit time agreement on ordinary dates; DST transition dates have separate evidence and limitations.

## Formal position feedback in the Shift editor (2026-10-17)

Verified scheduling roles carry the exact matched Evaluate job ID only in frontend state. For each employee candidate, the editor compares that ID to Evaluate `positions[].id` and shows whether the selected Shift job is formally confirmed. A skill match does not establish a formal position. The cue is advisory and does not silently grant or revoke job authorization; Availability and conflict gates remain separate. A disposable browser checked both a confirmed and an unconfirmed employee with no Roster write.

## Concurrent saved-card Edit — 2026-10-17

Saved cards open a versioned Edit form. If another authorized evaluator saves that Shift first, a stale Save returns 409: the open form retains the local unsaved inputs for review, shows a clear conflict, disables another Save on the obsolete version and reloads Calendar. Closing and reopening shows the other evaluator's committed fields. Disposable two-context Chromium/PostgreSQL confirmed 200/409, one version increment and no employee, UTC or published-history corruption. Older drag/Resize concurrency QA describes an interaction superseded by the current click-only card requirement.

## Fall-back card and pointer evidence — 2026-10-17

A first-02:30 to second-02:30 one-hour Shift renders from the visible 02:30 lane over two half-hour rows in both Day and Week. Clicking its Week card opens Edit with both occurrence ordinals preserved. Dragging blank 02:00–03:30 on a fall-back day, including upward in Week, prepopulates those wall clocks and states the 2 h 30 m actual elapsed interval across UTC+11 to UTC+10. Canceled drafts do not write. The grid offers one 02:xx row; use the form to select the second occurrence deliberately. This is Molly browser evidence, not a claim about unobserved BHS DST behavior.

## Clock-change day visible slot mapping — 2026-10-17

On a store-local daylight-saving transition date, blank Day/Week grid clicks and drags use the visible slot label and date column under the pointer instead of FullCalendar's inferred instant. A spring-forward slot whose local clock does not exist is rejected with a clear error. A valid slot opens Add with matching wall time; drag endpoints use the first and last selected labels. A click uses actual elapsed duration and preserves the established fall-back first-02:30 to second-02:30 one-hour workflow. The fall-back grid has one 02:xx row; select the second occurrence in the Shift form when needed. Saved cards remain click-only. Disposable Chromium verified spring valid/invalid clicks and drag, persisted 05:00–06:00 UTC, fall repeated-hour save/reload, normal-day click and saved-card no-drag. BHS DST behavior is not directly evidenced.

## Clock-change day pointer safety — 2026-10-17 (superseded)

On an Australian store-local daylight-saving transition date, Day/Week time-grid clicks and drag selections are refused with an explanation and a route to the Add form. The form remains the time-entry path and validates nonexistent/repeated local clocks. This guard is needed because the current FullCalendar grid shows a nonexistent Sydney 02:30 slot on 2026-10-04 and mapped its click to a 01:30–03:00 draft. Saved cards remain click-to-edit. A future grid implementation should restore pointer creation on such dates only after visible labels and selected instants agree, including both occurrences of repeated clocks.

## Full-day clock axis — 2026-10-17

Day and Week show 00:00–24:00 for every store, matching the dated 7 October read-only BHS grid observation. The header states the selected store's actual operating hours. A visible time slot outside those hours is still rejected for creation by the existing operating-hour check; server Availability, conflict, qualification and publication rules are unchanged. Month has no time axis. Saved cards remain click-to-edit and cannot be moved/resized by pointer; only blank time-grid drag selects an unsaved interval. Disposable Chromium confirmed both clock endpoints, outside-hour rejection, inside-hour prefill, cancellation, saved-card click-only behavior and zero canceled writes. Current BHS behaviour could not be recaptured.

## Saved cards and blank-grid selection (verified 2026-10-17)

Saved Month/Week/Day and employee-row cards are click-to-view/edit; pointer movement on a saved card cannot move, resize or reassign it. The employee-row board has no drag-enable prop or pointer move callback. A blank Day/Week time-grid drag selects the snapped time range and opens an unsaved Add dialog. A blank employee-date cell or `+` opens Add with that date and canonical employee prefilled; cancel writes nothing. Fresh disposable Chromium/PostgreSQL verified saved Day/employee-row cards produced zero Shift mutations, blank Day/Week selections prefilled 14:00–15:30, and an employee-row `+` preselected Cindy. Time or employee changes to an existing Shift use the versioned Edit form.

## Concurrent target conflict and exact replay (verified 2026-10-17)

When a Copy Shift target Calendar refresh reveals overlap for a selected employee, the dialog identifies that employee near Save and disables Save. Time or employee correction removes the local block; the backend remains authoritative. A retry of an already committed, store-authorized request ID returns its saved Shift read-only before current Evaluate/role validation, even if the formal job was retired after the original create. A new ID still requires fresh Evaluate checks and transactional validation. Copy Day/Week retain their existing all-or-nothing, versioned preview/commit flow; uncertain responses close stale previews and navigate to the target for inspection.

## New-Shift request identity (verified 2026-10-17)

For Calendar Add and Copy Shift, the first Save assigns a UUID to the current form payload. An uncertain retry with unchanged fields uses the same UUID; changed fields or a new dialog get a fresh UUID. The create-with-period transaction stores that UUID as the Shift ID and in a durable request ledger. Response reconciliation reads the exact store-scoped Shift ID and verifies fields; another administrator's identical Shift cannot satisfy it. Same-ID replay is read-only and does not increment the period. A deleted Shift leaves the ledger and blocks recreation from a delayed request. Existing Shift Edit continues version-based optimistic concurrency. Historical preflight-ID selection below is superseded.

## Uncertain Shift Save recovery (prior preflight design, superseded)

Before a new-Shift POST, Calendar reads the authoritative target range and remembers existing Shift IDs. If the write result is uncertain, a field match on an older ID cannot close the draft. Edit recovery requires the saved version to exceed the editor's original version. A failed preflight sends no write and retains the draft. Failed uncertain Copy refreshes target conflict/Availability context before a retry. A genuine committed response with malformed JSON still reconciles from a new authoritative Shift. This narrows false attribution; a concurrent identical insert after preflight still requires a durable operation identifier to distinguish actors conclusively.

## Copy save feedback (verified 2026-10-17)

After a copied Shift is confirmed saved, Calendar navigates to the target date, loads its range and shows the new DRAFT card. This applies to a normal response and an uncertain response resolved by an authoritative Calendar read. Cancel sends no Shift write. A copied PUBLISHED source retains its Shift and publication snapshot. Saved cards use click-to-view/edit; pointer drag on a saved card does not move or resize it.

## Copy Shift from a PUBLISHED source (2026-10-17)

The read-only PUBLISHED Shift detail can start Copy. This opens a new unsaved Shift form and does not modify the source or its publication. The initial target is the same weekday in the following week; a DRAFT source Copy starts on the next day. The manager may change date, employee, role, break and notes. The target Calendar and Availability are loaded before Save, and the backend validates current Evaluate employee/role data, store scope, Availability, conflicts and target publication state. Cancel creates nothing. The target is always a new DRAFT Shift with a new ID.

## Batch selection and publication (2026-10-17)

Batch mode selects only Shifts in the current DRAFT period. Clicking a PUBLISHED card leaves the count unchanged and explains that its period must be reopened before editing. A grouped DRAFT card selects or clears all of its underlying eligible Shift IDs. A Calendar reload removes IDs outside the current editable snapshot and cancels an old Delete confirmation. Before Batch Update/Delete, the client checks every selected ID against the current loaded DRAFT snapshot; the server repeats publication, version and role validation inside its transaction.

## Role warning by publication state (2026-10-17)

Show `待核对` only for a DRAFT Shift whose saved role cannot be matched to the current Evaluate formal jobs. A PUBLISHED Shift keeps its saved role label without a live-qualification warning, including after that job is retired. Published details remain read-only. This does not make an old role eligible for a new or revised draft.

## Role display by publication state (2026-10-17)

DRAFT Shift cards may show the current Evaluate formal job name without rewriting the Shift row. PUBLISHED cards, Month summaries and employee-row chips show the saved role name/color snapshots, so a later formal job rename does not silently change the displayed historical roster. The published read-only detail uses the same saved role name. Immutable publication revisions remain the authoritative historical exports.

## Published-card click (2026-10-16)

A PUBLISHED Shift card in Month, Week or Day opens a read-only detail instead of entering Edit. It displays the stored employee names, role, local time, break and public/internal notes, with no mutation buttons. Grouped published cards first select the real Shift record. To change a published Shift, the manager must reopen its period; the server still enforces publication state on writes. Historical publication revisions remain separate immutable snapshots in the publication/export workflow.

## Current pointer contract (2026-10-16)

An existing Shift card is click-to-edit. Pointer movement of at least six pixels that starts on a card is not a click; release opens no dialog and sends no Shift mutation. Existing cards cannot be pointer-moved or resized in the active Calendar, including the optional employee board. Dragging blank Day/Week time slots selects a snapped start/end range and opens one unsaved Add dialog; cancel writes nothing. Time changes and reassignment use the versioned Shift editor. Earlier Move/Resize passages below describe prior implementation and tests, not an enabled pointer gesture. BHS saved-card click-to-edit was observed read only on Day; BHS saved-card drag behavior remains unverified. The user's explicit click-only rule controls this contract.

For a DRAFT period, the summary checks loaded current formal roles and active same-store employees against every saved Shift before enabling Publish. A legacy or unverified role, missing assignment, or departed/cross-store employee is listed with its Shift date as a blocking item. This is visible preflight only; the publish API still revalidates the latest Evaluate and Roster data inside its transaction. A 2026-10-06 Hurstville Day draft using historical `验收岗` demonstrates the disabled button and repair instruction without changing the saved Shift.

After an uncertain Publish or Reopen response, query the same store-scoped period ID. If its version is newer than the submitted version and its status equals the intended state, display that observed current state and refresh Calendar. This read does not prove which administrator caused the transition. If the read fails or state does not match, keep the outcome uncertain and refresh without claiming success.

For an uncertain Shift DELETE response, reconcile by store-scoped Shift ID. A 200 means the Shift still exists, possibly on another date: keep the editor open in stale state, block another Save/Delete and tell the user its current date. A confirmed 404 means it is absent: close the editor and refresh. A failed lookup leaves the outcome unknown and retains the editor. An old-date Calendar read is insufficient because another administrator may have moved the same Shift.

Repeat Shift holds its weekday/end-date selection after a failed Generate request but discards the old preview and disables Generate until a new conflict check. Publish revalidates current Evaluate employees; a departed employee blocks the entire publication and the period stays DRAFT. Historical publication snapshots are unchanged.

A Copy Day or Copy Week preview is valid only until its commit result. Any failed commit invalidates that preview. Copy Day retains the selected dates and offers a fresh conflict check; Copy Week closes the obsolete preview and requires reopening the source action. The server rechecks current Evaluate employees and performs the copy atomically, so a departure after preview creates no partial target roster.

When a drag Move or Resize reaches the server after Evaluate has removed a selected employee from the store, the server rejects it with `ARCHIVED_EMPLOYEE`. TimeGrid reverts the visual change; both TimeGrid and employee-row paths then reload Calendar and current workforce so the old employee becomes a non-target former row. The saved Shift and published snapshots stay unchanged.

If the server rejects a Shift Save with `ARCHIVED_EMPLOYEE` because Evaluate changed while Edit was open, Calendar refreshes the dialog's current workforce and Availability. It keeps unsaved time and notes, then presents the departed selected assignment as removable. The next Save submits current canonical IDs through normal server validation.

When an existing draft assignment refers to an employee absent from Evaluate's current active store workforce, Edit displays the saved employee-name snapshot as a removable stale assignment. Save is blocked while that ID remains selected; removing it and choosing a current employee uses the normal versioned Shift update. Published history continues to use its immutable snapshot.

The Shift employee picker has two independent filters. `筛选正式岗位` matches Evaluate's current formal position IDs (or explicitly unconfirmed employees). The existing Shift Role filter matches Evaluate skill codes required by Roster Shift Roles. Selecting either filter changes only the visible employee candidates; it does not grant a qualification or change the Shift Role. Save still submits canonical Evaluate employee IDs to Roster's normal Availability, conflict, store and version validation.

On a store timezone offset change, each Shift card labels both endpoint UTC offsets so repeated wall clocks remain distinguishable. Overnight cards show the local end date. The TimeGrid axis may still show only one sequence for a repeated hour; its visual labels do not define Shift persistence instants.

When a drag-created TimeGrid selection crosses a store timezone offset change, its mirror shows both endpoint offsets and actual elapsed duration. The Shift dialog recomputes actual duration and offset-aware endpoints as start/end or first/second occurrence choices change, and warns about the DST transition. A visually one-hour 02:00–03:00 selection on Sydney fall-back can initially represent two elapsed hours; choosing the second 02:00 makes it one hour before Save. Cancel writes nothing. The axis still does not draw two separate 02:xx rows.

On Sydney fall-back, a blank-cell click at the visible 02:30 slot uses FullCalendar's first 02:30 instant and the configured actual click duration. With a 60-minute minimum, the draft ends at the second 02:30 instant. The dialog exposes both occurrence choices, both UTC offsets and actual duration before Save. Local browser and PostgreSQL verified this exact one-hour persisted Shift.

For a time-grid move across dates, the drop target supplies the new start instant. The end instant equals that start plus the original Shift's elapsed UTC duration. A move onto a DST fall-back date can therefore show an earlier ending wall clock than a naive wall-clock copy. The backend still validates Availability, operating hours, conflicts, permissions and version in the atomic reposition operation.

## Fall-back copy semantics (2026-10-15)

Copy each Shift endpoint by local wall clock and retain its occurrence ordinal when the target date repeats that clock. Sydney 2026-04-05 first 02:30 to second 02:30 maps to 2027-04-04 first 02:30 to second 02:30, preserving one hour actual duration. If an ordinary target date collapses those endpoints to zero duration, preview and execution reject without creating a target period or Shift. Copy Shift preserves a chosen ordinal on another repeated-hour target date. Availability, store hours, minimum duration and conflict validation still apply.

- Switching account or store synchronously removes the previous store's Calendar state and open dialogs while preserving the current view and anchor date. A loaded Calendar response is shown only when its store and full visible date range match the current selection. Until the new scope loads, new-shift and pointer creation are disabled. During a save, store/date/view navigation and manual refresh are locked to keep mutation reconciliation in the same scope.

- Month date-number click enters Day on that date. Month blank-cell click opens an unsaved shift draft for that store-local date, starting at the store opening clock and lasting at least one hour or the configured minimum, rounded up to the configured slot interval. Published dates cannot open a new draft. Month event cards retain their edit/chooser action, and overflow links retain their event-list action. Month drag selection is disabled because the month grid has no time scale. Week and Day empty time click opens an unsaved shift draft at the clicked store-local date/time for the shortest slot-aligned duration meeting the configured minimum.
- Week employee-row blank date cells open the same unsaved ShiftDialog with that date, the active row employee and the store opening clock prefilled; the default duration is at least one hour or the configured minimum, rounded up to the slot interval. A visible '+' button in each editable cell provides a keyboard/touch alternative. Published dates and historical-only employee rows have no create action. Clicking a shift card still edits only that shift; an active drag suppresses the resulting blank-cell click. Save remains subject to current Evaluate, Availability, conflict and store checks.
- Every entry into a new unsaved draft checks the clicked date's period status. Month, Week, Day, employee-row and toolbar create actions show a published-period message and leave the dialog closed when that date is locked; server create checks remain authoritative.
- Empty time drag uses FullCalendar selection and the configured `snapDuration`; the selected start/end become the draft. Cancel does not call a mutation API.
- An event click opens its single shift or a group chooser. Published periods remain locked until reopened.
- Time-grid move preserves elapsed duration. Start/end resize changes the corresponding edge. Both send the shift version to `PATCH /api/roster/shifts/:id/reposition`. On rejection, FullCalendar reverts; a 409 triggers a reload.
- Week employee-row drag activates after six pixels of pointer movement, captures the pointer, highlights the hit-tested destination and suppresses the resulting click. Escape and pointer-cancel clear the gesture. Same-date cross-row drop changes one assignment through versioned `updateShift`; failure leaves the source row unchanged and shows a reason. Date moves use atomic reposition; a single-employee shift may change date and employee together in that transaction. A multiple-assignment shift cannot be silently moved across dates.
- The Week row's hover feedback and pointer-up decision use the same local target assessment. A known overlapping, unchanged, multi-assignment-across-date or invalid-local-time target remains in place with a visible reason and sends no mutation. A locally plausible target still goes through the authoritative server checks for Availability, employee status, store scope, conflict and version.
- The employee-row destination uses a red ring and screen-reader status for locally detectable invalid moves, including overlap. A brand ring means only that this local check passed; Availability, authorization and concurrent edits are still checked by the server. Pointer feedback reads an index of the target employee's shifts.
- The Week employee-row board includes snapshot-only rows for assigned employees absent or inactive in the current Evaluate store workforce. A DRAFT row is marked for reassignment and can be dragged outward to a current active employee; a published-only row is labeled as historical. Snapshot-only rows cannot receive a drop and do not create Roster-owned Employee records. Editing/publishing still uses the current Evaluate identity and availability checks.
- Shift dialog Save uses a single in-flight guard. Employee selection and save check availability/conflict; the backend repeats authoritative checks. Any failed save retains the draft.
- Time values are instants persisted in UTC and rendered through the store timezone. Dates are store-local calendar dates. The current slot length comes from store settings.
- A shift starting the day before a Calendar range and ending after the range's store-local midnight is returned with its source period metadata. Day/Week/Month show a continuation entry with the original start date and next-day end. Week employee rows place a marked, non-draggable continuation chip on every displayed next date with actual shift time after midnight, including a next date in the same week or the first date of the next week. A shift ending exactly at midnight has no next-day chip. Clicking either representation opens the original Shift ID; the visible period summary remains scoped to the period covering the visible start date.
- Calendar measures simultaneous shifts before rendering. When more than four overlap, Week and Day show one employee at a time in the time grid; Week automatically presents the employee-row board above it for the multi-employee overview. Clicking an employee name in the board selects that exact canonical ID and scrolls to the readable time grid. In lower-density large workforces, Month/Week/Day show up to 25/100/10 employees per page. Search, clear and previous/next employee controls reach every employee, including IDs retained in saved shifts after the current workforce list changes. The filter changes only the display; copy, publish and server operations use the full authorized roster. View changes preserve the first visible employee's position as closely as the new page size allows.
- Empty time-grid click and drag-create preselect the current employee when the filtered time grid contains exactly one active employee. The dialog keeps this preselected employee visible at the top even in a 500-person picker. Its normal availability, role, conflict and server validation still apply.
- Toolbar New Shift uses the selected store-local date and the same opening-time/minimum-duration defaults as Month blank-cell and Week employee-row creation. Applying a template with an end clock earlier than its start clock marks the end as next day; applying a daytime template clears that flag. The dialog shows the next-day meaning and sends UTC instants for the exact store-local wall clocks. The server still validates operating hours, Availability, overlap and duration.

Observed browser evidence and gaps are in [browser QA](ROSTER_BROWSER_QA.md) and [parity matrix](SHIFTHELPER_INTERACTION_PARITY.md).

A Shift mutation may commit even when its HTTP success body cannot be parsed. Treat this as an uncertain save, read the authoritative Calendar before allowing a retry, and suppress a duplicate when the matching Shift is found. A malformed read response reports a read failure without asserting a mutation outcome. The 201-after-commit browser case and guarded PostgreSQL result are recorded in ROSTER_BROWSER_QA.md.

Copy Day/Period with an uncertain result clears its old preview, opens the target date for inspection and reloads authoritative Calendar data. Batch Update/Delete with an uncertain result clears selected Shift IDs; Delete also closes its confirmation. Definitive validation errors keep the selection for correction. This prevents a stale action from offering a blind retry after a committed response whose body was unreadable.

Repeat Shift follows the same uncertain-result rule: close its old preview, focus the first target date, and reload. The browser/DB acceptance covers one committed repeat with a malformed success body and one persisted target Shift.

For a single Shift Delete with an uncertain result, read the authoritative Shift date and compare the exact ID. Close the editor only when the ID is absent. If the read fails or the Shift remains, preserve the editor and report the result as unconfirmed.

Month View keeps the FullCalendar focused date in the URL and uses that date to select the period summary and its Publish/Copy actions. A visible month may contain multiple DRAFT/PUBLISHED periods; the summary must not default to the first week in the grid. If the focused date has no period, hide period actions. Individual event editability remains tied to each Shift's own period, so a DRAFT Shift can move while another focused week is PUBLISHED and a PUBLISHED card stays locked.

## 2026-10-15 Dialog data recovery

Before saving a created, edited or copied shift, the dialog must have a successful current employee read from Evaluate and a successful Availability read for the selected store/date. If either read fails, Save stays disabled, the entered fields stay in the open dialog, and Retry fetches both sources again. Older responses cannot replace a later dialog/date request. Cancel closes without a mutation. This is Molly Roster reliability behavior; ShiftHelper's corresponding failure handling remains unobserved.
Staff Availability may end the next store-local date when “次日结束” is selected. Same-day end must follow start; next-day end may be at or before the start clock, with a maximum of 24 wall-clock hours. Draft, saved row and template retain this flag. Adjacent intervals are allowed; intervals across dates cannot overlap. Calendar mutations and publication continue to use server-side Availability validation.

Staff's “营业时段可用” preset fills the selected week's Availability using the current store's opening and closing clocks, including a next-day end when closing precedes opening. Availability editing and submission require a successfully loaded snapshot for the exact selected store, employee and date range. On load failure, the previous employee's draft is hidden, Save is disabled and an inline Retry reloads the target scope. A previous scope's late Save response must not replace the current employee's form.

## 2026-10-15 Availability date window
For a Shift with local start date D and at most next-day end, candidate eligibility reads Availability rows keyed D-1 through D+1. The preceding row may cover an early-morning Shift on D. Frontend dialog and Calendar snapshot requests use this window; the backend repeats coverage and conflict checks on every write. The row's keyed date is never reinterpreted as the Shift date.
## 2026-10-15 overnight time grid
For a store that opens before midnight and closes after midnight, Day and Week time grids now render 00:00-24:00 so an independent 00:00-02:00 Shift is visible on its own local start date. A 22:00-next-day-02:00 Shift appears as dated segments on both days. Backend operating-hours validation permits a same-date morning Shift only before closing and only if its end is no later than closing; it still rejects post-close gaps such as 03:00-04:00 for an 18:00-03:00 store. This does not define BHS's unobserved night-store display convention.
## 2026-10-15 Resize hit area
Time-grid events expose top and bottom Resize handles inside the clipped Shift card with a 14px hit area. Pointer down at the handle center must target the resizer, not the event anchor; moving the anchor preserves duration, while Resize changes only the selected endpoint. A split overnight event exposes its start handle on the first-day segment and end handle on the next-day segment. Browser and PostgreSQL acceptance covered 22:00-next-day-02:00 -> 22:00-03:00 -> 21:00-03:00.
## 2026-10-15 split Move and failed save
Dragging the next-day visual segment moves the entire underlying Shift by the pointer delta, preserving duration and its canonical employee. A rejected operating-hours drop reverts the preview and shows the server's structured reason. An uncertain 5xx response reverts the preview and reloads the authoritative Calendar; the UI does not declare success. Disposable Chromium and PostgreSQL verified 22:00-02:00 -> 23:00-03:00, then 400 and intercepted 503 rollback with unchanged versions after both failures.

## Copy from a deactivated Shift Role
Copy Day, Repeat Shift and Copy Week preview must name a deactivated or out-of-store source role as a blocking issue. The confirmation action stays disabled; execution repeats the check because role state can change after preview. Existing source and published-history snapshots are preserved. This rule is local Roster integrity behavior; exact ShiftHelper behavior is not yet observed.

## Employee-row drag across the vertical viewport
Week employee-row drag activates after six pixels. While held near the top or bottom edge of the app workspace, the viewport scrolls and the destination feedback follows the cell under the pointer. Escape, pointer-cancel or release stops scrolling; a canceled gesture sends no Shift write. A valid drop on a newly revealed employee row uses the existing versioned server mutation and reloads authoritative data after save. Narrow-screen horizontal edge scrolling and a saved cross-date row move were also accepted in disposable Chromium; physical store-device behavior remains unverified.

At narrow desktop widths, the Week employee-row board scrolls horizontally when a held Shift drag stays within 72px of its left or right visible edge. Target feedback follows the revealed cell; release uses the existing versioned Move mutation, while Escape cancels without writing. A 600px Chromium pass verified both directions and a persisted 9-to-5 October drop. Touch and store-device performance remain separate acceptance work.

Week employee-row drag accepts one pointer owner at a time. Additional pointer presses, moves, releases and cancellations leave that gesture intact; a non-primary touch does not start a new one. A component red-green test and Chromium event-order pass checked that only the original pointer release can save. The form and click edit path remain available as touch alternatives; actual multi-touch hardware remains to be checked.

In the narrow Week employee board, Shift cards remain tappable to edit, date '+' remains tappable to open an unsaved employee/date draft, and the sticky employee-name button selects that employee in the time grid. The '+' and employee-name targets must each be at least 44x44 CSS pixels. Horizontal touch swipes on a card may pan the board without creating or moving a Shift. A 390px touch-enabled Chromium run and unchanged PostgreSQL verified these alternatives; physical device behavior remains to be checked.

Move and Resize share the versioned reposition service. That service must recheck the Shift's current active store-scoped role under the store lock before writing; an inactive role returns INACTIVE_SHIFT_ROLE and leaves the draft Shift, assignment, period version and published history unchanged. Accepted reposition refreshes the draft role name/color snapshot from the current role row. An isolated browser cross-date move and direct PostgreSQL regression cover the refusal path; browser Resize with an inactive role remains untested.

Batch Update must recheck all selected Shift assignments against current D-1/D/D+1 Availability and current active Shift Role state before changing any Shift. A replacement role must itself be active and store-scoped; a role replacement can repair an inactive source role. The backend performs one batched Availability read and aborts atomically with EMPLOYEE_UNAVAILABLE or INACTIVE_SHIFT_ROLE. A grouped Calendar browser refusal and direct PostgreSQL version checks cover the unavailable path.
## 2026-10-15 malformed source period handling

Publish and Copy Week commit must return SHIFT_PERIOD_MISMATCH without writes if any Shift linked to the source period belongs to another store or has a date outside that period. Copy Week preview must show the affected Shift as a blocking issue and keep Copy disabled. The UI tells the manager to request data repair; ordinary Calendar editing is not used to silently move the malformed Shift between stores.
## 2026-10-15 Copy Day and Repeat malformed source

Copy Day and Repeat previews must report a blocking SHIFT_PERIOD_MISMATCH if a source Shift's linked period does not own its store and date, or if the source-date period differs from that link. The Save/Repeat action stays disabled; an authenticated forced execution returns 409 and makes no target Shift or period. The Calendar dialog surfaces the data-repair reason while retaining the current view.

## 2026-10-15 Empty Copy Week source

Copy Week preview must report NO_SOURCE_SHIFTS and block confirmation when the source period contains zero Shifts. A forced commit returns 422 and creates no target period. The toolbar's Copy Previous Week path is subject to this rule; the summary Copy Next Period button is already disabled when the current source has no Shifts.

## 2026-10-15 Batch Update source-period integrity

Batch role, break and note changes must reject any selected Shift whose saved date/store is outside its linked RosterPeriod. The store-locked transaction returns SHIFT_PERIOD_MISMATCH (409) before the first row update; the Calendar leaves the selection available for review and does not claim success.

## 2026-10-15 Bidirectional Day drag selection

Dragging an empty time range upward or downward opens one unsaved Shift draft with snapped start/end. The 2026-10-15 upward browser run selected 10:00-11:30 on 10 October and persisted exactly one HandoverEmployee006 Shift after Save/reload; that inclusive-starting-slot endpoint was **superseded on 2026-10-20** by the BHS-observed exclusive upward end rule above. Cancel remains a no-write path.

## 2026-10-15 Time-grid gesture cancellation

An empty Day/Week drag selection remains pending until release. Escape during the held gesture clears the selection preview and prevents Add on release. Pointer-cancel also suppresses a pending draft. The next pointerdown resets the cancellation state so a normal click can create again. Movement below the six-pixel selection threshold still follows the clicked slot; browser checked 3px movement at 10:00 opening a 10:00-10:30 draft.

## 2026-10-15 Calendar create-range boundaries

Time-grid drag selection must be positive, meet the store minimum, last no more than 24 actual hours and end no later than the next store-local calendar date. Invalid ranges do not open the Shift dialog. Click creation begins at the clicked slot and defaults to the shortest slot-aligned duration that meets the store minimum. The backend remains the final authority for operating hours, Availability, conflicts and DST.

Click creation also checks whether that default duration fits the current store opening and closing hours before opening Add. For example, a 09:00–22:00 store with a 60-minute minimum rejects a 21:30 click with a visible message, while 21:00 opens a 21:00–22:00 draft. The check follows the server's overnight-store rule; Save remains subject to server validation.

Drag selection applies the same operating-hours check before opening Add. For an 18:00–next-day 02:00 store, a 10:00–11:30 daytime selection receives a visible error and opens no draft; 18:00–19:30 and 00:30–01:30 selections remain valid on their respective local start dates. A click in the daytime gap uses the same general operating-hours message.

Month blank-cell, Week employee-row and toolbar creation share the store-opening default. A 30-minute grid with a 65-minute minimum prefills 09:00–10:30, not 09:00–10:05. If even this default cannot fit inside operating hours, creation shows a visible error and does not open Add. Store settings Save rejects a minimum greater than the nominal opening-to-closing window, including windows that close the next day; actual DST-day validation remains on each Shift write.

On a DST fall-back date, the same local clock can occur twice. ShiftDialog offers explicit first/second occurrence selectors for an ambiguous start or end and shows each UTC offset. Opening an existing Shift selects the occurrence matching its saved UTC instant; changing a clock or applying a template resets that clock to the first occurrence until the user explicitly chooses the second. A copied Shift moved to a different date resolves its wall clock on the target date. The server still validates actual elapsed duration, Availability and operating hours.

## Mobile employee-row scroll visibility

The mobile workspace reserves scroll space above and below for its sticky header and bottom navigation. The employee-row horizontal scroller reserves inline space for the sticky employee label column. A 44px Create target can be brought fully into the tappable area after horizontal and vertical scrolling; tap Edit/Create/Select and swipe cancellation were verified at 390px and 320px. This keeps the existing Molly visual system and employee-row controls.

## Copy Week configured boundary

Copy Period preview must treat a target start date that differs from the store's configured `weekStartsOn` as a blocking `INVALID_TIME_RANGE` and show zero ready Shifts. The commit must recheck that boundary inside the store-locked transaction and reject without a target period. This weekday check also applies to a FORTNIGHT source; it does not define the separate 14-day anchor needed for automatic fortnight creation.

Explicit period creation must apply the same store `weekStartsOn` boundary inside its store-locked transaction after validating the WEEK/FORTNIGHT length. A wrong weekday returns `INVALID_TIME_RANGE` before writing. The separate FORTNIGHT 14-day anchor remains undefined.

When a store has no saved Settings row, the configured period boundary defaults to Monday (`weekStartsOn=1`), matching the frontend and Prisma default. Copy Period preview and every period-creating transaction must apply that default rather than treating the missing row as unrestricted.

## Store-anchored FORTNIGHT interaction rule

Selecting FORTNIGHT requires a date chosen by the store manager as day 1 of a 14-day cycle. It must fall on the configured week start. For a date before or after that anchor, choose the unique 14-day interval `anchor + 14*n .. anchor + 14*n + 13` that contains it, using calendar dates rather than local elapsed milliseconds. Calendar create and move send this whole target range; backend transactions recalculate and reject an inconsistent range. Copy Day and Repeat create a new period of the configured cycle if none covers the target date; Copy Period preserves the source period's cycle and requires an aligned target. A missing legacy FORTNIGHT anchor blocks new period creation with a configuration error while existing valid periods/history remain readable. Calendar may show one week at a time within a FORTNIGHT period. This specifies Molly behavior; direct ShiftHelper parity remains unverified.

## Copy Previous Period cycle selection

The Copy Previous Week/Fortnight button derives the target cycle from current store Settings. Its source must cover exactly the immediately preceding 7 or 14 calendar dates and have the same cycle type. A historic WEEK sharing the preceding FORTNIGHT end date is not a valid source for this shortcut. If no exact source exists, show a missing-source message and do not request a copy preview or write roster data. Explicit Copy Period from a selected historical period keeps that period's stored cycle semantics.

## Refresh and direct-link context

Calendar navigation updates the URL with store, view and real YYYY-MM-DD date using history replace. Refresh returns to the same Month, Week or Day and selected authorized store. Invalid view/date parameters fall back to supported defaults; a store parameter outside the current user's Evaluate store list must not trigger a Calendar read for that store. Navigating or changing view/store must not issue roster mutations or display the prior store's Shift cards.

## 2026-10-15 Week employee-row Availability

Week employee rows independently read recorded Availability from the previous local date through the visible week's last date. Store-local midnight clips a cross-day window into dated markers, including DST boundaries. Green identifies recorded AVAILABLE, red identifies recorded UNAVAILABLE; no marker means no recorded window, never implied eligibility. The compact cell shows two windows and a count for additional windows, with the full set in its title. Clicking the marker uses the cell's existing Add workflow. A failed read leaves the Calendar and Shift cards visible, shows an error and Retry; ShiftDialog still fetches date-scoped Availability and backend writes still validate it. This defines Molly behavior, not observed BHS parity.

## 2026-10-15 fall-back Availability label and bound

When a recorded Availability interval crosses a store timezone offset change, its Week employee-row badge shows both local clocks with their UTC offsets. This distinguishes first versus second 02:30 on Sydney fall-back and avoids implying zero duration. The backend's 24-hour maximum is measured by UTC elapsed milliseconds as well as the existing local-day shape rule. Same-day ambiguous reversed/equal wall-clock inputs remain rejected while Staff lacks an offset selection control. A valid 01:30 UTC+11 to 03:30 UTC+10 interval was saved and displayed in disposable Chromium. Direct ShiftHelper behavior is unobserved.

## 2026-10-15 Staff fall-back clock choice

For an ambiguous store-local Availability clock, Staff shows first and second occurrence choices with UTC offsets below that time field. Save submits the selected exact UTC instants; reload restores both choices. Changing the clock or next-day flag resets its occurrence to the first choice. Validation uses actual elapsed time and retains the 24-hour bound. A second-occurrence slot is date-specific and cannot become a reusable wall-clock template; Staff reports this on the template action. The current Week badge continues to show offset changes. Direct ShiftHelper behavior remains unobserved.

## 2026-10-15 Staff Availability stale-write state

The Staff form sends the IDs and versions of all Availability rows it read for the requested employee/dates. A 409 `STALE_VERSION` leaves the user's unsaved clocks/notes visible, disables another Save from that stale form, and presents an explicit reload action. Reload discards that local draft and shows the latest database rows. The backend performs the version comparison inside the locked replace transaction before deleting any row. Calendar Shift writes retain their existing separate versioned mutation paths.

## 2026-10-15 Copy Day preview freshness

Changing either date in the Copy Day dialog invalidates an in-flight conflict preview. A response for prior dates must not restore its metrics or enable Copy. A fresh preview for the displayed source and target dates is required before commit; the server still revalidates on commit.

## 2026-10-15 Repeat Shift preview freshness

Changing the repeat end date or selected weekdays invalidates any in-flight Repeat preview. An older response or error must not restore metrics or enable Generate. A fresh check for the currently displayed repeat rule is required before batch creation; the server still validates during the write.

## 2026-10-15 repeated-hour TimeGrid resize rule

For a same-day resize, use FullCalendar's snapped `startDelta` and `endDelta` as elapsed milliseconds applied to the original persisted UTC Shift instants. On Sydney fall-back, FullCalendar can omit `oldEvent.end` when both endpoints read 02:30 locally; its reconstructed `event.end` can be 60 minutes later than the pointer's actual snapped movement. The backend receives the corrected UTC start/end, validates Availability/conflicts/minimum duration and writes with the Shift version. If a delta contains calendar days/months/years, preserve FullCalendar's date-aware candidate and rely on backend validation. The editor remains the explicit first/second occurrence alternative.

## 2026-10-21 current Day Add candidate behavior

This section supersedes historical saved-card move/resize text above for the current user-directed interaction model: a saved card opens Edit by click and is not directly draggable or resizable; blank Day/Week time-grid pointer selection creates an unsaved Add draft. For current verified Evaluate Job catalogs, the Add picker starts with no candidates before a Shift Role is selected. After selecting one role, default rows contain staff with that exact formal Job authorization, including employees whose Availability or overlapping Shift makes them unselectable. Each such row remains visible with its reason and a disabled selection control. The summary separates formal Job holders from staff currently schedulable at the draft time. The optional all-staff view can inspect other staff but cannot newly select someone without the exact formal Job. A preselected employee-row assignee who lacks the newly chosen Job produces an inline error and disables Save; the assignee remains removable. The backend remains the final authorization gate. This matches observed BHS candidate visibility for one Job, while BHS's multi-Job AND candidate filter and persisted multi-Job semantics remain open.
