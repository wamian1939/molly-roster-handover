# Calendar Parity Matrix

Last updated: 2026-09-09 (Australia/Sydney)

This matrix was completed before local Calendar implementation changes. ShiftHelper evidence is strictly read-only and anonymized. Parity means comparable workflow clarity inside Molly Roster's own React/data architecture, Chinese UI, `#e9b2b6` brand palette, Floating Layered App Shell and Evaluate-owned workforce contract. It does not mean source or pixel copying.

| Feature | ShiftHelper observed behaviour | Molly Roster current behaviour | Difference | Minimal local change |
|---|---|---|---|---|
| Month | Monday-first, five/seven-column grid, weekend/today/out-of-month tinting, 27px single-line chips, date click enters Day, no observed `+N more` | FullCalendar Month, configurable week start, today tint, date click enters Day, cards include role/time/Break/names, `dayMaxEvents=3` with more link | Molly is deliberately more readable and exposes overflow instead of clipping dense days | Keep Molly structure; refine compact hierarchy only if browser evidence shows crowding |
| Week | Seven columns, full 00:00–24:00, one-hour rows, green now line, overlapping groups side by side; extreme compression on narrow screens | Store-configured opening/closing range and slot interval, now indicator, `slotEventOverlap=false`, internal minimum Week width below 1600px | Molly uses business settings and preserves readable width instead of copying the full-day/narrow-column reference | Preserve settings and horizontal-scroll strategy; verify stable overlap ordering and responsive overflow |
| Day | Full-day hourly grid, six observed blocks with up to five simultaneous columns | Store-configured time grid with drag/create/edit and the same normalized event model as Week | Core interaction parity already exists; Molly has more appropriate store-hour density | Keep; validate five-column overlap and narrow-card fallback |
| Date/view controls | Today/Back/Next plus visible Month/Week/Day buttons; mode resets to Month after refresh | Today/previous/next/refresh plus a compact view select; mobile defaults to Day | Molly view choice is less glanceable than the reference | Replace the view select with a Molly-styled three-button segmented control; keep existing state semantics |
| Drag select | One 09:00→10:00 drag opened Add with exact prefill; Cancel made no write | FullCalendar selection mirror, store-configured snap, dialog prefill; unselect occurs after opening | Existing behaviour is stronger because interval is configurable | Keep data flow; add/retain automated and browser regression for Cancel and Save paths |
| Grouping | In the inspected Week, 14/38 blocks showed multiple staff, max five names; no duplicate exact visible key | `groupShiftsForCalendar` normalizes then groups by date + start timestamp + end timestamp + role ID + Break | Strong parity; Molly additionally validates runtime shape and guarantees arrays | Preserve exact key and `assignments: []`; expand tests, do not regress to assignment-per-event |
| Different Break | No clean same-day/same-time/same-role/different-Break pair existed in the inspected Week | Break minutes are a required grouping-key member | Reference cannot safely prove this edge; Molly contract is explicit | Keep Molly separation by Break and test it |
| Overlap | Complete, partial, containment and touching examples; max five columns; touching endpoints reuse a lane; later events can reuse/expand into free space | FullCalendar non-overlap layout with strict `start,-duration,title` order | Core algorithm is delegated to FullCalendar; regression evidence is thinner than grouping evidence | Retain engine layout; add focused overlap fixtures/tests and browser measurements without a custom positioning rewrite |
| Shift card | Day/Week order is role, time, Break, names; all centered; Break/name gap; overflow clipped | Same four-layer centered structure, role-colour tint, responsive container queries, slash-separated wrapped names | Already aligned; Molly font hierarchy is more compact and brand-consistent | Refine density/tooltip semantics only; keep explicit Break 0h/0.5h/1h and empty-assignment state |
| Break display | Day/Week explicit `Break: Nh`; Month abbreviated `/ Nh` | Explicit `Break: Nh` in every view | Molly is clearer and consistent | Keep explicit label; test 0/30/60 minutes |
| Employee names | Multi-staff names slash-separated; Month name is in accessible description rather than a dedicated visible line | Names visible and centered in all views, wrapping by available width | Molly provides more useful Month context but needs truncation discipline | Keep visible names; cap/tooltip narrow content without hiding the assignment data contract |
| Primary Shift role | Existing event showed one checked Job and one displayed Calendar role | One persisted `shiftRoleId`; radio-chip selector | Correct business-model match | Keep single-select, strengthen the card-like selected state and explain that it controls saved role |
| Job filter | Six colored checkbox-style Job cards, no default selection in Add; two selections remained checked; candidate Staff area changed | No distinct multi-select Job filter; primary role only drives warning/skill evaluation | Reference separates filter semantics from the displayed role more clearly | Add a separate multi-select employee Job filter based on Molly role skill requirements, with clear/all state and explicit copy that it does not change the saved Shift role |
| Staff picker | Candidate cards with checkbox, name, Tier, type/status, availability or existing time and role/skill labels; no percent score detected | Selectable cards with name, type, official score/Tier, three skill percentages, weekly hours, availability, conflict and missing-skill warnings | Molly is richer but can be easier to scan/filter | Retain Evaluate data; add visible result count, hidden-selected notice and role-filter emphasis without overloading each card |
| Level filter | T1–T5 colored independent checks, all selected by default | Single `全部 Tier`/T1–T5 select | Reference supports multi-select but Molly's existing control is compact | Keep single Tier select for now; the high-priority gap is Job filtering, not a new scoring policy or data model |
| Edit Shift | Job/Level/Shift Time/Shift Staff/Break/Preset/Note with Delete/Cancel/Save; Cancel observed without write | Existing dialog supports role, templates, time, Break, notes, multi-staff, two-step delete and save | Functional parity already present; Molly has stronger delete guard and data warnings | Preserve behaviour; ensure new filters never alter saved assignment unless employee cards are explicitly toggled |
| Month compactness | All visible chips rendered; dense mobile days clipped without `+N more` | Three visible events per day then FullCalendar more link; compact cards min-height 60px | Molly is safer but visually taller | Keep explicit overflow; tune card spacing only if it improves 1024/390 without losing Break/names |
| Responsive | Desktop sidebar fixed; mobile collapses; controls wrap; Week becomes 9–20px at requested 390; modal stacks and scrolls | Floating shell collapses navigation; Week has 1232px internal minimum and horizontal scroll; dialog stacks at `lg` and scrolls | Molly intentionally avoids the reference's unreadable narrow Week | Preserve Molly approach; verify no document-level overflow at 1920, 1366, 1024 and tablet/mobile widths |

## Local implementation boundary

The local change is intentionally narrow:

1. Preserve the existing normalized `CalendarShiftGroup` and exact five-field grouping key.
2. Preserve FullCalendar's non-overlap geometry; improve deterministic test evidence rather than replacing the engine.
3. Replace the view dropdown with an accessible, visible Month/Week/Day segmented control.
4. Refine the single persisted role selector without changing `shiftRoleId` semantics.
5. Add a separate multi-select Job filter for employee candidates, with an explicit All/Clear state and OR matching across selected roles' required skills.
6. Make relevant role skills, result count and hidden-selected state easier to scan while keeping score, Tier, availability, conflicts and weekly hours.
7. Preserve Month overflow handling, responsive Week minimum width, reduced motion and all CRUD behaviour.

## Evidence gate

- `SHIFTHELPER_CALENDAR_REFERENCE_AUDIT.md` is complete.
- The ShiftHelper tab was closed after Cancel-based observations.
- The external-system zero-modification ledger is confirmed.
- Local Calendar source had not been changed when this matrix was finalized.
