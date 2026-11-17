# ShiftHelper Calendar Behaviour Map — 7 October 2026

Scope: authenticated Molly Tea Hurstville Calendar, operated in the user's existing Chrome session. This pass used only navigation, dialogs, filters and an empty-slot drag. No ShiftHelper shift was saved, moved, resized, deleted or submitted. The user confirmed there is no safe test period for persistent writes. Earlier observations are in `SHIFTHELPER_CALENDAR_REFERENCE_AUDIT.md`; this document records the current pass and marks unknowns explicitly.

| Behaviour | Trigger → UI response → data change → validation → final state |
|---|---|
| Calendar navigation | Opens at current October month, Monday-first. Month/Week/Day switch changes the grid and title in place; Back in Day moved 7 Oct to 6 Oct; Today returned to 7 Oct. No URL change observed. No data change. |
| Month | Seven Monday–Sunday columns, date buttons, compact role/time/break chips. Today has a distinct date background. Clicking a date enters Day (earlier audit). No employee rows, all-day band or visible hours summary. |
| Week | Seven date columns with a 00:00–24:00 hourly time grid. Simultaneous shifts display side by side; equivalent role/time/break groups display multiple names in one block. No employee rows or sticky employee column. |
| Day | One 00:00–24:00 time grid with overlapping blocks side by side. Block content is role → start/end → break → staff names. Current-day grid background and current-time line are visible. |
| Shift creation | Clicked empty Day grid near 08:00 → Add Shift dialog, prefilled 07:30–08:00. Dragged empty grid 08:00–09:00 → Add Shift dialog prefilled 08:00–09:00. No write before Save; Cancel removed the dialog. This supports 30-minute click selection and drag interval prefilling; exact snap while dragging was not observed. |
| Create/edit fields | Add/Edit dialog has Job checkboxes, T1–T5 Level checkboxes, Start/End, Break selector, preset selector, fortnight start display, Shift Note, and Shift Staff checkboxes. Edit also has Delete. Existing shift opened by single click; the sampled edit showed its current role, time, break and employee selected. No repeat, location or status field was visible. |
| Employee picker | Changing Job/time re-evaluated the candidate list inside the unsaved dialog. At 10:00–15:00 on 7 Oct the seven matching employees were all disabled; rows distinguished `No available Time` from a displayed available range, while staff with a conflicting scheduled shift were also disabled. No override control was visible. |
| Conflict detection | The candidate list disabled an employee despite a displayed 10:00–17:00 available range when the proposed 10:00–15:00 shift overlapped their existing shift. A `No available Time` row was disabled. Server save response and other validation messages remain unverified because Save would write production data. |
| Shift editing | Single click → Edit dialog. Cancel of the sampled existing shift produced an `Are you sure to quit? All unsaved data will be lost` confirmation, then returned without a write. Save/delete results, recurrence scope and undo remain unverified. |
| Drag/resize/move | Empty-grid drag was verified. Moving or resizing a real block, cross-date/staff drag, modifier duplication, snapping and drop error feedback remain unverified because drop may persist a production change. The time grid has no employee rows for a vertical staff drop target. |
| Batch/copy | Batch Operation opened a mode with Cancel, disabled Save, Job Filter and New Shift sections. No copy/duplicate action was visible in this state. Cancel returned to Calendar. Persistent batch and copy results remain unverified. |
| Sidebar/filter | Sidebar opened a mini month calendar plus `Sidebar Filter`; on the sampled date it showed `No Shift`. Add/Edit has Job and Level candidate filters. No Calendar-wide employee, store, status or text filter was visible in the sampled views. Filter persistence was not asserted. |
| Draft/publish | Bottom Submit was disabled before any change. The Calendar did not expose a distinct Draft/Published badge for sampled blocks. Save → Submit → employee visibility was not tested because it would modify live data. |
| Hours/error handling | No daily/weekly labour totals or cost were visible in the sampled Calendar views. Candidate conflicts were represented by disabled checkboxes. Error handling after Save/Submit is unverified. |
| Keyboard/mouse | Single click opens Edit; right click on a sampled shift did not reveal an application context menu. Escape, delete, modifier-drag and shortcuts were not established. |

## Current Molly Roster gap analysis before implementation

| ShiftHelper behaviour | Molly Roster current behaviour | Gap | Implementation required | Priority |
|---|---|---|---|---|
| Time-grid drag create | FullCalendar selectable with store-configured slot interval and Add dialog | Substantially present | Preserve and verify | 1 |
| Shift block move/resize | Single-record FullCalendar drop/resize persists via API; grouped records open a chooser | Reference result unverified | Preserve existing safe behaviour; improve error feedback only with evidence | 1 |
| Add/Edit dialog and candidate filters | Existing role, template, time, break, notes, employee search/type/Tier/role filters | Substantially present; Molly uses one saved role | Preserve single-role data model and design system | 2–3 |
| Unavailable employees disabled | Molly shows availability as a warning and still permits selection; server has no availability check | Violates user's strict availability rule | Block invalid selection and enforce in transaction on create/edit/copy; prevent availability edits from invalidating assigned shifts | 4 |
| Existing-shift conflict | Molly blocks same-store overlap client and server | Cross-store conflict could pass; concurrent cross-store locks differ | Check all stores for the same employee and use employee-wide lock | 5 |
| Week copy | Molly copies a period into a new Draft, retaining role and employees | Target availability is not checked | Validate every copied assignment before writing | 6 |
| Draft/Publish/History | Molly has DRAFT/PUBLISHED periods, reopen and immutable publication snapshots | Stronger existing lifecycle | Preserve | 7 |
| Hours | Molly period summary computes net hours and warnings | Already present | Preserve, verify refresh after shift mutations | 8 |
| Calendar filters | Store selector and dialog candidate filters | No broad Calendar status/employee filter | Add after high-priority scheduling integrity | 9 |
| Keyboard shortcuts | Molly dialog and controls support ordinary keyboard focus | Dedicated shortcuts not established in reference | Avoid inventing parity; improve only after observed workflow | 10 |
| Copy one shift | ShiftHelper single-shift copy was not exposed in the safe sampled controls | Molly originally had only period copy | Add a duplicate draft with target date and existing role/time/break/staff/notes, subject to create validation | 6 |

Molly's store operating hours, readable narrow Week scroller, explicit Month overflow, and immutable publication history are intentional improvements over the observed ShiftHelper presentation. Preserve them.

## Implementation and verification in this pass

- Existing Calendar components and schema were extended; no database migration or visual design system change was needed.
- The employee picker now disables candidates without a fully covering AVAILABLE interval or with a shift conflict. Save checks selected employees again, including previously selected employees after a time change.
- The server now checks availability inside the employee-locked transaction for create/edit, checks every target assignment for period copy, and rejects availability edits that would invalidate an existing assignment. Adjacent AVAILABLE slots may jointly cover one shift; gaps and UNAVAILABLE overlaps are rejected. Existing historic shifts are retained.
- Shift conflicts now include other stores that use the same Evaluate employee ID, with an employee-wide advisory lock for concurrent mutations.
- Edit Shift has a `复制班次` action. It opens an unsaved Add draft with role, time, break, notes and staff copied; the target date can be changed. Save still creates through the normal service path. The Add button now targets the Calendar's focused date.
- Browser: ShiftHelper Month/Week/Day, Back/Today, edit/cancel, empty click/drag, candidate disabling, Sidebar and Batch entry/cancel were operated without saving. Molly's focused-date Add, disabled unavailable candidate, copy draft, native target-date change and cancel were verified in the real local browser.
- Automated: frontend 80/80 tests, lint and production build passed; backend 49/49 tests with real PostgreSQL integration and production build passed. Roster health returned `ok=true`, `database=true`, `evaluateMolly=true` after restart.
- Not verified on BHS: saved creation/edit/deletion, real-shift drag/resize/duplicate, publish, recurrence, copy and post-save errors. The user explicitly disallowed all BHS data modifications. Consequently, those are not claimed as 1:1 observed behaviours.
- Cross-day shifts remain disallowed by current store operating-hour validation. The reference did not expose a safe cross-day case. Current store/availability settings and the existing date/time editor would need a separate overnight business-rule decision before support is added.
