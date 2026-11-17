# Calendar interaction state

**2026-10-20 directional selection:** On an ordinary store date, the `SelectionMirror` transition now checks `gridPointerStart` against FullCalendar's selected range. Downward selection keeps its inclusive destination slot. Upward selection makes the initial slot's start the exclusive end boundary; `selectAllow`, mirror text, mirror/highlight geometry and `select` use that same end. Clock-change dates continue through the existing wall-clock pointer mapping until BHS DST behavior is known. The signed-in BHS Day mirror and cancelled Add established the ordinary-day rule; a disposable Molly Day saved/reloaded Shift plus Week/Day Cancel paths verified the implementation. Older statements below saying live BHS gestures were unobserved are historical.

**2026-10-20 toolbar state:** More is a native disclosure menu for secondary commands. Selecting a command closes it; outside pointer and Escape also close it. This menu does not alter shift gesture state or issue a write by opening. The saved-card click-only and blank-grid drag-create rules below still govern Day and Week.

**2026-10-17 current implementation:** EmployeeLaneBoard has no saved-card drag state, pointer capture, drop feedback, auto-scroll or move callback. Its cards are click/keyboard to Edit; employee-date cells and `+` open an unsaved employee-prefilled draft. Older employee-row Move/auto-scroll sections below document a superseded implementation and must not be used as current acceptance criteria. FullCalendar blank Day/Week grid drag remains the time-selection gesture.

**Current gesture rule, 2026-10-16:** existing Shift blocks are click-to-edit. A pointer path of at least six pixels starting on a card suppresses the click and makes no mutation. Blank Day/Week grid drag selects a snapped time range and opens an unsaved Add dialog. Staff reassignment and time edits use the Shift form with versioned Save. The user explicitly corrected this rule; BHS's live gestures remain unobserved.

Store or account change remounts the store-owned Calendar state; visible date-range changes mask the previous range's events and summary until the new snapshot arrives. While a mutation is saving, store/date/view navigation and manual refresh are disabled. This prevents a pending mutation's old-scope callback from replacing the active view.

```text
Idle
 ├─ Month date-number click ──> Day
 ├─ Month blank-cell click ──> DateDraft ── Cancel ──> Idle
 ├─ Week/Day slot click ──> UnsavedDraft ── Cancel ──> Idle
 ├─ Employee row blank cell or '+' ──> EmployeeDateDraft ── Cancel ──> Idle
 ├─ Blank Week/Day time-grid drag ──> SelectionMirror ── release ──> UnsavedDraft
 ├─ DRAFT Shift click ──> EditDraft or GroupChooser
 ├─ PUBLISHED Shift click ──> ReadOnlyDetail or GroupChooser ── Close ──> Idle
 ├─ Shift pointer move >= 6px ──> SuppressClick ── release ──> Idle
 └─ Escape/pointer-cancel during selection ──> Idle
UnsavedDraft/EditDraft ── Save ──> Saving
UnsavedDraft/EditDraft ── Cancel ──> Idle
Saving ── success ──> ReloadAuthoritative ──> Idle
Saving ── failure ──> KeepDraft + Error ──> UnsavedDraft or EditDraft
```

FullCalendar owns blank time-grid pointer selection and its selection mirror. React owns dialog and mutation state. FullCalendar event editing and resizing are disabled; the optional employee board has no saved-card drag path. `mutationInFlight` prevents duplicate submissions; `saving` disables edit gestures. The server checks version, period status, availability and conflicts inside locked transactions. A cross-database workforce change after the final Evaluate read remains a race.

The TimeGrid CreateSelection mirror reads its UTC start/end when a DST offset changes, displays those offsets and elapsed duration, then opens a draft with the same instants. ShiftDialog recalculates the duration after an explicit first/second occurrence choice. Cancel closes the draft without a mutation.

An HTTP success status with unreadable JSON after a mutation enters an uncertain-result state because the server may already have committed. A Create Save reads the authoritative Calendar and closes the draft if a matching Shift is found; otherwise it keeps the draft and warns that the result is unconfirmed. A disposable Chromium case forwarded a real committed 201 response, corrupted only its JSON body, and verified one saved Shift with no duplicate request.

For Copy Day/Period, the same uncertain-result transition invalidates the preview and moves Calendar focus to the target date before authoritative reload. For Batch Update/Delete, it clears the stale selection and any Delete confirmation before reload. These transitions do not label the operation successful until a user can inspect persisted data.

Repeat Shift invalidates its preview and focuses its first target date on an uncertain result, then performs the same authoritative reload.

Single Shift Delete checks the authoritative Calendar for its exact ID after an uncertain result. An absent ID closes the editor and informs the user; a still-present ID or failed read preserves the editor for inspection.

Month navigation carries a focused store date separately from the visible grid range. The focused date selects the active period summary; until that exact summary loads, period actions remain unavailable. Individual Shift cards retain their own DRAFT/PUBLISHED editability irrespective of the focused summary.

## Historical disabled move/resize implementation

The following row-drop, move and resize notes describe prior development and tests. They are not reachable through the current Calendar pointer interface. Retain them only as implementation history until the old code is removed or a new user-approved gesture contract replaces it.

For a single-employee diagonal row drop, `RowTargetPreview` computed the target store-local start clock and preserved elapsed duration. `Saving` sent source/target employee IDs with the versioned reposition request. The server obtained the target's current Evaluate snapshot, locked both employee IDs, validated the target's Availability and overlap, then changed date, period and assignment in one Roster transaction. Any rejection kept the original card and assignment; a published or multi-employee date move was refused.

`RowTargetPreview` and pointer release now call one local assessment. If the hovered target is already known invalid, release moves to an inline error state without entering `Saving` or issuing a Shift mutation. A tentative valid target enters `Saving` and is rechecked by the server; local feedback never overrides the backend's current workforce, Availability, conflict or concurrency decisions.

`EmployeeDateDraft` reuses ShiftDialog with an explicit canonical employee ID. The blank cell's pointer click and the focusable '+' button produce the same state. A chip click remains `EditDraft`. Published dates and former employee rows cannot enter this state.

`DateDraft` also reuses ShiftDialog. The Month cell container handles clicks in capture phase because FullCalendar's event overlay can consume blank clicks before `dateClick`; it excludes event cards and overflow links. Date-number clicks still navigate to Day. The period for the clicked date decides whether creation is locked, rather than the summary for the currently focused week. Month pointer selection is disabled to avoid treating a multiday drag as one shift.

All paths into `UnsavedDraft`, `DateDraft` or `EmployeeDateDraft` pass the clicked date through `openDraft`. If that date belongs to a PUBLISHED period, the transition returns to Idle with an explanatory toast and no mutation. Existing Shift Edit has its own published guard; the backend repeats publication checks on write.
## 2026-10-15 dialog context
Opening or retrying a Shift draft now loads Availability keyed from D-1 through D+1 before Save can be enabled. Request sequence and store/date scope guards still discard stale reads. A previous-day row may establish coverage for an early Shift on D; cancel makes no mutation.
## 2026-10-15 Resize pointer target
The time-grid ResizeStart/ResizeEnd path depends on the actual DOM hit target. A clipped 8px end handle let pointer down hit the event anchor and entered MoveShift instead; the handle now sits fully inside the Shift card at 14px. The browser verified one reposition for each edge, preserving the opposite endpoint and the canonical employee assignment.

## 2026-10-15 stale employee-row Move
The Week employee-row gesture keeps the original card in place while awaiting the server. A 409 from an out-of-date Shift version now causes an authoritative Calendar reload, then an error toast. This aligns its reconciliation with time-grid Move/Resize and prevents repeated attempts from using the old visible Shift version. A generated-ADMIN browser red-green run and direct PostgreSQL check verified this transition.

## 2026-10-15 active row-drag scrolling
After the six-pixel activation threshold, EmployeeLaneBoard records current pointer coordinates and runs a frame only while the held pointer is within 72 px of the vertical app-workspace-scroll edge. Each scroll step hit-tests the destination again; moving away from the edge, reaching the scroll limit, pointer-up, Escape, pointer-cancel and unmount stop the frame. The card remains in its original row until the server accepts the drop. Chromium verified both scroll directions with canceled gestures and one saved drop on a row that began outside the viewport.

The active row-drag scroll loop also watches the board's horizontal overflow container. A held pointer within 72px of either horizontal edge scrolls only while that axis can move, then re-hit-tests the target at the pointer. Escape, pointer-cancel, release and unmount stop the shared frame. At 600px, Chromium verified both directions, canceled gestures and one saved cross-date drop.

The active employee-row drag is owned by the pointer ID that started it. Another pointer down cannot replace the owner; move/up/cancel events from another pointer are ignored. A non-primary touch cannot start a gesture. Only the owner's release may enter Saving, and only its cancellation clears the drag. Escape remains an independent cancel path. This prevents a competing pointer from committing a stale or unintended target.

## 2026-10-15 FullCalendar selection cancellation

The time-grid CreateSelection gesture now records Escape or pointer-cancel before FullCalendar emits its final select callback. Cancellation clears the mirror and prevents both select and dateClick from opening a draft. A new pointerdown returns the gesture to Idle. Browser red-green confirmed Escape no longer commits a draft and the next click remains usable. This applies to the FullCalendar grid; employee-row cards have no pointer drag state machine.

## 2026-10-15 CreateSelection range guard

While FullCalendar previews CreateSelection, `selectAllow` rejects a duration below the store minimum, above 24 actual hours or extending beyond the next store-local date. The select commit rechecks the same rule before opening Add. A Week diagonal two-day-plus gesture therefore returns to Idle without a draft. DateClick uses a slot-aligned minimum duration, then enters an unsaved Add draft.

## 2026-10-15 Availability read state in Week employee rows

The employee-row Availability projection has independent Loading, Ready and Error states keyed to current store, visible week and Calendar data revision. A superseded or unmounted request cannot replace current data. Error leaves Shift move/create controls visible, provides Retry and does not claim missing rows are available. Add/Edit keeps its separate fail-closed employee/date Availability read before Save; backend mutation remains authoritative. The Availability marker is passive, so its click enters the existing cell Add path and does not create a second gesture state.

## 2026-10-15 resize reconciliation at repeated local hours

After FullCalendar's resize gesture resolves, `moveShift` verifies one source Shift, computes same-day snapped start/end deltas against that Shift's persisted UTC instants, validates duration, sends one versioned reposition request, and reloads authoritative Calendar on success. A rejected request calls `revert`; conflict/uncertain failures also reload. The fall-back browser probe confirmed an Availability 422 left the card and database at the last accepted time. FullCalendar's `oldEvent.end` may be absent for first/second equal wall clocks, so it is not authoritative for this transition.
