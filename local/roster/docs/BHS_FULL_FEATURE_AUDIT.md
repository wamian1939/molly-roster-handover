# BHS Shift Helper feature audit

## 2026-10-21 Time Slot Script repeated day, read-only

The signed-in Hurstville Time Slot Script converted a synthetic unsaved `HandoverEmployee006<Tab>1AA1BB` into two Monday 26 October rows, AA 10:00–22:00 and BB 10:00–17:00. Submit was enabled, but the visible Rules say duplicate days warn and only one work script is allowed per day. No alert text appeared in the observed dialog. Cancel closed it; no Submit or BHS data write. This proves display and button state only, not whether the BHS server saves, rejects or overwrites either interval. Molly's guarded conflict review is recorded separately in the parity matrix.

## 2026-10-21 Staff Edit Script shortcut length, read-only

Signed-in Hurstville Staff → Edit Preset Time Slot Script → Edit Script displayed three shortcut/time rows (AA, BB, CC), Append, Cancel and Submit. Each shortcut input's visible placeholder said `Max 20 English characters`; Start Time and End Time were separately marked required. DOM inspection found no native maxlength attribute. The dialog was cancelled without editing values or pressing Submit. Molly's previous 12-letter limit has now been aligned to the advertised 20-letter input across its editor, API, save normalizer and parser. Isolated PostgreSQL and normal local browser verified Molly's boundary; BHS server persistence for a 20-letter code remains **NOT VERIFIED**.

## 2026-10-21 Export date-range preview, read-only

In the signed-in Hurstville Export page, no date was selected initially and Export PDF/Export Excel were disabled. Selecting 21 October 2026 enabled export and changed the heading to `21/10/2026~21/10/2026`; clicking 22 October extended a continuous selected range and changed the heading to `21/10/2026~22/10/2026`. The preview updated immediately for both dates. Four visible tabs were `All Shifts`, `Week Shift`, `Job Shift`, and `Staff Shift`; the current preview included date-grouped shifts, job-grouped shifts, and staff work-hour totals. Setting → Shift Export Setting showed PDF template one selected, an alternative template two, Excel normal-hour bounds 08:00–22:00 and Normal Mode selected with Late Hours Mode available. Only tab and date selection occurred. No Export, Update, Save or BHS business-data mutation was invoked; the browser was returned to its original Setting → Preset Shift tab.

Molly's current Export page instead chooses a Roster period/version and employee-safe or manager audience, with CSV and browser print links plus immutable publication history. That history is a Molly requirement to retain. The BHS-style arbitrary date-range preview, four grouping modes, true Excel output, PDF template choice and late-hours mode are not implemented; functional parity for Export remains **PARTIAL**. A future implementation must preserve store authorization, audience redaction and frozen publication snapshots.

## 2026-10-21 Staff manual Record Work Time, read-only

The signed-in Hurstville Staff row menu exposed Edit, Record Time, Script Record Time and Delete. Opening Record Time showed a `Record Work Time` dialog with separate `Set Time For Date` and `Recorded Date` month calendars. The former allowed two future dates, 26 and 27 October 2026, to be selected together in one unsaved draft; the visible time entry defaulted to 09:00–22:00. Several October dates were disabled while others remained selectable, but the interface did not explain the exact disable rule. The single shared time entry and multi-date selection were observed; no Submit was pressed. `Close Exit Without Save` closed the draft, and the BHS tab returned to its original October Month Calendar. No BHS record was modified.

Molly's existing manual Availability editor works over a chosen seven- or fourteen-day cycle with per-day slots. A new separate multi-date dialog now accepts up to 31 selected dates and a shared time range through the existing Roster transaction; isolated browser/PostgreSQL verified non-overwrite and cancellation. BHS's separate recorded-date panel, exact disabled-date rule, save/overwrite behavior and whether `Record Work Time` is exactly the same concept as Molly Availability remain unverified.

## 2026-10-21 Day Add Job default, read-only

On the signed-in Hurstville Day, clicking the visible 09:00 empty slot opened an unsaved Add Shift with Start 09:00, End 09:30 and all six Job checkboxes unchecked. Cancel returned to Day. No Save, Submit or BHS business-data write. This establishes the Add default only; it does not establish that a 30-minute Shift can be saved or that BHS enforces formal qualifications. Molly's new-Shift default was corrected separately and browser-tested in a disposable store.

## 2026-10-21 Preset Shift editor, read-only

The signed-in Hurstville Setting → Preset Shift page still showed AA 10:00–22:00 / 1 h, BB 10:00–17:00 / 0.5 h, and CC 16:00–22:00 / 0 h. Opening `Edit Preset Shift Time` exposed break choices 0, 15, 30, 45, 60, 75, 90, 105 and 120 minutes. `Append` added an unsaved blank-name row with 09:00–22:00 and 0 break. `Cancel` removed the draft row; the three saved presets were unchanged. The reference dialog's `Config Preset Job` title appears inconsistent with its fields and was not copied into Molly. The BHS tab was restored to Calendar with no dialog open. No Submit or BHS business-data write occurred. This is Preset Shift evidence, separate from Availability Time Slot Script shortcuts.

## 2026-10-21 Day drag and Edit reconfirmation, read-only

On the signed-in Hurstville Day, a blank 06:30→08:30 drag opened Add Shift with those exact Start/End clocks. Clicking a saved 10:00–22:00 card opened Edit with matching clocks. Cancel closed each dialog. Setting → Job Info again displayed the same six reference jobs and staff counts listed below. The browser was returned to October Month. This is read-only UI evidence; saved-card drag, Save/Submit behavior and downstream persistence were not tested. No BHS business data changed.

## 2026-10-21 Copy Day unsaved preview, read-only

From the signed-in Hurstville Day, `Batch Operation` opened four tabs. The selected `Copy Day Shifts` tab had separate From and To month calendars. Choosing 21 October 2026 as source and 22 October as target populated `New Shift` with five proposed role/time/employee entries and offered checked `莉小白` and `全岗` Job filters. Save remained disabled. A separate read-only visit to target Day showed four existing Shift cards, but the precise reason Save was disabled was not displayed or established. Cancel closed the dialog; main Day was restored to 21 October and the side-panel date to 4 October. No Save/Submit/Delete or BHS business-data mutation occurred. Molly intentionally keeps Copy secondary and simpler; do not infer BHS conflict or persistence rules from this unsaved preview.

## 2026-10-21 Day panel Job options and Batch Operation, read-only

The Hurstville Job Info list has six rows, but the Scheduled Shift sidebar showed only `莉小白` and `全岗` for 4 October; extending selection to 4–21 October added `带训员`; selecting 21 October alone returned to two. After `莉小白` was unchecked, the newly appearing `带训员` arrived checked and the old exclusion remained. The controls were restored to 4 October with both checked. The account popover exposed Home and Log Out only, then was closed. `Batch Operation` exposed Copy Day Shifts, Copy Week Shifts, Shift Template and Delete Shifts tabs. The Copy Week tab had From/To date groups; Delete Shifts exposed Multiple/Range and a Job Filter. All tabs were inspected without a Save or Delete click; Cancel closed the dialog. This is UI evidence only, not saved-operation parity. No BHS data changed.

Searching `HandoverEmployee011` on the 4 October side panel reduced employee rows to Zoe but left both `莉小白` and `全岗` checkbox options visible and checked. The search was cleared. Thus the observed option list follows the selected dates before name search, matching Molly's current calculation order.

## 2026-10-21 Day side-panel Job filter, read-only

On the signed-in 4 October Scheduled Shift panel, the checked Job options were `莉小白` and `全岗`. Worklog entries for HandoverEmployee004 and HandoverEmployee006 used Shift role `莉小白`. Unchecking `莉小白` while keeping `全岗` checked retained those two employees and their unchanged 6.5 h/5 h Sunday totals. Unchecking both left no rows; both were then rechecked. Thus the observed filter acts on each employee's Job qualification rather than restricting Worklog Shifts by their role. No BHS Save/Submit or data mutation. BHS did not expose enough evidence here to settle inactive-employee or overnight accounting behavior.

A further read-only October Month inspection found 158 visible Shift-label lines and none with an end clock earlier than its start clock. Day was restored to Wednesday 21 October, with 4 October still selected in the panel. The sample therefore does not establish BHS overnight-hour attribution; Molly's start-date accounting remains a documented parity gap, not a claimed match.

## 2026-10-21 Scheduled Shift month/year jump, read-only

The signed-in BHS Scheduled Shift mini-calendar has native month and year selects in addition to previous/next arrows. The month select has January–December values 0–11; the year select exposes 2010–2100. At October 2026, the six Monday-first calendar rows show ISO week numbers 40–45. Choosing November and then 2027 changed only the mini-calendar, retained the previously selected 4 October 2026 staff totals, and left main Day on Wednesday 21 October. The controls were returned to October 2026 and the original single-day selection remained. No BHS Save/Submit or business-data write.

## 2026-10-21 Day Scheduled Shift side panel, read-only

In the signed-in Hurstville Day, the bottom `Sidebar` control opened a right hand `Scheduled Shift` panel and reduced the time grid width. At a 3093 px CSS viewport the open panel measured approximately 805 px wide and the Day grid approximately 1902 px wide; the closed panel measured 0 px. The panel has a month picker, a Monday-first six-week date grid, staff-name search, Job checkboxes and per-employee `Worklog` disclosure. Its date selection is independent of the main Day date: the main heading stayed Wednesday Oct 21 while the panel selected dates. A further read-only check corrected the initial interpretation of multi-selection: clicking 4 October, navigating the mini-calendar to November and clicking 2 November selected **every date from 4 October through 2 November**, and the staff totals expanded to that range. Clicking 3 November extended it; clicking 2 November shortened it; clicking a range endpoint selected that day alone, and clicking the lone selected day again cleared the selection. Clicking an earlier date extended the range backward. Month navigation retained the selected range and did not move the main Day. Searching `HandoverEmployee006` reduced the list to HandoverEmployee006. Expanding a Worklog showed date, Job, net hours, 11:00–17:00 and Break 0h for a 4 October entry. All UI changes were read-only and reversible; 4 October was restored as the selected panel date. BHS screenshot capture timed out, so the evidence is accessibility/DOM state and measured rectangles, not a saved reference image. How BHS attributes overnight hours remains NOT VERIFIED.

## 2026-10-21 Day staff availability read-only follow-up

The still-signed-in BHS Hurstville Day opened an unsaved 08:00–08:30 Add draft. After choosing `全岗`, Shift Staff listed seven people and showed either `No available Time` or a recorded interval such as Maomao 09:00–22:00 and HandoverEmployee006 16:00–22:00. All checkboxes were disabled at 08:00. Entering 16:00–16:30 left all disabled; existing assignments and any minimum-duration rule may also affect eligibility, so this does **not** prove BHS's exact Availability blocking rule. Cancel closed the draft; BHS Save/Submit was never used and no BHS data changed.

## 2026-10-21 read-only Day preset apply and last-slot click

In signed-in Hurstville Day Add, Choose A Preset Shift listed AA 10:00–22:00 / 1 h break, BB 10:00–17:00 / 0.5 h, CC 16:00–22:00 / 0. Selecting AA changed the unsaved Start/End to 10:00:00/22:00:00 and Break to 1 h; Cancel closed it. A separate blank click at 23:30 opened Add with 23:30–23:59 on the same day, then Cancel. No Save, Submit, Delete or BHS data write was performed. These observations prove Add draft prefills, not whether 29-minute shifts can be saved or whether editing Preset Shift updates Time Slot Script shortcuts.

## 2026-10-20 authenticated Day/Week gesture follow-up

At 3093×1670 CSS px on Hurstville's signed-in Calendar, a Day blank 08:00 click opened Add Shift prefilled 08:00–08:30. Day downward 08:00→09:30-slot drag opened 08:00–10:00; upward 09:30-slot→08:00 drag opened 08:00–09:30. Week Wednesday 2026-10-21 downward 08:00→09:30-slot opened Wednesday Add Shift 08:00–10:00. A saved 17:00–22:00 HandoverEmployee006 card click opened Edit with the selected 全岗 Job and HandoverEmployee006 staff. Every dialog was cancelled, with no Save/Submit. Saved-card drag was deliberately left untested because a drop could alter a real BHS shift. Setting → Job Info reconfirmed the six jobs and associated counts listed below. This replaces earlier statements that Day/Week gesture snapping was wholly unobserved; exact saved-card drag, Save/Submit and conflict feedback remain unverified.

Observed 2026-10-20 in the user supplied, already signed in Hurstville Chrome session. This is a read only UI audit. The reference site's Submit, Update, Delete and Export controls were not invoked. Facts below come from visible accessibility state and the built in Help page. Unobserved save semantics are marked **NOT VERIFIED**.

## Navigation and page inventory

The visible left sidebar has five links in this order: Calendar, Export, Staff, Setting, Help. It also has a BH Software brand button, an account/store popover at the bottom, and a Toggle Sidebar control. No nested sidebar links were visible; Setting and Help use page tabs instead. Sidebar hover, collapsed width and icon geometry still need measurement.

| BHS page | Observed controls and behavior | Molly current | Gap / priority |
|---|---|---|---|
| Calendar | Today, Back, Next; Month, Week, Day; date heading; Month grid; Batch Operation; Submit; right Scheduled Shift mini calendar and Sidebar Filter. | `/calendar` has Month/Week/Day and roster workflows. | View geometry, sidebar tools, batch and commit parity need browser comparison, P0/P1. |
| Export | Calendar date range selector, PDF and Excel buttons (disabled until range), All Shifts / Week Shift / Job Shift / Staff Shift tabs, preview image; on page instructions include right click Copy Image. | `/export` exists. | Layout and export mode parity unverified, P1. |
| Staff | Edit Preset Time Slot Script, Add Staff, Selected Rows Batch, search, Toggle Columns, paged table. Columns visible: Name, Job, Level, Note, Work Week Type, Recorded Date. Each row has Edit, Record Time, Script Record Time, Delete menu. Batch menu showed Excel for Time Slot Script. | `/staff` has Evaluate backed employees, manual 7/14 day Availability, bulk script import and a selected-employee Script Record Time action with canonical ID mapping. | BHS row-menu placement, dialog/Submit semantics and table visual parity remain P1; current BHS session requires login. |
| Setting / Store Info | Store name, address, suburb, city, state, country, postcode, telephone, email, ABN, BSB, account; Update Store Info. | `/settings` holds Roster scheduling settings. Evaluate owns store master data. | Retain ownership boundary; only Roster owned settings are editable, P1. |
| Setting / Preset Shift | Store shortcuts AA 10:00–22:00 with 1h break; BB 10:00–17:00 with 0.5h break; CC 16:00–22:00 with 0h break; Edit Preset Shift Time. | Templates and scheduling settings exist separately. | Explicit shortcut configuration is needed for script import, P0. |
| Setting / Shift Export Setting | PDF template selection; Excel normal hours 08:00–22:00; Normal/Late Hours mode; Update. | Export/settings exist. | Config and preview parity unverified, P1. |
| Setting / Job Info | Six ordered Hurstville preset jobs with associated staff counts; Edit Preset Job. | Formal active job choices come from Evaluate; historic draft roles remain separate. | Do not map by label or manufacture Evaluate qualifications, P0. |
| Help | Usage Instructions, Features, Tips tabs. Usage includes six expandable basic steps. Features explains manual Record Time and Script Record Time, editing availability, leavers, editing assigned shifts. | `/help` exists. | Content parity and contextual instructions, P2. |

The six BHS Job Info rows are 带训员 (4), 莉小白 (25), 前台 (0), 培训 (3), 后厨 (0), 全岗 (8). This is a reference store list, not evidence that Evaluate has the same six formal position IDs. In Molly, only Evaluate confirmed formal jobs may be active choices; historic 验收岗/前场 cannot be inferred as equivalents.

The **Edit Preset Job** panel was opened read only. It shows the six ordered job-name textboxes, disabled staff counts, one color choice per job, an Append control, Cancel and Submit. No stable job code or qualification rule was visible. Cancel closed the panel without Submit. Therefore copying four missing names into Evaluate would still require a deliberate official job definition and employee-assignment decision; BHS UI alone does not supply an Evaluate canonical code or grant current staff a formal qualification.

## Calendar evidence and limits

Month at October 2026 showed a Monday–Sunday header, dense shift cards containing role, start/end, break and names, plus the separate Scheduled Shift sidebar. Day/Week now have the direct pointer evidence above. Edit included Job, Tier, start/end, break, preset, note and staff selection. Overlap layout, right click actions, batch save and saved-card drag remain **NOT VERIFIED**. No BHS Save/Submit was invoked.

## Availability script evidence

See [BHS_AVAILABILITY_SCRIPT_SPEC.md](BHS_AVAILABILITY_SCRIPT_SPEC.md). BHS Help explicitly describes Script Record Time as a second path next to manual Record Time. It documents an Excel two column paste, one employee per line, nickname + Tab + weekday/shortcut expressions, Monday=1 through Sunday=7, default next week, duplicate and already recorded date warnings, and one script per employee/day. The Staff toolbar opens a multi employee dialog; the row menu opens a one employee dialog. The toolbar's first tab successfully decoded a synthetic `nickname<TAB>1AA` into a preview, then Cancel discarded it. The reference site's persistence and overwrite behavior are **NOT VERIFIED**.

## Remaining audit work

2026-10-21 read-only Month follow-up: the October 29 date number entered Day. Returning to Month and clicking the blank background of that date opened Add Shift for 29 October with 00:00–00:00 defaults. Cancel closed it; no BHS Save or Submit was invoked. Molly opens the same date from a blank Month cell but uses store opening time and a valid minimum duration. Its empty-Month hint now describes clicking, not dragging. BHS Month save behavior remains unverified.

- Capture same viewport screenshots and computed measurements for BHS and Molly on all major views, including collapsed sidebar.
- Continue Week and Day review for employee rows, context menus, copy and publication without modifying reference data; blank-cell click and bidirectional Day/Week selection have now been observed.
- Inspect BHS Staff manual Record Time and Setting shortcut editor's add/edit constraints. The Script dialog's `New` tab requires a staff SID and converts to an unsaved preview; its Submit persistence semantics remain unverified.
- Compare all page states with Molly in a dated visual parity matrix; keep differences from the user confirmed saved card rule explicit.

## 2026-10-21 Job Info reconfirmation and local authority distinction

Signed-in BHS Setting → Job Info again displayed 带训员 4, 莉小白 25, 前台 0, 培训 3, 后厨 0 and 全岗 8; `docs/evidence/bhs-job-list-cropped-2026-10-21.png` preserves only these job labels/counts. The tab was restored to Staff. No Edit, Submit or Save was used. In the local Hurstville Evaluate workforce, current formal grants shown by Molly are 1,0,0,0,0,1, respectively. BHS associated-staff counts are reference facts, not canonical Evaluate qualifications; the difference remains a business mapping gap until individual grants are confirmed.
