# ShiftHelper Calendar parity report — 7 October 2026

## Confirmed ShiftHelper behaviours

The authenticated BHS study in [the behaviour map](SHIFTHELPER_BEHAVIOUR_MAP_2026-10-07.md) used only navigation, dialogs, filters, and empty-grid selection. Month/Week/Day views, Monday-first navigation, single-click Edit, click/drag Add, 30-minute Add defaults, disabled unavailable/conflicting candidates, and Cancel without saving were observed. Week/Day use a 24-hour time grid without employee resource rows. The sampled Add/Edit dialog showed job, level, start/end, break, preset, note, and staff controls; no repeat control was visible. No BHS record was saved, moved, deleted, published, or copied.

## Implemented Molly behaviour

| Workflow | Current result |
|---|---|
| Create/Edit/Copy one shift | Existing dialog and design remain. Copy opens an unsaved draft with role, employees, break, notes, and time inherited. Changing the target date recalculates the candidate list; nothing is written until Save. |
| Move and resize | FullCalendar uses the store slot interval. A single shift can move by time/date and resize at either edge. A single atomic backend transaction validates the target before changing the shift or creating a target period. Failed drops revert. A move retains duration; a resize recalculates hours after reload. |
| Employee assignment | The existing editor changes assigned employees. Unavailable or locally overlapping candidates are disabled; server validation rechecks availability and employee conflicts across stores. |
| Availability and conflict | A shift requires complete AVAILABLE coverage. The server checks actual timestamps, including the next date for overnight shifts. Overlap and cross-store conflicts block writes. Error text includes employee and conflicting store/time or requested interval. |
| Copy a period | A read-only preview shows ready shifts, valid assignments, availability blocks, conflicts, and individual reasons. The final copy is all-or-nothing, revalidates inside a transaction, and creates a DRAFT. No invalid assignment is silently dropped. |
| Publish/history | Existing DRAFT → PUBLISHED → reopen → new publication path and immutable snapshots remain. The Calendar now displays draft/locked status, data version, and most recent publication time. Empty drafts cannot be published from the Calendar. |
| Overnight shift | Existing `date`, `startAt`, and `endAt` fields represent a shift such as 23:00–02:00 without migration. The editor has a next-day end control. Overnight scheduling is permitted only for a store whose configured closing time is earlier than opening time. Both availability dates and real timestamp overlaps are validated. Export marks a next-day end date. |

## Remaining known differences and gap classification

| Classification | Difference / decision |
|---|---|
| VERIFIED DIFFERENCE | BHS Week/Day show a 00:00–24:00 grid; Molly uses configured store operating hours, including an extended overnight grid for overnight stores. This is deliberate for Molly's scheduling rules. |
| VERIFIED DIFFERENCE | Neither sampled BHS nor Molly time grid has employee resource rows. Molly therefore changes an employee through Edit; direct vertical drop onto an employee row is unavailable. Adding resource rows would require a calendar architecture/licensing change and was not introduced. |
| UNVERIFIED BHS BEHAVIOUR | Saved BHS move/resize snapping, cross-day movement, copy, recurring shifts, publish/submit outcomes, shortcuts, and server-side errors could not be tested without writing production data. Molly uses conventional atomic validation, but these are not claimed as matched BHS results. |
| MOLLY-ONLY REQUIREMENT | Strict AVAILABLE coverage, cross-store conflict checks, operating hours, DRAFT/PUBLISHED write lock, and immutable publication snapshots remain stronger Molly rules. |
| OPTIONAL UX IMPROVEMENT | Molly has no dedicated Copy Day, Copy Previous Week into the current draft, or recurring shift series. Its existing next-period copy is all-or-nothing after a detailed preview; it does not apply only valid rows from a partially blocked week. |
| OPTIONAL UX IMPROVEMENT | Calendar-specific keyboard shortcuts and an event context menu are absent. The BHS study did not establish either as a confirmed reference behaviour. |
| OPTIONAL UX IMPROVEMENT | Creating a shift in a date with no period still creates the empty period before the shift write. If the subsequent create fails, the empty draft period can remain. Atomic period creation was completed for drag/resize, but not for Add/Copy Save. |
| OPTIONAL UX IMPROVEMENT | Copying a period across a daylight-saving boundary currently shifts timestamps by whole UTC days; local wall-clock time should be checked before using this operation for a DST-transition week. Export formatting currently assumes the Sydney time zone. |

## Automated test results

- Frontend: 81/81 passed; lint and production build passed.
- Backend: 50/50 passed with `RUN_DATABASE_TESTS=1`, including PostgreSQL integration tests. TypeScript emit passed. Full backend `npm run build` was not rerun successfully because the active dev server held Prisma's Windows query-engine DLL during `prisma generate`; TypeScript compile and live health passed.
- New/updated coverage includes strict availability, cross-store conflict, copy-week preview with blocked assignments, overnight create and availability across both dates, timestamp overlap, valid resize, invalid reposition with no target-period residue, and next-day dialog save. Existing publication integration tests cover publish, reopen, two immutable versions, and published write locks.

## Browser QA results

The running local app at `http://127.0.0.1:5176/calendar` was used with a temporary Hurstville draft fixture. A shift was created for a currently available employee, dragged from 09:00–10:00 to 10:00–11:00, resized at the end to 11:30 and at the start to 10:30. The labour summary changed from 0.5h to 1.0h as expected. Dragging outside the employee's available time showed the employee and requested timestamps, visually reverted, and left the period version unchanged. Copy opened an unsaved draft; changing its target date retained its fields and recalculated eligibility, then Save created the second shift. Copy-week preview showed two availability blocks and disabled its final action. Both test shifts were deleted; the resulting empty test period was deleted under strict ID/version/empty/no-publication guards. Browser refresh then showed no test period or shifts. Local health reported database and Evaluate dependencies healthy.

Publish/reopen, cross-store drag conflict, and overnight creation were verified through integration tests rather than the shared local browser store. Browser publication would leave immutable history in that store; overnight browser setup would require changing its real availability and operating rules. These are **browser QA gaps**, not claimed passes. BHS production data was never modified.

**Conclusion: improved interaction parity with known exceptions.** The weekly editor now supports the tested fast move/resize/duplicate/copy workflow while keeping Molly's design and data architecture. Direct staff-row dragging, Copy Day/Previous Week/recurrence, the Add empty-period edge case, DST copy semantics, and the browser QA gaps above prevent a 1:1 parity claim.
