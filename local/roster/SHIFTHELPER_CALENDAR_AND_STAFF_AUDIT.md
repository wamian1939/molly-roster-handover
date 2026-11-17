# ShiftHelper Calendar and Staff read-only audit

Audit date: 2026-09-10  
Reference: `https://shifthelper.bhsoftware.com.au/calendar`  
Method: authenticated browser observation only. Employee identities are anonymised in this document.

## Safety boundary and result

The reference system was treated as read-only. Calendar navigation, view switching, existing-shift inspection, non-persistent filtering and Staff table inspection were used. The existing-shift dialog was closed with Cancel. No Save, Delete, Submit, Publish, Batch Operation, Add/Edit Staff, Settings change, Availability change, Export, mutation request replay or direct POST/PATCH/PUT/DELETE request was performed. No credentials, cookies, tokens, employee identifiers or contact details were recorded. No reference screenshot was added to the repository.

## Calendar controls

- Month, Week and Day are first-class modes in one calendar surface. The selected mode remains visually explicit.
- Today, Back and Next change the active date range without changing the selected view.
- Week titles use a compact date range; the inspected week was shown as `September 07 – 13`.
- The week starts on Monday. Time-grid views expose a continuous vertical day timeline.

## Month view

- Seven Monday-first columns with compact fixed-height event rows (approximately 29 px in the inspected viewport).
- A dense month held more than 80 visible event rows because each row is intentionally one-line, not a miniature Day card.
- The visible priority is role, start/end time and abbreviated Break. Full employee names are available through the event's accessible/hover text rather than consuming a second visible row.
- Role colour families are stable across events. Background, border and text use different strengths of one role hue.
- Dense content remains scannable because vertical margins and card heights are restrained.

## Week view

- Seven days share one time grid. Events keep height proportional to duration.
- Exact duplicate shifts are visually consolidated before overlap placement. Different roles or time ranges remain separate.
- Overlaps form stable side-by-side lanes; completed lanes can be reused by later events rather than forcing the whole day to retain the maximum width split.
- At wide viewport sizes, observed event widths ranged from narrow overlap lanes to wide single-event columns; long events retained legible role, time, Break and staff text.
- A narrow long event may wrap its time line, but typography is not reduced to an unreadable size.

## Day view

- The inspected day contained up to three concurrent lanes.
- Event information order is Role → Time → Break → Staff.
- A representative long event used a large, bold role, a prominent time row, a quieter Break row and a separated, bold staff row.
- Header content stays compact. The staff area begins below it, so the large event body is used more effectively than a small top-only text stack.
- Exact, partial and containment overlaps remain independent unless all grouping fields match.

## Grouping and overlap findings

The reference behaviour is consistent with grouping only when date, start time, end time, role and Break all match. The local implementation must retain this five-field contract. Role, start, end or Break differences produce independent events. Touching endpoints are not overlaps. Overlap layout is applied after grouping.

## Add/Edit Shift dialog

- The inspected dialog is divided into Job, Level, Shift Time, Shift Staff, Break, Preset Shift and Note sections.
- Job is a visually strong single selected control for the shift itself; the selected control uses its role hue.
- Level controls filter candidate staff. Staff selection is a separate multi-select surface.
- Candidate cards show name, level/tier, job tags and availability. Their richer content is intentionally less dense than Staff table rows.
- The dialog clearly separates the shift's Job from staff discovery filters.

## Staff page

- Dense, searchable and paginated table: 30 records in the inspected dataset, 10 per page.
- Visible columns were Name, Job, Level, Note, Work Week Type and Recorded Date, plus action/selection controls.
- Job filter is multi-select; Level and Work Week Type are compact single-select filters. Column visibility is configurable.
- Search updates the result set immediately and supports a zero-result state.
- Row heights expand for wrapped date/status tags; table density is otherwise substantially higher than the dialog's staff cards.
- On narrower screens the wide table stays internally scrollable instead of widening the page body.
- Calendar role colours are stronger and more consistent than the plain Job tags observed in the Staff table; Molly should improve cross-page colour consistency rather than copy that weakness.

## Responsive observations

- Desktop layouts were inspected at requested 1920×1080, 1366×768 and 1024×768 sizes.
- At smaller desktop/tablet widths, the Staff table preserves a wide internal canvas with horizontal scrolling and no body overflow.
- The reference mobile behaviour is not a quality target. Molly retains its own Floating Layered App Shell and responsive dialog conventions.

## Patterns adopted, not copied

- Adopt: view-specific information density, role-colour consistency, compact event header plus staff body, separation of shift role and staff filters, dense Staff discovery.
- Do not copy: role names, employee data, source code, CSS, HTML, API design, brand assets or visual styling.

