# Calendar validation and interaction hardening

Date: 2026-10-08. Scope: local Molly Roster Calendar. BHS / ShiftHelper data was never changed.

## Validation rules

The backend is authoritative for every persisted scheduling mutation. A `SchedulingError` returns a structured `validation` object alongside the HTTP message. `BLOCKING_ERROR` prevents persistence. The Calendar may show local availability and overlap hints, but server checks run again under a transaction and employee advisory locks. Existing skill, break, daily and weekly hours advice remains nonblocking; success notifications are informational.

Shift create now uses `/roster/shifts/with-period`: the period and shift are created in one transaction after availability, overlap and scope checks. A failed first shift leaves no draft period. Drag and resize use the existing atomic reposition endpoint. Period copy is transactional.

## Error precedence

The declared order is published or stale state, invalid time, employee or store scope, store duration and operating rules, availability, local overlap, cross-store overlap, then warnings. The manager sees one actionable blocking error for single-shift mutations. Period-copy preview lists every affected assignment. A stale edit is checked before availability and overlap within the update transaction. Some field checks occur before the transaction, so a structurally invalid request may report its field error before the locked-state error; this is a known precedence exception.

## Validation code catalogue

| Severity | Codes | Result |
| --- | --- | --- |
| Blocking | `PERIOD_PUBLISHED`, `STALE_VERSION`, `INVALID_TIME_RANGE`, `INVALID_CROSS_DAY`, `INVALID_EMPLOYEE_SCOPE`, `ARCHIVED_EMPLOYEE` | No write; reopen, refresh or correct the target |
| Blocking | `EMPLOYEE_UNAVAILABLE`, `SHIFT_OVERLAP`, `CROSS_STORE_CONFLICT` | No write; identifies employee and relevant timestamps |
| Blocking | `OUTSIDE_OPERATING_HOURS`, `MIN_SHIFT_DURATION`, `INVALID_BREAK`, `INVALID_SLOT_ALIGNMENT`, `TARGET_PERIOD_CONFLICT` | No write; correct time, break or target period |
| Warning | `BREAK_WARNING`, `WEEKLY_HOURS_WARNING` are reserved contract codes | Existing warning display is still derived on the frontend, rather than returned in this structured contract |
| Informational | Save, move, delete, copy and publish success toast | Shown only after server response |

The frontend maps known codes to consistent Chinese explanations without parsing English server text. Unknown codes retain the server message. Availability and overlap feedback identify the employee and time. The edit dialog also shows the conflicting existing shift time.

## Frontend/backend responsibility split

The dialog checks obvious field, local overlap and loaded availability problems immediately. Its hints may lack shifts outside the currently loaded view or another store. The backend validates the complete assignment using database timestamps, strict availability and cross-store queries. The frontend retains form input after failed saves. BHS behavior beyond the earlier read-only study remains unverified; these decisions follow Molly's rules.

## Mutation state model

| Action | Model | Failed response |
| --- | --- | --- |
| Create, edit, delete, copy shift, copy period, reopen, publish, batch operations | Server-confirmed | Preserve draft or current Calendar; show reason; prevent double submission with a synchronous mutation guard |
| Drag and resize | FullCalendar visual preview, then server-confirmed | Call the exact `revert()` callback; refresh on 409 or uncertain network outcome; show failure reason |

The API sets a 30-second default request timeout. Connection failure and timeout are distinguished. Timeout text says the operation is unconfirmed rather than claiming that no server write occurred. A refresh is attempted after an uncertain drag or resize. The Calendar retains existing data if that refresh fails.

## Rollback behaviour

Invalid drag and resize release no local persistent state: `revert()` restores the original FullCalendar event, then the server remains authoritative. Server-side reposition checks availability, overlap, cross-store conflict, store rules, slot alignment, break and version before writing. Success reloads shifts, hours and warnings. This round did not automate a browser-level transport interruption during pointer drag; deterministic rollback was covered by the existing interaction code and server rejection tests, with the earlier manual invalid-drag QA recorded in `SHIFTHELPER_PARITY_FINAL_REPORT.md`.

## Availability semantics

`AVAILABLE` intervals must cover the entire shift; touching adjacent intervals can combine. `UNAVAILABLE` overlapping any part blocks it. `UNKNOWN` and missing records grant no coverage. Exact endpoints are accepted; one minute outside is rejected. An overnight shift must be covered across both dates. Frontend hints mirror these rules, while backend decisions are final.

## Overlap semantics

All intervals are half-open `[start, end)`: 09:00–12:00 and 12:00–15:00 may touch; 09:00–12:01 and 12:00–15:00 conflict. The same timestamp comparison is used for local and cross-store checks, including overnight shifts. Availability and copy checks use absolute instants.

## Cross-day behaviour

Existing `startAt` and `endAt` are unambiguous absolute timestamps; the shift date remains its local start date. The backend checks store time zone, next-day boundary, maximum duration and availability on both dates. Copy uses the local end date, not a fixed 24-hour offset. The Calendar rendering, export and publication snapshots continue to use the existing timestamp model.

## DST handling

Period copy now reconstructs source local start and end clock times in the configured store time zone on the target calendar dates. It rejects nonexistent local times at spring transition. At a repeated autumn clock time it selects the earlier occurrence deterministically. Tests cover 09:00–17:00 across the Sydney October change, an overnight copy across the April change, nonexistent 02:30 and repeated 02:30. The exact desired business rule for ambiguous autumn times has not been confirmed with a store manager.

## Copy-week policy

**All or nothing.** Preview returns `policy: ALL_OR_NOTHING`, ready shifts, valid and blocked assignments, and structured blocking issues with affected employee and date. The UI states that any block stops the entire copy. Execution revalidates inside one transaction; no assignment is silently skipped and no partial target period survives. Warning classification per copied assignment is still a known gap because warning generation remains a separate frontend summary.

## Concurrency handling

Edits check period status and shift version before availability and overlap. A stale version returns `409` with `STALE_VERSION`; the dialog retains unsaved input, disables further save and instructs the manager to reopen the refreshed shift. Publish/reopen also use period version checks. Two-tab browser QA verified that the later manager's saved note was not overwritten by an older tab.

## Browser QA evidence

- Local health returned database and Evaluate ready. Hurstville test shift was created on 2026-10-07 for an employee with recorded availability; Calendar showed one shift and updated net hours.
- Copy action opened an unsaved draft with employee, role, break and note inherited. Moving the draft to 2026-10-14 retained the employee; Save showed a named, timed availability error, with no copied shift.
- Copy-next-period preview showed 0/1 ready shifts, one blocked assignment, the named availability reason and a disabled copy button. The all-or-nothing policy was visible.
- Two local browser tabs edited the same temporary shift. Tab B saved version 3; Tab A's older save showed a stale-version alert, kept the entered note locally and disabled further Save. Tab B's update remained intact.
- Both temporary shifts were deleted through the UI. Each resulting empty, unpublished QA-only period was deleted with an exact ID, store/date/status and zero-shift/zero-publication guard; deletion count was one each time. No BHS page was changed.
- A new browser-level network outage during drag, cross-store conflict, publish/reopen and DST-adjacent copy was not exercised in this round. Backend and pure tests cover the respective rules; those browser paths remain unverified in this report.

## Automated test results

- Frontend: 85/85 passing; ESLint passing; production frontend build passing.
- Backend: 57/57 passing with `RUN_DATABASE_TESTS=1`, including atomic empty-period regression, strict availability, overnight behavior, publication history, period concurrency and Sydney DST copy. Backend TypeScript check passed.
- The backend `npm run build` command could not regenerate Prisma's Windows engine because the running local backend held its DLL (`EPERM` rename). No schema or generated client change was made; backend TypeScript compilation with emitted output and full database tests passed. A cold Prisma generation after stopping the dev backend remains to be verified.

## Remaining known issues

1. Warning codes are defined but existing break, hours and skill warnings are still produced as frontend strings. They do not block and are visually separate from errors, but they do not yet share the structured backend contract.
2. Drag/resize network loss and timeout recovery has no dedicated browser automation; an uncertain server outcome prompts refresh. If refresh also fails, the manager must retry refresh before trusting the displayed state.
3. Frontend local conflict hints only cover loaded Calendar shifts. Backend catches cross-store and off-view conflicts at Save.
4. The store time zone governs backend validation and week copy; manual date/time input uses the browser's local time zone. Cross-time-zone managers need a dedicated input conversion path.
5. ShiftHelper production drag, resize, publish and copy persistence remain unverified because BHS was studied without writes. No 1:1 parity claim is made.
