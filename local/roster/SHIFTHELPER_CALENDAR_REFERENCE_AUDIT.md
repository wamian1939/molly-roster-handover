# ShiftHelper Calendar Reference Audit

Last updated: 2026-09-09 (Australia/Sydney)

## Scope and evidence rules

This is a strictly read-only, anonymized product-behaviour study of the authenticated ShiftHelper Calendar. It records navigation, layout, information hierarchy, non-persisting dialog state, and rendered DOM/layout measurements only.

- No ShiftHelper business data was created, edited, saved, submitted, deleted, published, exported, or batch-operated.
- No staff record, setting, availability, or roster was changed.
- No POST, PUT, PATCH, or DELETE request was invoked or replayed.
- Credentials, cookies, session tokens, authorization headers, employee identifiers, emails, phone numbers, and complete responses were not captured or recorded.
- Employee references in this report are anonymous; real names seen in the UI were not transcribed.
- No reference screenshot was saved. If one is ever required, `.private-reference/shifthelper/` is gitignored and must not become a production asset.
- No ShiftHelper source, bundle, source map, CSS, HTML source, private API, database model, or brand asset was copied.

## Research status and environment

Status: Complete for the authorized read-only study.

- The existing browser session was already authenticated; no credential entry or password-field inspection was needed.
- Reference URL: `https://shifthelper.bhsoftware.com.au/calendar`.
- The page did not change URL while navigating dates or switching Month/Week/Day.
- The browser's responsive capability was set to the requested physical sizes. In this Windows browser session the page reported 1.5 CSS pixels per requested pixel; layout conclusions use the requested viewport labels and relative behaviour rather than treating those CSS values as physical pixels.
- Browser timezone was Australia/Sydney. ShiftHelper did not display a separate Calendar timezone label, so site-level timezone semantics were not inferred beyond the active browser session.

## Read-only activity ledger

| Activity | Result | Persistence control/evidence |
|---|---|---|
| Open Calendar and navigate dates/views | Completed | Today, Back, Next, Month, Week, Day and one date-cell click only |
| Open an existing Shift dialog | Completed | Read fields, then Cancel; Delete and Save were not clicked |
| Drag one empty Day slot | Completed | 09:00 to 10:00, then Cancel; Day event-card count remained six |
| Inspect rendered DOM/layout | Completed | Anonymous counts, dimensions and state only; no response/body export |
| Save/Submit/Publish/Batch operation | Not performed | Prohibited |
| Delete Shift or other data | Not performed | Prohibited |
| Add/Edit Staff, Settings, or Availability | Not performed | Prohibited |
| Export/download employee data | Not performed | Prohibited |
| Mutation API call or replay | Not performed | Prohibited |

## Top control area

| Control/attribute | Observed behaviour |
|---|---|
| Today | Returns the focused date to the current date/month. From October it returned to September 2026. |
| Back / Next | Moves by the active view's unit: one month in Month, one week in Week. The URL stays `/calendar`. |
| Current-date title | Month: `September 2026`; Week: `September 07 – 13`; Day: `Tuesday Sep 08`. |
| Month / Week / Day | Three adjacent buttons at the upper right on desktop. The active button uses a dark teal fill and warm gold text; inactive buttons use a pale surface. |
| Date retained across view switch | Switching Week to Day retained the focused current date. Clicking a Month date changed directly to Day for that date. |
| View retained after refresh | No. Reloading while Week was active returned to Month at the current month. |
| Loading/animation | Navigation updated in place without URL navigation. The transition was short and did not show a blocking loader. |
| Store / roster-period state | The header displayed an active ShiftHelper period of 25/03/2026–24/03/2027 and the current store context. Store/account details are intentionally omitted. |
| Week start | Monday. Month and Week headers run Monday through Sunday. |
| Current date | Today is highlighted with a pale blue date-cell background in Month. |
| Working range / time interval | Time grids show the full 00:00–24:00 day as 24 one-hour rows. No separate non-working-hours shade was found. |

## Month view

### Structure

- Seven columns, Monday to Sunday. September 2026 rendered five week rows (31 August through 4 October).
- At requested 1920 x 1080, each date cell was about 360 CSS px wide and 275 CSS px high in this 1.5-scaled browser session.
- Saturday and Sunday use a pale warm-yellow background. Out-of-month dates use gray. Today uses pale blue.
- Date numbers sit in the cell header near the upper-right edge.
- The main grid fills the available Calendar surface and does not add a separate all-day strip.

### Shift chips

- Shift chips were a single compact row, about 27 CSS px high at the large viewport.
- The visible compact line prioritized displayed role, `start ~ end`, and an abbreviated break such as `/ 0.5h`.
- Staff names were present in the accessible event description, including slash-separated multi-staff descriptions, but were not given a separate visible line in the compact Month chip at the inspected large viewport.
- Chips used one shared lavender family in the observed month rather than a visibly different fill for each role.
- Clicking date `08` switched to Day and focused Tuesday Sep 08. The URL did not change.
- No `+N more` control was present in the observed month. At narrow width the cell layer clipped the long list rather than exposing a clear overflow drill-in.

### Compactness caveat

The inspected September grid contained 82 visible chip backgrounds. At requested 390 px, date cells were about 77–78 CSS px wide and 72 CSS px high while chips remained about 27 CSS px high. The full month fit the width, but dense event content was heavily compressed/clipped and no explicit overflow count was available. This mobile behaviour should not be copied into Molly.

## Week view

- Seven days appear side by side with compact headers such as `07 Mon` through `13 Sun`.
- The focused week title was `September 07 – 13`.
- The grid spans 00:00–24:00 using 24 one-hour rows. At requested 1024 x 768 each hour row measured about 40 CSS px; larger viewports stretched the hour height.
- There was no visible all-day region and no separately shaded non-working range.
- A one-pixel green current-time line crossed the time grid on Today.
- The grid scrolls vertically when the viewport cannot contain the whole day. Week did not preserve a readable minimum column width on the narrowest viewport; it compressed all seven days instead of introducing a useful horizontal-scroll canvas.
- At requested 1920, 1366 and 1024 widths, observed overlapping block widths ranged approximately 66–226, 41–145 and 27–96 CSS px respectively. At requested 390, highly overlapped Week blocks narrowed to roughly 9–20 CSS px and became visually impractical.

## Day view

- The left gutter displays `12:00 AM` through `11:00 PM`, with one row per hour and a full 24-hour canvas.
- Day retains the same vertical-time geometry as Week. A 10:00–22:00 block occupied exactly twelve hourly rows.
- The inspected Tuesday contained six displayed Shift blocks, with up to five concurrent columns.
- At requested 1024 x 768, the six blocks were about 206–209 CSS px wide. At requested 390, they were about 80–83 CSS px wide and still contained role, time, Break and name data inside an overflow-hidden card.
- There was no all-day area. The Calendar's own inner container handled vertical scrolling.

## Empty-slot drag selection

One authorized, non-persisting experiment was performed on an empty Day interval:

1. Dragged downward from 09:00 to 10:00.
2. The Add Shift dialog opened after mouse release.
3. Start and End were prefilled as `09:00` and `10:00`.
4. The URL stayed `/calendar`.
5. Two role-filter toggles were exercised inside the unsaved dialog to verify multi-select state, then Cancel was clicked.
6. Save was not clicked; the dialog closed and the Day event-card count remained six.

The visible grid and resulting prefill support a one-hour snap in this view. A mid-drag screenshot was deliberately not captured, so selection-preview colour and live start/end feedback are not asserted. Upward drag, autoscroll, and minimum durations below one hour were not tested because the safety brief authorized one reference-site drag experiment.

## Shift block information hierarchy

Day/Week used this vertical sequence:

1. Role name.
2. `start ~ end`.
3. `Break: Nh`.
4. Employee name(s).

Observed large-card typography was approximately 22.5 px bold for role, 25 px semibold for time, 17.5 px regular for Break, and 20 px regular for names. Role, time, Break and names were horizontally centered by their own layout rows. A deliberate gap separated Break from names. The outer block clips overflow. Narrow Week columns preserve the same data structure but quickly become unreadable; the site clips through width pressure rather than switching to a strong compact hierarchy.

Multi-staff names were slash-separated in the accessible event description. The inspected Week had 14 multi-staff blocks and a maximum observed five names in one block.

## Grouping decision matrix

The Week sample contained 38 displayed blocks across three displayed role labels. Visible-card analysis found no duplicate block with the same day, start, end, displayed role and Break, while 14 cards contained multiple employees. That is strong direct evidence that equivalent employees are grouped before overlap layout.

| Same date | Same start/end | Same displayed role | Same Break | Observed result |
|---|---|---|---|---|
| Yes | Yes | Yes | Yes | Grouped: multi-staff cards were present and no duplicate exact visible key occurred in the inspected Week. |
| Yes | Yes | No | Yes | Separate: four matching-time/different-role pairs were observed and were laid out as distinct columns. |
| Yes | No | Yes | Yes | Separate: fifteen same-role/different-time pairs were observed. |
| Yes | Yes | Yes | No | Not directly present in the inspected Week. The reference result is therefore not asserted from guesswork. Molly's existing contract continues to require separation by Break. |
| No | Yes | Yes | Yes | Not eligible for grouping within a Day. |

The Month sample showed the same three displayed role labels and explicit 0h/0.5h/1h Break variants, but rendered DOM did not expose stable underlying role IDs. Apparent duplicate display labels were therefore not used to infer a different grouping contract.

## Overlap layout

The Week sample supplied direct examples of complete overlap, partial overlap, containment, touching endpoints, and three-or-more overlaps:

- Maximum concurrency was five columns.
- Four same-time overlap pairs and 61 partial-overlap pairs were present.
- A long 10:00–22:00 block coexisted with multiple shorter blocks, providing containment evidence.
- Touching endpoint pairs reused the same column; for example, a block ending at 17:00 and another starting at 17:00 could share an x-position.
- Column positions were stable from top to bottom, and a later block reused a column after the earlier block ended.
- Widths varied within a day. Where later time ranges had free adjacent space, some blocks expanded horizontally rather than remaining permanently locked to the narrowest peak-overlap width.
- Equivalent multi-staff groups participated as one visual block before overlap columns were calculated.

## Add Shift dialog

The unsaved 09:00–10:00 dialog exposed these sections and actions:

- Job.
- Level.
- Shift Time with native time inputs for Start and End.
- Shift Staff, initially `Shift Staff (0)` for the tested time/filter combination.
- Break control, Preset Shift control and Note textarea.
- Cancel and Save actions.

Save was never clicked.

## Job/role filter semantics

- Six Job options appeared as compact coloured label cards with a small checkbox-style button.
- The control exposes `aria-checked`; selected options use their role colour as the control fill plus a stronger card background/border.
- Default Add state had all six Job options unchecked.
- Clicking the first and second options left both `aria-checked=true`, confirming multi-select filter semantics inside the unsaved Add dialog.
- The filter is linked to the Shift Staff candidate area. For the tested empty 09:00–10:00 interval, the two selected Job filters produced zero matching Shift Staff cards.
- The existing Shift dialog showed one Job filter checked for the inspected event, while the Calendar block still displayed one role. Therefore the multi-select UI should be treated as a staff-filtering/selection aid, not blindly copied as a multi-role persisted Shift model.
- No explicit All/Clear chip was observed.

## Level filter and staff cards

- Level has five coloured T1–T5 checkbox-style controls.
- All five Level controls were checked by default and support independent toggle semantics.
- In the existing Shift dialog, `Shift Staff (7)` represented seven candidate cards, not seven assignments. Each card included its own checkbox selection control.
- Candidate cards were approximately 200–230 CSS px wide by 220 CSS px high at the large viewport, with a compact header and multiple information rows.
- The rendered card structure contained employee name, Tier token, employee-type/status information, availability or assigned-time information, and role/skill-related labels. Some cards showed an availability message; others showed an existing time range.
- No percentage score field was detected in the ShiftHelper card UI. Molly may retain its own score because Evaluate is its authorized workforce/scoring source.

## Existing Shift dialog

The inspected Edit state contained Job, Level, Shift Time, Shift Staff, Break, Preset Shift and Note. It prefilled 10:00:00–22:00:00 for the selected event, showed one Job checked, all five levels checked, and seven staff candidates. Delete, Cancel and Save were present. The dialog was closed with Cancel without changing any field or triggering Delete/Save.

## Responsive observations

| Requested viewport | Observation |
|---|---|
| 1920 x 1080 | Fixed 320-CSS-px sidebar in the scaled session; all six top controls remained on one row. Month filled the remaining width. Week overlap cards ranged about 66–226 CSS px and Day about 480 CSS px. |
| 1366 x 768 | Sidebar remained fixed; controls stayed on one row. Week cards narrowed to about 41–145 CSS px and Day to about 309–312 CSS px. |
| 1024 x 768 | Sidebar still consumed the same width; controls stayed on one row. Month height compressed substantially, Week cards reached about 27 CSS px minimum, and Day cards remained about 206 CSS px. |
| 390 x 844 | Sidebar collapsed and main used the full width. Date navigation and view switching wrapped onto two rows. Month fit horizontally but clipped dense chips. Week forced seven columns into the viewport with 9–20 CSS px overlaps. Day cards were roughly 80 CSS px. The Edit dialog fit the width, stacked sections vertically, required vertical scrolling and created no horizontal document overflow. |

## Conclusions for independent Molly implementation

- Retain Molly's exact date + start + end + role ID + Break grouping contract and normalized `assignments: []` boundary. It matches verified equal-key reference behaviour and is safer than guessing from display labels.
- Keep distinct groups in stable overlap columns, reuse columns at touching endpoints, and allow safe expansion into available horizontal space where the Calendar engine supports it.
- Preserve the hierarchy—role, time, Break, names—but use Molly's own card component, pink brand, Chinese copy, rounded Floating Shell and responsive compact rules.
- Learn from the reference Job/Level chips' checked state and scanability while preserving Molly's single persisted `roleId`. Any multi-select Job filtering must remain explicitly separate from the Shift's primary role.
- Do not copy the reference's narrow Week compression or Month clipping. Molly should prefer readable minimum widths, internal horizontal scrolling and an explicit compact fallback.

## Final external-system zero-modification confirmation

Confirmed before leaving the reference site:

- No Shift was saved or deleted.
- No Save, Submit, Delete, Batch Operation, Publish or Export was invoked.
- No Staff, Setting or Availability data was changed.
- No mutation API was invoked or replayed.
- No employee data was downloaded, exported, copied into project files, or included in this report.
- No reference screenshot was committed or saved.
- Both opened dialogs were closed with Cancel, and the Day view retained its original six displayed Shift blocks after the drag experiment.
