# ShiftHelper interaction parity — 2026-10-09

## 2026-10-21 duplicate-day Script dry run

Read-only BHS Staff Convert of `HandoverEmployee006<Tab>1AA1BB` showed both 26 October AA and BB rows with Submit enabled, while Rules say a duplicate day warns and only one work script is allowed per day. Cancel closed the synthetic draft. Molly now lists both candidates as conflicts with one issue and refuses Commit; the direct service rejects the same duplicate even if the windows do not overlap. This is **INTENTIONAL DIFFERENCE / safety** until BHS Submit is verified. [Local screenshot](evidence/molly-script-duplicate-day-preview-2026-10-21.png); isolated PostgreSQL 240/240 and unchanged normal-data digests. No BHS business data was changed.

## 2026-10-21 populated Time Slot Script preview

Signed-in BHS Staff converted the unsaved synthetic `HandoverEmployee006<Tab>1AA2AA34567AA` into seven AA preview rows for 26 October–1 November, then Cancel closed the dialog. In Molly, successful Preview now collapses the shortcuts overlay and fits all seven local rows in the right result panel at the matched desktop viewport. The previous expanded overlay obscured the result. The focused red/green regression, normal Chrome and unchanged Roster database digests support the local fix. BHS Submit persistence and real store-account acceptance remain unverified; no BHS data was changed.

## 2026-10-21 Day read-only reference and touch gap

Signed-in BHS Hurstville Day on 21 October showed a single 24-hour time axis and five saved cards; a blank 07:00-to-08:30-slot drag opened Add Shift at 07:00-09:00. Cancel closed it without Save/Submit. Molly's mouse Day drag opened the matching selected time span on its own 10:00-11:30 trial and was cancelled. A local simulated second touch exposed a Molly touch-end coordinate exception, now guarded with first-pointer ownership and touch coordinates; replay no longer throws. This verifies a safety fix, **not** physical touch selection parity or BHS persistence. BHS saved-card dragging and server Submit remain untested.

## 2026-10-21 configured Molly Day interaction regression

Normal local Chrome confirmed a blank 10:00 click opens a 10:00–10:30 Add draft and a 10:00-to-12:00-slot drag opens 10:00–12:30, both cancelled with zero normal-data writes. Six current formal jobs appeared in the dialog. The saved-card click-only rule and compact toolbar remain as previously tested below. No BHS operation was performed in this checkpoint; BHS server Submit and real store account/device acceptance remain parity gaps.

## 2026-10-21 Molly 30-minute Day browser persistence

Molly current-source local Chrome and disposable PostgreSQL now verified the full click -> Add -> formal role/available employee -> UI Save -> reload -> card click/Edit chain for 13:00-13:30, with exact UTC endpoints, one new Shift/assignment and unchanged published history. The earlier note below saying browser Save/reload was untested is superseded for **Molly's isolated QA stack**. This is not evidence that BHS server Submit accepts 30-minute Shifts; BHS remained read only. Real store evaluator and device acceptance are still outstanding.

## 2026-10-21 Hurstville 30-minute Day click alignment

The local Hurstville store setting was guardedly changed from a 60-minute to a 30-minute minimum, matching its existing 30-minute grid and the observed BHS Day blank-click Add prefill. Normal local Chrome now opens a 09:00–09:30 Add draft from a 09:00 blank click; Cancel produces no Shift. The update was limited to the local Hurstville settings row with a backup and version check; Shift/assignment/publication counts stayed 13/23/2. A separate disposable real-PostgreSQL service save persisted an exact 30-minute Shift and left the publication unchanged. **Molly browser prefill and backend save tested; browser UI Save/reload and BHS server Submit for 30 minutes are not yet tested.** The older 60-minute discrepancy notes below describe the state before this adjustment.

## 2026-10-21 read-only loaded BHS frontend evidence

The signed-in Chrome tab's already loaded `index-B-sFzmgE.js` was read through Chrome's debugger without navigating Calendar or sending a BHS mutation. Its `ReactBigCalendar` config has `step:30`, `timeslots:2`, `selectable:true`, `onSelectSlot` opening Add with the selected start/end, and `onSelectEvent` opening Edit. There is no drag-and-drop wrapper in this Calendar invocation. This corroborates the user's click-only saved-card rule and 30-minute blank-slot prefill. The Add form's Save handler checks Job, staff, and `start < end`, then appends/updates the frontend Shift list; the visible form schema has no minimum-duration field. This is **frontend staging evidence only**: BHS Submit/server acceptance of a 30-minute Shift is unobserved. Molly Hurstville still uses its configured 60-minute minimum, so Day blank-click prefill remains a documented difference. No BHS Save, Submit, Delete, or setting change was performed.

## 2026-10-21 Day drag and local role alignment

| Interaction | Direct BHS observation | Molly status | Remaining evidence |
|---|---|---|---|
| Blank Day drag downward | 07:10→08:40 prefilled 07:00–09:00; 07:20→08:05 prefilled 07:00–08:30 | Existing 30-minute TimeGrid pointer conversion and disposable browser gesture regression; normal authenticated Hurstville Day drag opened 09:00–10:30 with six roles, then Cancel | No BHS Save; the two systems were not compared at identical pointer coordinates in the same viewport. |
| Blank Day drag upward | 09:20→08:05 prefilled 08:00–09:30 | Existing upward exclusive-end conversion and tests | BHS saved Shift drag remains untested; Molly saved cards remain click-only per user. |
| Hurstville Job choices | Six Job Info entries; staff counts 4/25/0/3/0/8 | Six Evaluate formal definitions and six matching Roster Shift Roles by code; `验收岗` inactive | Employee grants and skill requirements are not inferred from BHS counts. |

Current Settings presentation: BHS Job Info puts the six numbered Jobs before its Related Staff List. Molly now likewise presents its six Evaluate-backed formal jobs first; the 11 old-role draft Shifts are reachable through a collapsed review section below. This is a local information-hierarchy correction, not a claim that the employee qualification counts match BHS. Normal Chrome verified closed/open states and the three historical source links; no data mutation occurred.

Every reference Add form above was cancelled. Read-only Job editor also showed selected color families lime, pink, red, amber, cyan, violet in that order and was cancelled. No BHS Save, Submit, Delete or data edit occurred. BHS screenshot capture timed out; AX/DOM values and form controls are the direct evidence.

BHS blank Day click can show a 30-minute Add draft. In the authenticated local Hurstville Day browser, clicking the 09:00 empty slot opened 09:00–10:00 with the six matched roles; Cancel closed it without saving. Molly applies its configured 60-minute minimum to the click prefill. BHS Save acceptance for a 30-minute shift was not tested, so the minimum-duration policy remains an explicit parity and business-rule gap rather than an inferred setting change.

## 2026-10-21 read-only BHS Day evidence

| Interaction | BHS observed | Molly current-source | Gap / verification |
|---|---|---|---|
| Day top controls | Today, Back, Next, date heading, Month/Week/Day; no Copy | Date/view controls, Copy/Repeat under More | Main-row priority matches; secondary entry differs. Read-only BHS AX and local browser. |
| Saved Shift click | Opens Edit Shift with Job, Level, time, break, preset and staff | Opens existing editor | Local Day click/edit/reload and direct PostgreSQL passed. BHS saved mutation untested. |
| Saved Shift footer | Delete, Cancel, Save; no Copy/Repeat | Delete, Cancel, Save; Copy/Repeat in “其他操作” | Primary action order aligned; Molly retains secondary tools. Local browser opened both and cancelled, zero writes. |
| Hurstville Job Info | 带训员、莉小白、前台、培训、后厨、全岗 | Evaluate local catalog has six definitions; four added jobs have zero employee authorizations. Roster now has six matching scheduling roles. | Catalog and code mapping aligned; employee grants and skill requirements remain separate. |

BHS observation used the signed-in Chrome session read only. Only Cancel was used to exit an unsaved edit; no reference record was saved, submitted or deleted. The BHS screenshot API timed out, so the direct AX state is the reference evidence, not a visual pixel comparison.

2026-10-21 Day saved-edit concurrency: Molly current-source Chromium clicked an existing 10:00–22:00 card, saved 11:00–22:00 and reloaded. Two sessions then showed stale input 13:00 retained after HTTP 409 while the winner's 12:00–22:00 persisted; direct disposable PostgreSQL confirmed version 3, unchanged employee and publication. Day/Week blank selection and saved-card non-drag toolbar regression passed with zero writes. The top row has date/view controls only; Copy remains secondary. **Molly TESTED; BHS concurrent save, Copy and published-save behavior NOT VERIFIED.** BHS data was not changed.


2026-10-21 narrow Day sidebar: Molly's stacked sidebar used to open outside the 640px viewport (heading y=2429px). Its responsive opening now brings the heading to y=84px at 640px and about y=83.5px at 1000px while preserving wide desktop Calendar position. Narrow blank 08:00 click, 08:00–09:30 drag and saved-card click passed with zero writes in synthetic Chromium/PostgreSQL. **Molly TESTED; BHS narrow-sidebar behavior NOT VERIFIED.** BHS was not operated or changed.

2026-10-21 Availability Script joined punctuation nickname: Molly now routes `Tea (Nick)1AA2AA34567AA` and `Tea (Nick)1234567AA` to an explicit employee chooser and can commit exactly seven canonical Availability rows. Focused parser and synthetic Chromium/PostgreSQL passed. **Molly TESTED; BHS punctuation-name parsing and Submit persistence NOT VERIFIED.** BHS was not operated or changed; the Windows browser URL-confidence policy ended the prior read-only observation attempt before any reference action.

2026-10-21 Day sidebar-open gestures and focus: Molly's common desktop browser now retains the same 08:00 lane position after cancelling Add, then supports a live 08:00–09:30 blank drag and saved-card click while the scheduled sidebar remains open. The pre-fix Dialog focus restoration scrolled the lane from y=509.125px to y=-25.875px; `preventScroll` fixed that. Current-source synthetic ADMIN/PostgreSQL, zero Roster writes/page errors. **Molly TESTED; this exact BHS Cancel/scroll behavior NOT VERIFIED.** User-directed saved-card click-only behavior remains; no BHS data changed.

2026-10-21 Day sidebar opening: the read-only BHS reference image shows the Day calendar top at about y=143px with its scheduled sidebar open. Molly initially scrolled its calendar top to y=-154px when the user opened the below-grid sidebar. Current-source synthetic Chromium after the fix measures y=137px in the matching viewport and y=129px at 1600×1100, while retaining five Shift cards and five employee cards and issuing zero Roster writes. **Molly browser tested; BHS visual geometry observed from prior private capture.** Full interaction/visual parity and BHS save effects remain unverified; no BHS data changed.

2026-10-21 Molly Day/Week saved-card double-click: fresh disposable Chromium reproduced a dialog that opened on the first press and closed on the second press against its newly mounted backdrop. A focused red/green Dialog regression and current-source browser check now keep one appropriate Edit or grouped-chooser dialog visible in both views; a later ordinary backdrop press still closes it. Saved-card drag stays disabled and direct PostgreSQL retained all original Shifts/publication. **Molly TESTED; BHS saved-card double-click NOT VERIFIED** because the reference Shift must not be mutated. The current BHS Export range and grouped preview were observed read-only and remain a separate P2 partial feature gap.

2026-10-21 signed-in BHS Settings recheck: the current Staff sidebar had the five expected links; Setting → Job Info still listed `带训员`, `莉小白`, `前台`, `培训`, `后厨`, `全岗` with staff counts 4/25/0/3/0/8. Setting → Preset Shift still listed AA 10:00–22:00/60-minute break, BB 10:00–17:00/30, CC 16:00–22:00/0. This confirms the earlier reference snapshots without establishing a mapping to Evaluate's formal catalog or BHS saved-operation semantics. The reference visit consisted only of navigation/tab selection; no BHS form edit, Submit, Save or data mutation. Calendar navigation was avoided due its possible automatic settings write. Molly's Day-first minimal top controls and secondary footer Copy actions remain the user-directed behavior.

2026-10-21 Week adjacent-column correction: Molly previously opened Add 11:00–10:30 next day when the pointer crossed from Thursday 11:00 to Friday 10:00. Current-source isolated Chromium after the guard showed no dialog or Shift write, while same-column drag and the explicit overnight form still worked. **Molly tested; BHS adjacent-column behavior NOT VERIFIED.** No BHS action/data change.

2026-10-21 Week DST follow-up: fresh synthetic Chromium verified the same Molly upward initial-slot boundary in Week on Sydney spring-forward/fall-back Sundays, with matching live mirror and Add clocks. A Sunday-to-Saturday cross-column drag opened no Add, and guarded PostgreSQL found zero writes. This supersedes the historical note below that Week DST upward equals downward. **Molly tested; BHS DST reference NOT VERIFIED.** Real store account/device acceptance remains open; no BHS data changed.

2026-10-21 Day DST upward consistency: Molly now applies its established exclusive initial-slot boundary on Sydney clock-change dates. Synthetic Chromium confirmed fall-back 03:30→02:00 produced matching mirror/Add 02:00–03:30 (2h30m actual), and spring-forward 04:00→03:30 produced matching 03:30–04:00. One fall-back Shift survived Save/reload with exact UTC/employee/publication proof. **TESTED for Molly's local directional consistency**; the older note below that Week DST upward equals downward describes a prior implementation. BHS DST pointer behavior was not observed, so this is not a reference parity claim. Its repeated-hour grid axis and real store/device acceptance remain open. No BHS write.

2026-10-21 Day direction correction: the earlier section saying Molly's ordinary upward endpoint remains a gap is superseded. The previously observed BHS 30-minute rule was downward 08:00→09:30 = 08:00–10:00 and upward 09:30→08:00 = 08:00–09:30. Fresh isolated Molly Chromium tested the same relative slots inside its valid store hours: downward 10:00→11:30 = 10:00–12:00 and upward 11:30→10:00 = 10:00–11:30, with mirror and Add clocks identical and Cancel zero-write. A separate upward Shift was persisted/reloaded with direct UTC/canonical-employee/immutable-publication proof. **Status: TESTED for the observed directional endpoint rule on an ordinary 30-minute Day grid.** BHS Save/Submit, DST-day pointer parity and real store-account/device remain unverified. No new BHS Calendar navigation was made because it may automatically write settings.

2026-10-21 Molly overnight Worklog: an isolated Sydney Day fixture previously displayed `22:00–02:00` without an end date. Molly now shows `22:00–11月1日 02:00`, with store-local Adelaide and year-boundary unit coverage. Current-source Chromium and guarded PostgreSQL passed with zero writes and unchanged UTC Shift instants. **BHS overnight Worklog display has not been observed**; this is a Molly clarity fix and remains a reference parity gap. No BHS action was taken.

2026-10-21 Day Scheduled Shift Worklog: the previously captured BHS Day image shows a clear Worklog strip on each employee card. Molly's prior compact summary opened on click but did not signal the action. Molly now has a visible Worklog strip, total-hours panel and keyboard-operable native disclosure; isolated desktop/640px Chromium verified mouse and Enter, with the narrow expanded entry fully within the side panel. Published snapshot names and formal Job filters retain their existing logic. This closes a local affordance gap, while BHS's exact visual treatment and real-account/device behavior remain unverified. No reference-system write.

2026-10-21 Molly keyboard check: disposable Chromium confirmed saved Day cards are keyboard focusable and Enter opens the chooser, Escape closes it, and footer Add opens with keyboard alone. During a held local refresh, Enter did not open stale Shift details. Zero writes and unchanged PostgreSQL versions. BHS keyboard behavior was not observed; this is local accessibility/interaction evidence rather than a reference parity claim. No BHS data was modified.

2026-10-21 Molly Day refresh hardening: a held local Calendar GET reproduced a stale-card Edit dialog while the grid was busy. Saved-card and overnight continuation clicks now wait for the same-date read/save to complete, then open normally. Red/green isolated Chromium and guarded PostgreSQL passed with zero writes. BHS behavior under delayed refresh is unobserved; this is local correctness work, not a BHS parity claim. No BHS data was modified.

2026-10-21 Molly Day count correction: in a 50-person disposable fixture, all five pages and last-employee search worked, but source audit found the employee filter's old Shift count included other dates loaded with the period. Molly now labels page-visible / view-visible Shifts using store-local day boundaries; browser confirmed 20/100 on every page and 2/100 for a searched employee, with zero writes. BHS's Day count/paging semantics were not observed, so this is a Molly correctness fix rather than a 1:1 parity claim. No BHS data was changed.

2026-10-21 Molly overnight cue: Day already showed a 31 October 22:00–1 November 02:00 continuation. Its optional Scheduled Shift mini-calendar now marks both overlapping store-local dates; next-day-only selection explains that the current work-hour summary still attributes hours to the Shift start date. Fresh disposable Chromium/PostgreSQL, exact-midnight and Sydney DST tests passed. **BHS overnight hour attribution is unobserved**, so this is a local clarity/cross-day fix, not a 1:1 accounting claim. No BHS data was touched.

2026-10-21 current-source Day/Week regression: synthetic Chromium confirmed saved cards resist drag and text selection, retain position/data, then open detail on click. Blank Day gesture tolerates 3 px movement and Escape/pointercancel clears selection; direct PostgreSQL stayed unchanged. These follow the user's click-only saved-card rule; BHS saved-card drag remains deliberately untested because its data cannot be modified. Copy preview is additionally scoped to the active store.

2026-10-21 Molly Copy Day follow-up: its footer dialog now runs a debounced read-only preview on open/date change. The optional Check control remains for retry, while stale responses and 503 failures cannot enable Copy. Fresh isolated Chromium and direct PostgreSQL passed; see [Browser QA](ROSTER_BROWSER_QA.md). This is a user-directed simplification, not a claim about BHS saved Copy behavior. Day's main row stays focused on date and view navigation; no BHS data was changed.

2026-10-21 current-source browser recheck: Month blank create saved one Shift with explicit Job, survived reload and reopened Edit; Week blank 11:00 opened a correctly timed unsaved form with no Job auto-selected, then Cancel produced no second Shift. Published dates blocked creation in Month/Day/Week. Day top had no Copy button; Copy remains a secondary footer action per the user's product rule. A separate disposable browser saved/reloaded a Day Shift from a 120-minute-break preset after explicit Job selection. This verifies Molly behavior, not any unobserved BHS Save/Copy effect; see [Browser QA](ROSTER_BROWSER_QA.md).

## 2026-10-21 Day new-Shift Job default

Read-only signed-in BHS Day 09:00 Add showed all six Job checkboxes unchecked before interaction; Cancel left no draft or data write. Molly had silently preselected its first verified role. A red component test reproduced this, then a current-source disposable browser confirmed Molly now requires an explicit Job choice: Save without one shows a clear prompt and sends zero Shift requests; selecting an Evaluate-verified role and available employee saves once and survives reload. Existing Edit/Copy continue to retain their source role. BHS Save/Submit effects were not tested.

## 2026-10-21 signed-in Day Add staff eligibility, read-only

On BHS Day, clicking a blank 09:00 slot opened an unsaved 09:00–09:30 Add dialog. After selecting the formal Job 全岗, its staff chooser enabled HandoverEmployee007 (shown available 09:00–22:00) and disabled staff with no available time or a later 16:00 start. Cancel closed the draft; no BHS Save, Submit or data mutation occurred. This supports the need for Availability-aware employee choices in Molly. It does **not** establish whether a saved 30-minute BHS Shift is allowed or how BHS handles a later Availability change. Molly retains the local 60-minute Hurstville minimum pending authoritative evidence.

The current-source Molly browser also verified that a same-name historical `qa-front` role is not silently promoted when Evaluate introduces `official-front`. Explicit Settings association created one selectable official role while legacy draft Shifts remained for review. That is a data-ownership safeguard, not a claim about BHS internal mapping behavior.

## 2026-10-21 Day draft save-limit evidence and empty Job state

| Interaction | BHS reference evidence | Molly verified behavior | Gap | Priority / verification |
|---|---|---|---|---|
| Day 08:00 blank click | Unsaved Add draft 08:00–08:30, break 0; Save control appeared enabled without Job or staff | Store opening/minimum-duration rules still guard a saved Shift | BHS actual 30-minute Save result unobserved; do not infer accepted duration from button state | P1 / read-only BHS draft |
| Day Add with no verified Job | BHS Job Info has a separate catalog; no comparable empty catalog observed | Shows Evaluate/Roster mapping explanation and disables Save | Formal catalog reconciliation and real account remain open | P0 / synthetic STORE_EVALUATOR browser + 26 focused tests |

BHS draft was cancelled and its original Month view restored. No BHS business data was changed.

## 2026-10-21 Day interaction and toolbar update

| Interaction | BHS observed behavior | Molly current behavior | Remaining gap | Verification |
|---|---|---|---|---|
| Day blank click | Add Shift draft at the clicked time; 08:00–08:30 showed Break Time 0 | 10:00 blank click opened 10:00–10:30 draft with no break in isolated browser | Hurstville's 60-minute minimum still differs from this BHS draft; saved 30-minute BHS behavior unverified | Read-only BHS draft; synthetic Molly Chrome |
| Day blank drag | Drag creates a time-range Add draft | 10:00–11:30 drag opened matching draft; Cancel left 0 Shifts | Real device and account acceptance | Synthetic Molly Chrome; prior BHS read-only draft |
| Saved card gesture | User clarified cards should be clicked, not dragged | Day/Week saved cards are click-only; form editing is the alternative | BHS saved drag semantics are not adopted under the later user rule | Source and prior browser regression |
| Copy and top controls | Copy is secondary per user priority | Copy Day/Week in lower `排班操作`; top groups date navigation and Month/Week/Day | Further Copy parity is lower priority | Browser UI and source |

Read-only BHS Day Add remained at Break Time 0 after changing an unsaved 08:00–08:30 draft to 08:00–10:00, then Cancel. Local Hurstville default break was changed 30→0 with backup and version check; existing Shifts and publications were untouched. BHS data was not changed.

## 2026-10-21 Day drag-create persistence recheck

Molly current-source browser and disposable PostgreSQL again verified the user's required blank-grid drag-create chain under a synthetic STORE_EVALUATOR: 10:00–11:30 draft, one POST/one saved Shift, exact Sydney-to-UTC interval, canonical employee, reload and click-to-edit at the same clocks, with published Calendar unchanged. ADMIN only bootstrapped isolated test data. This is new local evidence for an already implemented Day interaction; it does not add a BHS saved-operation or real-account claim. Saved cards remain click-only under the user's rule. BHS was not modified.

## 2026-10-21 Preset Shift break parity

Signed-in BHS Preset Shift editor, observed without Save: Break Time offered 0 through 120 minutes every 15 minutes; Append made an unsaved 09:00–22:00 / 0-break row, then Cancel removed it. Molly's template and Shift dialog now offer the same break increments and preserve legacy stored values outside this range. Its new-template form now defaults to the observed 09:00–22:00 / 0. Disposable current-source browser/API/PostgreSQL verified that default and a 120-minute template applied and saved in Day. **Remaining gap:** BHS Submit propagation and saved template semantics remain unverified. Preset Shift and Availability Time Slot Script are different workflows. No BHS data changed.

## 2026-10-21 additional signed-in Day reference check

On BHS Day, a blank 06:30→08:30 time-axis drag opened one unsaved Add Shift with Start 06:30 and End 08:30. Clicking an existing 10:00–22:00 card opened Edit with those exact clocks. Both dialogs were cancelled. Setting → Job Info again listed the six Hurstville jobs documented below; returning through Calendar restored October Month. No BHS Save, Submit, Delete or business-data mutation occurred. Molly's already implemented blank-grid selection, click-only saved cards, secondary Copy and Evaluate-gated formal job choices remain the intended behavior; this check adds reference evidence, not a new persisted Molly browser test. BHS saved-card drag and saved-operation semantics remain unverified.

Current local Evaluate catalog readback confirms only 全岗 and 带训员 as active formal Hurstville jobs, with one distinct active employee formally assigned. The six BHS labels therefore remain a **data/catalog parity gap**, not permission to create four official Evaluate jobs or infer staff qualifications. The inactive Roster 验收岗 remains linked to eight historical draft Shifts; those snapshots were preserved.

## 2026-10-21 Molly Day overlap refresh guard

Molly current-source Chromium refreshed an existing five-card overlapping Day after four fixture cards were removed in isolated PostgreSQL. The surviving card recalculated from one-third width to nearly full width without browser reload; no product reflow change was needed. A separate current-source Day/Week saved-card drag check recorded no mutation or card movement, and click opened detail. This strengthens Molly regression evidence for its user-confirmed click-only saved-card rule. Direct BHS saved-card drag behavior remains unverified because a reference drop could alter live data; BHS was not changed.

## 2026-10-21 Copy Day preview distinction

BHS was inspected read-only on signed-in Day. `Batch Operation → Copy Day Shifts` has source and target mini-calendars. Selecting 21 October 2026 and 22 October 2026 populated five proposed Shift rows and checked `莉小白`/`全岗` Job filters; Save remained disabled. The target Day had four existing cards, but the cause of disabled Save is not established. Cancel closed the reference dialog, and the prior Day and selected side-panel date were restored. Molly retains the user's simpler secondary Copy dialog, which shows copyable count and specific blockers, without BHS's per-Job row filtering. Its duplicate blocker suffix now says `项相同问题`, not a Shift count. This remains **PARTIAL / INTENTIONAL DIFFERENCE**, with BHS Save behavior **NOT VERIFIED**. No BHS business data changed.

## 2026-10-21 Day toolbar and secondary Copy follow-up

The signed-in BHS Day primary row was inspected read-only again: Today, Back/Next, focused date and Month/Week/Day are visible; Copy is absent from that row. BHS screenshot capture still timed out, so typography and spacing are not established by a paired image. Molly's main row now keeps date navigation, view switch and one accessible `排班操作` icon; Copy Day and previous period stay inside that secondary menu. The Job-color legend no longer competes with the Day controls. Copy previews now show Shift count and concrete blockers while preserving server checks and atomic commit; duplicate reasons are grouped with their issue count. Isolated Chrome proved Enter activation, Copy Day 0/2 blocked for an unsupported historical Job, blank Day drag-create draft/cancel and saved grouped card click/chooser. [Molly Day screenshot](evidence/molly-day-simplified-toolbar-2026-10-21.png), [Copy preview](evidence/molly-copy-day-simplified-preview-2026-10-21.png). BHS saved Copy semantics remain **NOT VERIFIED**; no BHS data was changed.

## 2026-10-21 Date-scoped sidebar Job options

| Interaction | BHS read-only behavior | Molly current behavior | Verification | Remaining |
|---|---|---|---|---|
| Change selected side-panel dates | Six Jobs exist in Hurstville settings, but the panel offered only `莉小白`/`全岗` for 4 October, added `带训员` for 4–21 October, and returned to two for 21 October. Newly appearing `带训员` was checked while manually unchecked `莉小白` stayed unchecked. | Offers only active Evaluate Jobs held by scheduled employees in the selected range; stores explicit exclusions so new options start checked. Filtering acts on employees after full-hour aggregation. | BHS reversible date/checkbox clicks; generated STORE_EVALUATOR Chrome and isolated PostgreSQL with three formal Jobs, one unscheduled; [Molly screenshot](evidence/molly-day-date-scoped-job-selection-2026-10-21.png). | Inactive/transferred BHS staff and overnight accounting remain unverified. |

BHS was returned to 4 October with both options checked; no Save/Submit or business-data write. The earlier section below describes the employee filter semantics; this section adds the observed option-list and checkbox-transition behavior.

## 2026-10-21 Day Scheduled Shift Job filter: observed semantics

| Interaction | Reference behavior observed read-only | Current Molly behavior | Verification | Remaining gap |
|---|---|---|---|---|
| Sidebar Job checkbox | Filters employees by their formal Job qualification. Selecting only `全岗` retained HandoverEmployee004 and HandoverEmployee006 with their complete Sunday totals even though their Worklog Shift roles were `莉小白`. No Jobs selected showed no employees. | Filters employee summaries by current Evaluate `positions[].id` after all Shift hours are aggregated. The Job options come from Evaluate's active store catalog, not historical Roster Shift roles. | Signed-in BHS DOM after reversible checkbox clicks; generated STORE_EVALUATOR current-source Chrome with two separate formal Jobs and one shared old Shift role; [Molly screenshot](evidence/molly-day-formal-job-filter-2026-10-21.png). | BHS account-specific inactive/transferred employee behavior and overnight attribution remain unverified. |

Both BHS checkboxes were restored; no BHS Save/Submit or data write. The earlier passages below that describe filtering by *Shift role ID* are superseded by this observed behavior.

BHS also lists each employee's formal Job names beside the name. Molly now labels the current Evaluate positions under each employee (`正式岗位：…`), separate from the stored Shift role in Worklog. A third isolated Chrome run confirmed Bob/QA Service and Alice/QA Training, both 4 h; [display screenshot](evidence/molly-day-employee-formal-jobs-2026-10-21.png).

## 2026-10-21 Scheduled Shift month/year jump

BHS read-only inspection confirmed native month/year selects, previous/next arrows and six rows with ISO week numbers. Direct month and year jumps retained the selected date range and did not navigate the main Day. Molly now offers the same side-panel navigation and week-number cues within its own styling. Current-source isolated browser jumped October 2026 → November 2026 → November 2027 → October 2026 while main Day stayed 9 October 2026 and the original Bob/Alice 4 h totals remained. At the 3093 × 1670 CSS px comparison viewport, Molly's panel was 801.59 px against BHS about 805 px. [Molly screenshot](evidence/molly-day-sidebar-month-year-2026-10-21.png). BHS overnight-hour attribution remains unverified.

## 2026-10-21 Scheduled Shift sidebar reference

Range-safety follow-up: BHS was observed using a continuous 4 October–2 November selection, but its maximum selectable span is not verified. Molly keeps that observed interaction and now rejects a selection over 366 continuous days with a visible message, retaining the previous range. Current-source disposable Chromium selected October 2100 from an October 2026 Day and verified zero additional Calendar requests and zero writes after the distant date click. This is a Molly reliability limit, not a claimed BHS parity rule.

BHS Day has a separate right hand `Scheduled Shift` panel controlled by a button below the grid. Its date selection is independent of the main Calendar date and forms one **continuous inclusive range** between selected endpoints. Read-only clicks from 4 October to 2 November selected the intervening dates; navigating months retained the range and main Day date. Clicking an endpoint reduced it to a single day; clicking the lone selected day again cleared it. Staff totals were recalculated across the range. A staff-name search, Job filters and expandable Worklog details are visible. The observed 3093 px viewport measured the open panel at about 805 px and the narrowed Day grid at about 1902 px. Molly's optional panel now follows the observed range behavior and retains staff search, role filters and expandable net-hour Worklog. Isolated browser acceptance selected 8–10 October, then 10 October–2 November (24 days), while main Day stayed on 10 October; the intermediate 9 October Shift and published 16 October Shift contributed to the corresponding staff totals. The Molly panel measured about 802 px beside a 1904 px Day surface. BHS overnight-hour attribution remains unverified, so this is partial P1 parity. BHS data was not saved or submitted.

## 2026-10-21 Day toolbar, read-only reference

The signed-in BHS Day accessibility tree showed Today, Back, Next, a focused date label, and Month/Week/Day view buttons. No Copy control appeared in that primary row; a separate Batch Operation control was below the grid. The unlabeled popup in the row was not opened, so its purpose remains unverified. This supports keeping Copy secondary in Molly's More menu. Molly's More now opens Copy Day directly or invokes the previous-week preview without an extra scope-choice dialog. This is a workflow simplification, not proof of BHS Copy parity. No BHS control that saves, submits, or changes data was used.

## 2026-10-21 imported Availability and Day Save

Molly's isolated STORE_EVALUATOR browser committed joined name-first `HandoverEmployee006 1AA2AA34567AA`, saved one 10:00–11:00 Day Shift inside the imported 10:00–22:00 window, reloaded and clicked the saved card to Edit, then confirmed Week/Month visibility. A 09:00 outside-window draft disabled HandoverEmployee006 and was cancelled with no database change. Direct guarded PostgreSQL verified the canonical employee, exact Sydney-to-UTC interval, role snapshot and unchanged publication. Signed-in BHS was used only to observe the unsaved `全岗` staff picker: seven staff carried recorded intervals or `No available Time`, but all remained disabled after a 16:00–16:30 draft edit, so BHS's exact selection rule remains **NOT VERIFIED**. No BHS data was modified.

## 2026-10-21 Molly Day availability after Script Import

An isolated current-source Molly browser committed name-first AA Availability for HandoverEmployee006 on Monday and Cindy on Tuesday. Day Add now shows the matching recorded local-day window beside each employee and does not use Tuesday-only availability to label Monday unavailable; an overnight row can still contribute when it intersects the shift. Both Add drafts were cancelled. BHS's employee-picker Availability display for this exact sequence was not observed, so this is a Molly correctness improvement, not a claimed 1:1 reference match. BHS data was not modified.

## 2026-10-21 Molly historical-role Edit close

Molly Hurstville's unsupported `验收岗` Roster role was backed up and deactivated without changing the eight historical draft Shifts that reference it. Day still labels such a card as old and Edit offers only current Evaluate-approved roles. A local browser reproduction showed that Cancel on an unchanged Edit unnecessarily opened a discard warning; after the fix it closes immediately, while an actual unsaved role change still requires discard confirmation. This is a Molly usability/data-catalog correction. BHS's handling of a removed Job and its saved Edit result were not tested, and no BHS data was modified.

## 2026-10-21 observed Shift preset apply

In signed-in BHS Hurstville Day Add, the Preset Shift menu listed AA 10:00–22:00 / 1 h break, BB 10:00–17:00 / 0.5 h and CC 16:00–22:00 / 0. Choosing AA changed the unsaved form's clocks to 10:00–22:00 and Break to 1 h; Cancel closed it without any BHS write. Local Hurstville already had matching Availability Script code/time shortcuts. Three corresponding **Shift templates** with breaks and no assigned role were added locally from the observed reference, after an exact backup. Normal Molly Day Add after refresh showed AA/BB/CC and applying each produced the expected clocks and 60/30/0-minute breaks; Cancel wrote no Shift. BHS Submit/edit propagation between its two settings surfaces remains unverified. Molly retains only Evaluate-confirmed formal role choices, independent of these time presets.

## 2026-10-21 Day last-slot click, read-only reference

On signed-in BHS Hurstville Day, Wednesday 2026-10-21, a blank click in the visible 23:30 slot opened an unsaved Add Shift draft with **Start 23:30 / End 23:59** on the same date. Cancel closed the dialog; no Save or Submit was used. This establishes the reference's *draft prefill* at the last slot only; whether a 29-minute shift can be saved, and whether BHS enforces store closing hours, remain unverified.

Molly Green Square Day on the same date opened an unsaved **23:30–00:00 next-day** draft, explicitly showing 30 elapsed minutes; Cancel wrote nothing. Molly Hurstville is configured for 09:00–22:00 and a 60-minute minimum, so its 23:30 slot did not open Add. These are different store policies. Do not change the configured minimum or cross-day rule solely to copy BHS's unsaved 23:59 draft; the saved reference semantics and intended Hurstville policy need evidence. The contrast is a documented Day boundary parity gap, not a claim of failed persisted behavior.

## 2026-10-21 BHS preset timing and break evidence

Hurstville BHS `Setting -> Preset Shift` currently shows AA 10:00–22:00 with 1 h break, BB 10:00–17:00 with 30 m, CC 16:00–22:00 with 0. The unsaved Edit form has one code/name, Start, End and Break choice per row, plus Append/Cancel/Submit. Cancel closed it without changing BHS data. Molly's Availability Script shortcuts store only code and time; its separate Shift templates carry break minutes. Their relationship and BHS's Submit effects remain a Settings parity gap. Molly's historical Green Square `QA 早班` time-only template was backed up and reversibly deactivated, so Day Add no longer suggests a QA preset absent from the current formal-job list. No Shift, publication or Evaluate formal-job row was changed.

## 2026-10-21 read-only BHS spring-forward Day reference

On the signed-in Hurstville BHS Day for Sunday 2026-10-04, a blank drag beginning in the visible 01:30 slot and ending in the visible 04:00 slot opened Add with **01:30–04:30**. The draft was cancelled; no BHS data was saved or submitted. BHS displays 02:00 and 03:00 axis rows on that date; its handling of direct 02:xx input and persisted duration is unverified. Normal local Molly Green Square Day repeated the blank drag and opened **01:30–04:30**, with an explicit **2 hours actual elapsed, UTC+10 to UTC+11** cue, then cancelled without writing. The focused wall-clock-to-UTC regression passes. This closes only the observed spring-forward drag prefill, not all DST behavior or store-account acceptance. BHS Job Info was also observed again read-only: 带训员, 莉小白, 前台, 培训, 后厨, 全岗. Evaluate's smaller confirmed formal-job list remains the scheduling authority in Molly.

## 2026-10-21 Day density and secondary Copy

Read-only BHS Day with five saved shifts showed three usable overlap columns. Molly's disposable 50-employee Day initially placed a connected sequence of 20 shifts into 20 narrow columns; the per-visible-day overlap layout now reuses three simultaneous columns and handles next-day overnight overlap. Browser evidence measured ~551px three-column cards, ~826px two-column cards and correct 22:00–02:00/01:00–03:00 side-by-side continuation. Day shows ten scheduled employees per page in this stress case. Copy remains secondary under More → Copy 排班, with the existing Day/Week/period preview flows retained. BHS saved Copy behavior is still unverified; none of these changes assert exact reference visual parity. No BHS data was changed.

## 2026-10-20 Day upward selection parity closure

In the live signed-in BHS Day grid, a held 09:30→08:00 upward drag showed the mirror progress from 09:00–09:30 to 08:30–09:30 to 08:00–09:30. Add opened 08:00–09:30 and was cancelled. No reference-system data was changed. Molly's ordinary-date Day/Week selection now excludes the starting slot on upward drags. A held disposable Day 10:30→09:00 gesture showed a **09:00–10:30** mirror and matching visible highlight; Add showed 09:00–10:30, Save produced one Shift, reload retained it, and guarded PostgreSQL confirmed the exact UTC endpoints plus HandoverEmployee006's canonical ID. Day downward and Week upward regression gestures matched their preview and forms. The prior upward-gap statements and the old matrix row below describe earlier builds; this section supersedes them. BHS DST selection and saved Copy behavior remain unverified.

## 2026-10-20 user-directed Day and toolbar priority

Copy to next period was also moved from the period summary to More on 2026-10-20. In the live local Day browser, its menu entry opened the existing preview, which blocked legacy `验收岗` against current Evaluate formal jobs; Cancel closed without a write. The BHS Copy workflow has not been saved or submitted, so its exact persistence behavior remains unverified.

In a separate paired disposable Molly browser fixture, a held Day upward 10:30→09:00 drag produced a 09:00–11:00 live mirror and four-slot highlight; release opened a 09:00–11:00 Add form, which was cancelled. BHS's observed upward 09:30→08:00 Add was 08:00–09:30. The reference and Molly do not share the same directional endpoint rule. A form-only adjustment would cause Molly's preview to disagree, so this remains an explicit parity gap rather than a falsely claimed fix.

Day is the primary Molly scheduling view. Its visible toolbar now contains date/store navigation, Month/Week/Day and Add Shift; Copy Day/Week and other secondary operations are reached through More. Local Chrome verified More → Copy Day → Cancel without saving. BHS remains an interaction reference; no BHS data was modified. The exact BHS upward drag endpoint still differs from Molly and remains open. For Script Import, the BHS New tab's observed SID input is intentionally **not** Molly's rule: the user specified employee name followed by concatenated or separated codes. Prior canonical-ID Molly descriptions below are superseded.

## 2026-10-20 live BHS Day/Week pointer observation (no save)

The user restored the signed-in Hurstville Chrome session. At **3093×1670 CSS px**, BHS Day used React Big Calendar 30-minute visible slots. On Tuesday 2026-10-20, a blank grid click at 08:00 opened **Add Shift** for **08:00–08:30**. A downward drag from the visible 08:00 slot to the 09:30 slot opened **08:00–10:00**. An upward drag from the 09:30 slot to the 08:00 slot opened **08:00–09:30**. The latter directional endpoint difference is directly observed BHS behavior; whether Molly should reproduce that exact half-hour difference is an open parity decision. In Week, a downward drag in Wednesday 2026-10-21 from 08:00 to the 09:30 slot opened the correct Wednesday Add form at **08:00–10:00**. Each dialog was **Cancelled**, with no Save/Submit. A click on an existing HandoverEmployee006 shift opened Edit with its saved 17:00–22:00 clocks, selected Job, break and staff; it too was Cancelled. Saved-card drag behavior remains untested because dropping it could change real BHS data.

The BHS Week time grid has seven **date columns** (Monday through Sunday), not employee rows. Employee selection appears inside Add/Edit. Molly's optional employee-row board is its own workflow and should not be described as a copied BHS Week layout.

BHS's Add/Edit Job checkboxes showed the same six jobs as Setting → Job Info: 带训员, 莉小白, 前台, 培训, 后厨, 全岗. Job Info staff counts were 4, 25, 0, 3, 0, 8 respectively. This is the BHS reference list, not proof that Evaluate has all six formal qualifications. Molly's current blank Day/Week drag-create, 30-minute snapping, click-to-edit, and click-only saved-card rule have isolated browser evidence below. The exact BHS upward endpoint asymmetry is a remaining parity gap, while Molly's click-only saved-card rule follows the user's explicit requirement. No BHS business data was submitted or edited.

## 2026-10-20 rapid blank selection and saved-card drag

Molly current-source Chromium in disposable schemas performed 12 one-move blank drags across Week/Day, all opening 14:00–15:30 unsaved Add forms; two gestures starting on saved cards produced no dialog and no Roster write. This extends earlier stepped-drag evidence to fast gestures and preserves the user's click-only saved-card rule. BHS tabs currently show login, so equivalent BHS pointer timing and saved-card behavior are **NOT VERIFIED**.

## 2026-10-20 legacy QA preset visibility

The current BHS Chrome tab is at its login page, so no further Job or preset semantics were observed. Evaluate's live Hurstville formal catalog still contains only `全岗` and `带训员`. The Roster QA-named time-only preset `验收早班` was saved to an exact backup and deactivated without deleting its row or touching 13 Hurstville Shifts. Local isolated Chromium verified inactive presets are absent from Calendar Add while active time-only presets still appear. This is a Molly data cleanup and interaction check, **not** evidence that BHS uses the same preset activation rule. Legacy `验收岗` and `前场` Shift roles remain historical and require explicit business mapping before any reassignment.

## 2026-10-20 live BHS reference access and Job Info

The user's restored Chrome BHS session is now readable. A read-only visit to `https://shifthelper.bhsoftware.com.au/setting` → `Job Info` showed Hurstville's six Preset Jobs and related-staff counts: `带训员` (4), `莉小白` (25), `前台` (0), `培训` (3), `后厨` (0), `全岗` (8). Its October 2026 Month Calendar was also visible. This supersedes the 2026-10-17 access failure below, but **does not** verify Day/Week gesture parity or imply that all six BHS Jobs are Evaluate formal qualifications. Molly currently exposes the two Evaluate-confirmed roles `全岗` and `带训员` in Hurstville; the mapping for the other BHS Jobs and legacy Roster `验收岗`/`前场` needs evidence. No BHS data was saved or changed.

## 2026-10-17 published snapshot card identity

Molly now keeps equal-time published Shifts separate when their frozen role names/colors differ. Disposable Chromium showed both Month cards and the correct details; direct PostgreSQL confirmed the publication entries stayed intact. BHS treatment of such historical changes remains unobserved, so this is a Molly history-integrity correction, not a parity claim.

## 2026-10-17 duplicate Save interaction

Molly's current-source Chromium produced exactly one created Shift after a physical mouse double-click on Save, with browser reload and direct PostgreSQL confirmation. The equivalent BHS duplicate-click feedback remains unobserved because its current session requires re-login.

## 2026-10-17 current reference access

The restored BHS Chrome tab was visible at `/calendar`, but the application showed `Something went wrong. Please try Re-Login or Contact Manager.` The window reader also failed with `node_repl exec context not found`; desktop capture established only the expired/error page. Live Settings jobs and Calendar gestures therefore remain unverified pending the user's own login. No reference-system mutation was attempted.

## 2026-10-17 Day/Week drag text selection

Fresh disposable Chromium additionally verified the live Day and Week mirror both showed `14:00 - 15:30` before release, and each resulting Add dialog had the same clocks. The QA script now asserts that equality; current BHS mirror format and snap timing remain unobserved.

Molly's current-source Chromium showed blank Day and Week pointer drags each opening one 14:00–15:30 unsaved draft. Browser text selection stayed empty during and after both gestures; Cancel wrote nothing. This closes a Molly interaction QA gap, while the exact current BHS drag snapping and its Settings/Job catalog remain unreadable. A historical Month-row drag assertion below is explicitly marked superseded because saved cards are now click-only under the user's corrected rule.

## 2026-10-17 formal qualification cue

Molly's Shift picker now distinguishes exact Evaluate formal-job assignment from skill matching in every candidate row. Disposable Chromium verified confirmed and unconfirmed cases. This implements the user's formal-position boundary; BHS candidate qualification visuals and blocking rules remain unobserved, so exact parity is unverified.

## 2026-10-17 employee-row gesture evidence

Molly's Week employee-row card is click-to-edit and does not move on a mouse drag; its blank employee/date cell opens an unsaved Add draft with that employee preselected. Fresh disposable Chromium plus authenticated API found zero writes and unchanged Shift/period data after the drag and Cancel. This follows the user's corrected saved-card gesture rule. The actual BHS employee-row layout and gesture remain unverified because the current BHS window cannot be read.

## 2026-10-17 Copy Day current workforce checkpoint

Molly's disposable Chromium Copy Day preview and Save created two DRAFT Shifts. After an Evaluate name update, the grouped Month card showed one employee plus `+1`; its chooser showed both current employees, and authenticated Roster API readback confirmed both new assignment snapshots. Source and older publication snapshots were stable. This is a verified Molly data-integrity behavior. Current BHS Copy Day behavior and Settings remain unreadable, so exact interaction parity is **unverified**.

## 2026-10-17 legacy role interaction

Molly's current-source browser shows unmatched `验收岗` only in a separate draft review panel, disables unchanged Edit Save, and refuses Publish with 422 until a current Evaluate formal job is chosen. The current BHS Settings window remains unreadable, so no equivalence between its job names and Evaluate formal jobs is claimed. Historical Roster role rows and published snapshots remain intact for review.

## 2026-10-17 fall-back browser evidence, reference still unverified

Molly's disposable browser shows a saved first-to-second 02:30 card aligned to the visible 02:30 row with one-hour height in Day/Week, and Edit retains both occurrence ordinals. Day/Week drags 02:00–03:30 show 2 h 30 m actual elapsed; upward Week drag matches downward. BHS DST behavior remains unobserved, so no parity claim is made for repeated-clock display or dragging.

## 2026-10-17 DST interaction status

Molly now reads visible Day/Week slot labels for pointer creation on store-local clock-change dates. Isolated Chromium/PostgreSQL passed spring valid/invalid click and drag, persisted a UTC-correct Shift, and preserved fall-back one-hour 02:30 click/reload. The fall-back axis still has a single 02:xx row; its second occurrence is selectable in the form. Dated BHS evidence does not describe DST days, and the current BHS window remains unreadable. Mark exact BHS DST parity unverified, not complete.

## 2026-10-17 clock-change day gap (earlier guard superseded)

The dated BHS read-only observation confirms a full-day grid but does not establish behavior on daylight-saving transition dates. Molly's underlying grid mapped a Sydney visible 02:30 spring-forward slot to 01:30–03:00. Current safety behavior refuses Day/Week pointer creation on that local date and offers form entry. Priority P1 for exact wall-clock rendering and pointer mapping, including repeated fall-back clocks; verification requires isolated browser cases and, if available, current BHS observation. No DST-day interaction parity claim.

## 2026-10-17 dated BHS full-day grid alignment

`SHIFTHELPER_BEHAVIOUR_MAP_2026-10-07.md` records a read-only BHS Day/Week 00:00–24:00 hourly grid. Molly previously clipped ordinary stores to their operating hours; it now renders a full-day axis while keeping the configured operating window and write validation separate. Disposable Chromium verified midnight and 23:30 slots in Day/Week, a blocked 07:30 click at a 09:00–22:00 store, valid 14:00–14:30 prefill, no writes and unchanged data. Saved cards remained click-only, and blank selection still worked. This aligns a documented grid behavior, not current live BHS proof; exact BHS snap and Settings remain unverified.

## 2026-10-17 current Molly gesture evidence

Fresh disposable browser/PostgreSQL verified Molly's slight-movement click, Escape/PointerCancel, upward Day drag-create, Week invalid multi-day guard, Month blank creation and PUBLISHED Month/Day/Week create lock. Direct API verified exact UTC and employee for one saved Month click and one saved upward drag, with no extra Shift and unchanged published Calendar data. These observations prove Molly's current behavior only. The live BHS browser state remains inaccessible, so its exact gesture and Settings behavior are still parity gaps.

## 2026-10-17 direct BHS window recheck

Computer Use listed one Chrome window titled `Zii - Dashboard - Google Chrome`, but page-state capture returned `node_repl exec context not found` again after fresh selection. No BHS Settings job list or live Calendar gesture was observed. The current Molly rule remains the user's explicit direction: saved cards click to Edit and blank time-grid drag selects an unsaved interval. BHS-specific job labels, snapping, settings and double-click behavior remain unverified. Today's independent Settings role-inventory load is a Molly reliability fix, not a ShiftHelper parity claim.

## 2026-10-17 role inventory retry

Molly Settings now retries a failed legacy draft-role inventory without reloading unsaved store-rule fields. Disposable Chromium/PostgreSQL verified a 503, successful retry, retained 07:30 draft opening time and zero writes. This is a Molly reliability fix; BHS Settings behavior for the same failure remains unobserved.

## 2026-10-17 employee-row drag path removed

The optional Molly employee-row board no longer contains a saved-card drag state machine or Move callback. Saved cards remain click-to-edit, while blank Day/Week grid dragging creates a time selection; an employee-row blank `+` preselects that employee. Fresh disposable Chromium/PostgreSQL passed those gestures with zero canceled writes and unchanged Shift/period versions. Earlier opt-in employee-row drag tests in this document are historical evidence for a behavior superseded by the user's later instruction. Direct current BHS interaction comparison remains unverified.

## 2026-10-17 unsupported draft-role review

Molly Settings now surfaces draft Shift counts for Roster roles absent from the current Evaluate formal job catalog and links to the first affected Calendar date. Disposable browser/PostgreSQL verified no mutation and stable published history. This addresses the user's report that legacy `验收岗`/`前场` exist in Roster despite not being formal Evaluate jobs. BHS Job Settings and its handling of historical roles remain unobserved; this is a Molly data-review workflow, not a BHS parity claim.

## 2026-10-17 employee-row saved-card drag recheck

The current Molly Calendar disables saved-card pointer movement in both the time grid and employee-row board. Fresh Chromium/PostgreSQL dragged each card with zero Shift writes, then clicked each to open Edit. Blank Day and Week grid drags selected 14:00–15:30 and Cancel wrote nothing. This confirms the user's requested Molly gesture semantics across these views. BHS current UI was not observed; the Windows Computer Use state call still returned `node_repl exec context not found` after the BHS window was reportedly restored, and the detectable Chrome title was `Zii - Dashboard`.

## 2026-10-17 Copy/Repeat from an edited draft

Molly warns when Copy or Repeat would abandon unsaved Edit fields and explicitly says the next flow uses the saved Shift. Clean Copy remains immediate. Disposable Chromium/PostgreSQL verified both guarded transitions and no roster write on cancellation. The dated BHS read-only study did not expose Copy/Repeat results, so this is a Molly reliability behavior rather than a BHS parity claim.

## 2026-10-17 observed Edit Cancel behavior

The 7 October authenticated, read-only ShiftHelper record observed an existing Shift's Cancel prompt warning that unsaved data would be lost, while an unsaved Add dialog canceled directly. Molly now follows that distinction: existing Edit Cancel/close/Escape requests confirmation; Continue Editing retains form input; new Add Cancel closes directly. Fresh disposable Chromium/PostgreSQL verified those paths and zero writes. This is parity with a dated observed behavior, not a claim that current BHS Settings or all saved actions are verified.

## 2026-10-17 concurrent deletion feedback

Molly now keeps unsaved Edit input visible but disables repeat Save/Delete after the server confirms another administrator deleted that Shift; Calendar reloads the authoritative remaining cards. Disposable browser and PostgreSQL verified both 404 paths. BHS handling of concurrent deletion remains unobserved.

## 2026-10-17 grouped Shift chooser browser evidence

Molly Chromium now directly verifies the grouped DRAFT card and chooser use the latest Evaluate employee display name while a separate PUBLISHED card/detail retains its published name snapshot. No roster mutation occurred. This confirms Molly's data display behavior; BHS grouping and historical-name behavior remain unobserved.

## 2026-10-17 role retirement race

Molly now refreshes its role choices if a batch submit is rejected after Evaluate retired the chosen formal job, keeping the selected draft Shifts so a manager can choose a current job. Disposable browser evidence proves HTTP 422/no write and disabled stale action after refresh. BHS handling of this concurrency case remains unobserved.

## 2026-10-17 current-store role selection

Molly's Batch Update now disables submission if the previously selected formal job is no longer in the refreshed Evaluate catalog. Disposable browser evidence covered a job retired by another authenticated client. BHS Settings and batch behavior remain unobserved because the detected Chrome window still cannot be captured; this is a Molly reliability safeguard, not a parity claim.

## 2026-10-17 current formal-job repair workflow

Molly now keeps Save disabled in a legacy-role draft Edit dialog until an Evaluate-verified formal role is selected. Disposable Chromium/PostgreSQL followed `验收岗` to official `QA Front`, retained Shift time/employee, published a new official-role snapshot and left an older publication unchanged. This is a local repair/publish capability, not evidence of BHS's own Job setup or repair flow; direct BHS inspection remains unavailable.

## 2026-10-17 Month saved-card and navigation evidence

Current Molly Chromium added direct evidence that a saved Month DRAFT card cannot be pointer moved: a drag toward another date sent zero Shift writes and left the card at its source. Month/Week/Day focus and store context survived navigation/reload with zero mutations and browser/API runtime errors. This verifies Molly's current requested contract; BHS behavior remains unobserved because window capture is still unavailable.

## 2026-10-17 direct Molly gesture check

Paired disposable PostgreSQL/Chromium verified the user's required Molly behavior: dragging a saved DRAFT Day card made no Shift write and clicking opened Edit; dragging blank Day and Week time cells opened an unsaved 14:00–15:30 draft, with zero persistence on Cancel. This supports Molly's current gesture contract only. BHS window capture remains unavailable, so the actual BHS click/drag threshold and Settings behavior are still unverified.

## 2026-10-17 reference access retry

Windows Computer Use listed one Chrome window titled `Zii - Dashboard - Google Chrome`, but the read-only `get_window_state` call returned `node_repl exec context not found` again. No BHS Settings/Job list or Calendar interaction was visible. Public search returned similarly named but unrelated scheduling products; none was used as BHS evidence. The user's direct instruction remains the governing gesture contract for Molly: drag blank time cells to select a new Shift; saved cards are click-to-edit and are not pointer draggable. BHS-specific settings and gesture details remain unverified.

## 2026-10-17 Copy conflict feedback after a concurrent target change

Molly's Copy Shift dialog now names a selected employee whose target time became conflicted after a refresh and disables Save until the manager resolves the conflict. Chromium verified no duplicate write, the draft retained after an uncommitted request, and exact-ID replay of a previously saved Shift after Evaluate retired the job. This is Molly reliability evidence; BHS behavior in the same concurrent and error cases remains unobserved. The user's saved-card click and blank-grid drag rule remains the current gesture contract.

## 2026-10-17 Copy request identity

Molly now attaches one durable UUID to an attempted new Shift. An uncertain response is checked by that exact ID; a same-ID replay returns one Shift, altered request/account is refused, and a deleted Shift cannot be recreated by delayed replay. Paired Chromium/PostgreSQL verified damaged committed response, an unrelated identical Shift and safe retry. This is Molly data-integrity behavior. BHS handling of these failure cases and its Copy target feedback remain unobserved, so no 1:1 parity claim is made.

## 2026-10-17 Copy uncertain-result feedback (superseded preflight design)

Molly now retains Copy when its request did not commit and a different administrator already created an identical target Shift; it refreshes the target conflict before retry. A preflight read failure sends no POST. A committed 201 with unreadable JSON still reconciles to the saved target. Disposable Chromium/PostgreSQL verified all three cases. Attribution is not definitive if another actor creates an identical Shift after preflight; that requires a durable operation ID. BHS handling of these cases remains unobserved.

## 2026-10-17 Copy Shift target feedback

Molly's PUBLISHED-source Copy now navigates to the newly saved DRAFT target date and shows its card. Chromium also verified this after a committed 201 response with unreadable JSON and authoritative reconciliation. Cancel remains write-free; source/publication stay unchanged. Direct BHS Copy target navigation could not be observed, so parity for this detail remains **unverified**. Browser evidence is in `docs/ROSTER_BROWSER_QA.md`.

## 2026-10-17 Copy from a published Shift

Molly's read-only PUBLISHED detail now offers Copy as an unsaved new Shift. The default target is the same weekday next week; a DRAFT source defaults to the next day. Target date and employee remain editable, and the normal current formal-role, Availability, conflict, store and version checks apply on Save. Disposable Chromium verified Cancel made no write and Save created one DRAFT copy while the source and publication list were unchanged. Direct BHS defaults and Copy workflow remain unobserved; these Molly defaults are provisional product choices, not a parity claim.

## 2026-10-17 mixed publication Month batch selection

Molly Batch mode now selects only DRAFT Shifts. A PUBLISHED card in the same Month gives an explanatory message and stays unselected; a grouped DRAFT card selects its underlying records; a range change prunes selections outside the current editable snapshot. The server retains final publication/version checks. Disposable Chromium verified these paths with zero writes. No direct BHS batch-selection behavior was observed.

## 2026-10-17 retired role on a published card

Molly now reserves the `待核对` role warning for DRAFT Shifts that need repair before another write. A PUBLISHED Shift shows its saved role snapshot even when Evaluate no longer lists that role. Disposable Chromium verified the PUBLISHED card in Month/Week/Day and its read-only detail with zero writes. This follows the immutable publication requirement; corresponding BHS semantics are not directly observed.

## 2026-10-17 published role label stability

Molly now uses stored role name and color snapshots for PUBLISHED Calendar groups, Month employee summaries and Week employee-row chips. DRAFT cards continue to use the current Evaluate formal job name. Disposable Chromium verified the contrast after the current Evaluate job name differed from the saved Shift snapshot, with no Shift writes. The reference system's treatment of later job renames remains unobserved; this follows Molly's published-history stability requirement rather than a claimed BHS match.

## 2026-10-16 published-card click

Current Molly behavior: clicking a published Shift in Month, Week or Day opens a read-only detail with the stored employee, role, local time, break and notes. A grouped published event opens a chooser labelled for viewing before the selected detail. Save and Delete are absent; editing still requires a period reopen. Disposable Chromium verified the single-card path in all three views with zero Shift writes and unchanged API data. The corresponding BHS published-card behavior remains unobserved, so this is a Molly workflow completion rather than a 1:1 parity claim.

## 2026-10-16 current saved-card gesture

The user's explicit interaction rule remains the reference available to this run: saved Shift cards are clicked to edit; dragging a blank Day/Week time grid selects a proposed Shift interval. Molly now has no active TimeGrid move/resize mutation callback: any unexpected FullCalendar drop/resize callback reverts. Disposable Chromium verified dragging a saved Day card emitted zero Shift writes and no dialog, clicking it opened the dialog, and dragging blank 14:00–15:30 opened one unsaved Add draft. Isolated database rows stayed unchanged. The restored BHS window remains unreadable through the available Windows interface, so exact BHS behavior is still unverified.

## 2026-10-16 legacy-role write behavior

Molly's current-source disposable browser/API run confirmed a saved old-role Shift remains visible with a repair label and opens Edit, while direct reposition and note-only Batch Update each reject it with 422 and leave its stored fields unchanged. A valid store-specific role remains usable. This is a Molly integrity check, not an observed BHS behavior. The user's drag correction remains in force: blank-grid drag proposes a new time range; a saved card is clicked to edit and has no pointer move/resize. The restored Chrome window still returned `node_repl exec context not found`, and its title was Zii Dashboard at retry; BHS Settings and Calendar remain unobserved.

## 2026-10-16 server and client formal-role agreement

Molly's server now selects one Roster role for each active Evaluate formal job using the same code-first, store-specific matching as its client. A hidden global alias can no longer be used through direct Shift/template API writes or passed as an allowed role for Copy/Publish/Batch. Local Chromium verified the historical alias remains visible as a labelled old Shift, opens through the grouped Shift chooser, and requires current-role repair in Edit. BHS job alias handling has not been directly observed.

## 2026-10-16 role selection across Molly workflows

The current-source local browser now checks Staff, Templates and Calendar Add as well as Settings against Evaluate's store job catalog. A disposable Roster role `验收岗` remained active and was referenced by a historical template and saved Shift, yet it was absent from all current role choices. Templates marked the historical row for relinking; Calendar Add omitted the unusable template. Calendar labelled the saved card `旧岗位：验收岗` and still opened Edit; its persisted snapshot stayed unchanged. This is Molly data-source and browser evidence, not a direct BHS Settings comparison. The BHS window-state API remains unavailable.

## 2026-10-16 current evidence boundary

The user's explicit rule controls the current Molly implementation: dragging an existing Shift card must not move or resize it; dragging an empty Day/Week time grid selects time for Add. An isolated current-source Chromium run verified saved-card drag caused zero Shift HTTP mutations and no database change, a click opened Edit, and blank drag opened an unsaved 14:00–15:30 Add dialog. The Settings browser run showed only Evaluate's current `qa-front` job even while a legacy `验收岗` role remained in the disposable Roster database. These are Molly behavior checks, not direct BHS comparisons. The BHS Chrome page could not be captured (`node_repl exec context not found`); its live Job list, settings details and saved gesture semantics remain unverified. Historical Move/Resize rows below record former development evidence and do not express the current requested interaction contract.

## 2026-10-16 requirement correction

The user has explicitly corrected the interaction contract: **existing calendar blocks do not drag for scheduling**. A drag on blank Day/Week time grid selects time for Add Shift; clicking an existing block opens Edit. Earlier rows below describing saved block Move/Resize and employee-row drag as desired parity are historical test evidence and no longer describe the requested default workflow. FullCalendar move/resize is disabled, and the optional employee-row board has drag disabled in the application. A disposable Chromium check (`scripts/qa-bhs-drag-semantics-browser.py`) recorded zero Shift mutation requests and unchanged PostgreSQL rows after dragging a saved block; click opened its dialog; empty 14:00–15:30 drag opened an unsaved Add draft. Direct BHS mutation behavior remains unobserved; the user-provided rule controls Molly's implementation. Current BHS Settings Job list still awaits screenshot because the Windows window-control API failed despite the user restoring Chrome.

2026-10-16 local Repeat/Publish race: after Bob transferred during a copyable Repeat preview, Molly Generate returned 422, cleared the old preview and retained recurrence input; a fresh preview blocked. Publish also returned 422 and left DRAFT and historical publication unchanged in direct PostgreSQL. BHS saved Repeat and Publish handling under employee departure has not been observed.

2026-10-16 local Copy Day/Week race: two Chromium tabs held initially copyable previews; after an Evaluate employee transfer, both commits returned 422 and Molly invalidated their old previews. Fresh previews reported blocking issues, and direct PostgreSQL showed no target Shift/period or publication change. BHS saved-copy behavior and handling of a mid-preview transfer have not been observed.

2026-10-16 local invalid-drag recovery: separate Week employee-row and Day TimeGrid Chromium drags after a live Evaluate transfer each returned 422 `ARCHIVED_EMPLOYEE`. Molly refreshed the workforce, retained the source Shift, showed the former row needing reassignment and removed old drop targets. Direct PostgreSQL confirmed no saved Shift/period/publication change. BHS handling of a transfer during drag has not been observed.

2026-10-16 local recovery: when Evaluate transferred Bob during an open Molly Shift Edit, server Save returned PATCH 400. Molly refreshed the dialog's workforce and Availability without losing the unsaved note; the manager removed Bob, selected HandoverEmployee006 and saved through PATCH 200. Chromium reload and direct PostgreSQL confirmed the single versioned assignment and stable published history. BHS handling of mid-dialog employee departure remains unobserved.

2026-10-16 Molly draft repair: after a saved employee moved to another Evaluate store, the Shift editor displayed his snapshot as a removable stale assignment, blocked the first Save with zero PATCH requests, then saved a replacement employee via one versioned PATCH. Chromium reload and guarded PostgreSQL agreed, and published history stayed unchanged. BHS behaviour for former employees has not been observed; this is local Molly safety evidence only.

2026-10-13 evidence update: Molly's 500-person employee-row HandoverEmployee006-to-Cindy drag saved one existing Shift ID under Cindy, with DRAFT version 3 and 4,999 shifts/assignments verified directly in PostgreSQL before and after an environment interruption. The intended browser reload call did not complete. This strengthens Molly cross-row persistence evidence but does not establish BHS saved-mutation parity, which remains unobserved. Browser-control frame probes were throttled even while idle, so sustained FPS remains unverified.

Reference evidence: [read-only behaviour map](../SHIFTHELPER_BEHAVIOUR_MAP_2026-10-07.md). The BHS account was not used for persistent mutations. The older [matrix](../CALENDAR_PARITY_MATRIX.md) contains visual and workflow context; this file tracks executable interaction claims.

2026-10-15 Week employee-row follow-up: an apparent published-target drop issue could be reproduced only by a synthetic overlap of DRAFT and PUBLISHED periods in the same week. The speculative change was removed. The current Windows computer-use window-state API failed while inspecting Chrome; there is no new direct ShiftHelper observation. Saved BHS move/resize semantics remain unverified.

The subsequent fresh disposable Chromium conflict-drop run passed after repairing an out-of-viewport pointer coordinate in the QA script. A red ring and accessible overlap reason appeared, release sent zero Shift mutations, and guarded PostgreSQL retained the Bob/HandoverEmployee006 assignments and period versions. This corroborates Molly's existing local invalid-target behavior; it adds no new BHS observation.

2026-10-15 local follow-up: an 18:00–next-day 02:00 store's Day grid previously opened an unsavable draft after a 10:00–11:30 drag. Molly now rejects that out-of-hours drag with visible feedback, while 18:00–19:30 and 00:30–01:30 drag drafts still open correctly. Isolated Chromium and guarded PostgreSQL showed zero Shift writes. Direct BHS overnight operating-hours behavior has not been observed.

2026-10-15 local creation follow-up: Month blank-cell and toolbar New Shift previously prefilled 09:00–10:05 when the 30-minute grid had a 65-minute minimum. They now prefill 09:00–10:30. Isolated Chromium saved and reloaded the 90-minute Shift; PostgreSQL confirmed the canonical employee and unchanged publication. An impossible 900-minute minimum against 09:00–22:00 hours now blocks the Calendar default and is rejected by Settings Save. BHS behavior for these store rules is unobserved.

2026-10-15 DST follow-up: Molly's Shift dialog previously collapsed both Sydney fall-back 02:30 occurrences to the first, making a real one-hour Shift appear zero-length in Edit. It now exposes first/second occurrence choices with UTC offsets. Isolated Chromium created the first-02:30 to second-02:30 Shift, reloaded it, changed only its note and saved with exact UTC 15:30Z–16:30Z preserved in PostgreSQL; prior publication remained unchanged. ShiftHelper fall-back-time handling has not been observed.

2026-10-16 local uncertain Delete race: Molly previously treated absence on a Shift's original date as proof of deletion after a lost DELETE response. It now queries the stable ID within the authorized store. Isolated Chromium and direct PostgreSQL proved that a concurrently moved Shift remains visible and its stale editor cannot delete it again; a truly committed but lost 204 response resolves through an ID 404. BHS concurrent deletion/move and network-loss behavior remains unobserved; this is Molly safety evidence, not 1:1 parity.

2026-10-16 local publication response-loss handling: Molly now reads the exact period after an uncertain Publish/Reopen response and reports its observed state. Isolated Chromium hid committed 200 responses for both transitions; reload and direct PostgreSQL confirmed DRAFT then PUBLISHED with immutable publication versions 1 and 3. BHS response-loss feedback has not been observed.

2026-10-16 local cross-month overnight: with valid night-store settings, Molly Day on 1 November showed the 31 October 22:00–02:00 Shift continuation and opened the original editor; Week displayed two date segments, Month one card. Reload and direct PostgreSQL found one unchanged Shift. A first probe using default 09:00–22:00 hours was invalid fixture data, not a product failure. The `computer-use` Chrome window-state call failed, so BHS cross-month behavior remains unobserved.

| Interaction | Reference behaviour | Current Molly behaviour | Gap / priority | Verification |
|---|---|---|---|---|
| Click empty time cell | BHS Day click near 08:00 opened Add, prefilled a 30-minute range | Day and Week open Add with the clicked store date/time and a slot-aligned duration meeting the store minimum; a click whose default duration exceeds store closing gives an error instead of opening an invalid draft | BHS behavior with a longer store minimum or near closing is unknown / P0 reference gap | Local Chrome with no configured minimum: Day 10:00–10:30; Week 2026-10-06 10:00–10:30. Isolated Chromium 2026-10-15: 30-minute slot/60-minute minimum clicked 10:00, saved 10:00–11:00 HandoverEmployee006, reload and PostgreSQL agreed. Separate isolated Chromium 21:30 closing-edge rejection and 21:00–22:00 valid prefill; guarded PostgreSQL zero writes. |
| Click empty Month date | Read-only BHS on 2026-10-21: clicking the October 29 date number entered Day; clicking the blank Month cell opened Add Shift for 29 October with 00:00 start and 00:00 end. Cancel made no reference-system write. | Molly blank cell opens a date-prefilled draft at store opening time with a valid minimum duration; date number enters Day; published date is locked. An empty Month says to click a blank date cell, while Day/Week say to drag a time range. | Molly intentionally avoids BHS's zero-length 00:00–00:00 draft; BHS saved result is unverified / P1. | Read-only BHS DOM-backed click and Cancel; fresh disposable current-source Chromium 2026-10-21: empty November hint, 10 October blank create/save/reload, existing-card Edit, date-number Day navigation and published-date lock; authenticated API verified one canonical employee and exact UTC, unchanged publication. `scripts/qa-month-blank-create-browser.py`. |
| Month focused period actions | BHS multi-period Month summary behavior unobserved | Molly retains the focused date, selects its exact period for Publish/Copy, and hides period actions on an unscheduled focused date; each card keeps its own publication lock | BHS semantics unknown / P0 safety | 2026-10-15 red-green isolated Chromium: 16 October initially showed the wrong 5–11 October DRAFT and rewrote URL to 1 October; after fix it showed the 12–18 October PUBLISHED period and previewed Copy to 19 October. Focus on 23 October had no period actions. Guarded PostgreSQL preserved the publication. Saved-card pointer movement from this older test is superseded by the current click-only rule verified separately below. |
| Create on published date | BHS published-create behavior unobserved | Molly Month/Week/Day/toolbar create entry shows a lock message; Day drag opens no draft | BHS semantics unknown / P0 safety | Isolated Chromium generated ADMIN, published 16 October in all three views; direct PostgreSQL PUBLISHED version 1 unchanged |
| Click empty employee-row date | BHS time grid has no employee rows | Molly Week blank cell or '+' opens a date-and-employee-prefilled unsaved draft; published dates are locked | Molly-only extension / P0 | Isolated Chromium: HandoverEmployee006 10/10 saved 09:00–10:00, refreshed and DB verified; Cindy 10/11 blank click prefilled and canceled; published 10/16 had no create button. |
| Drag create | Live BHS Day downward 08:00→09:30-slot opened 08:00–10:00; upward 09:30→08:00 mirror and Add both ended 09:30 | Molly ordinary-date Day/Week matches the directional endpoint in highlight, live mirror, Add and persisted Shift; Escape/pointer-cancel suppress drafts; Week rejects invalid cross-date selections | BHS DST-day and cancel-key behavior unobserved / P1 reference gap | 2026-10-20 read-only BHS held mirror and Cancel; paired disposable Molly Day 10:30→09:00 saved/reloaded 09:00–10:30 HandoverEmployee006, guarded PostgreSQL exact UTC 2026-10-09 22:00–23:30, canonical ID, DRAFT version 2 and unchanged publication. Day downward 14:00–15:30 and Week upward 11:00–12:00 preview/form regressions passed. Earlier 10:00–11:30 upward evidence was from the superseded selection rule. |
| Click shift | BHS single click opened Edit | Event click opens Edit or a chooser for a grouped block | No observed single-click gap / P0 | Isolated browser Edit of saved HandoverEmployee006 shift |
| Move shift | BHS saved result unverified; user's current requirement forbids dragging saved blocks | Saved Day/Week blocks are click-to-edit; pointer dragging does not call a Shift mutation | Direct BHS saved gesture remains unverified / P0 reference gap | Current-source isolated Chromium: saved drag caused zero Shift HTTP mutations, no dialog and unchanged PostgreSQL. Older two-hour move tests exercised a now-disabled path. |
| Resize start/end | BHS saved result unverified; user's current requirement forbids dragging saved blocks | Saved Day/Week blocks have no active pointer resize | Direct BHS saved gesture remains unverified / P0 reference gap | Current-source isolated Chromium confirmed saved-card dragging makes no write. Older top/bottom resize, rollback and concurrency tests exercised a now-disabled path. Time remains editable through the Shift dialog. |
| Cross employee row | BHS time grid has no employee rows | Molly's optional Week employee board remains available for viewing and click-to-edit, with no saved-card drag code; employee reassignment is available through the Shift dialog | Molly-only extension / P1 | Current-source Chromium dragged an employee-row card with zero Shift writes, clicked it to Edit, and opened employee-prefilled Add from a blank `+`. Older transfer/conflict tests describe removed code. |

| Overnight continuation within or across a week | BHS behavior not observed | Molly shows a dated, non-draggable continuation in the Week employee row on the next date when the shift actually extends past midnight; it links to the original Shift ID | BHS behavior unknown / P1 | PostgreSQL next-day/next-week regression; isolated browser 10/11 23:00–10/12 02:00 display. Fresh 2026-10-15 Chromium: HandoverEmployee006 10/9 22:00–10/10 02:00 appeared on both Week rows; next-day click opened the original Edit, drag sent zero mutations, reload retained both; guarded PostgreSQL kept one HandoverEmployee006 Shift/version 1, DRAFT version 2 and PUBLISHED version 1/one publication. |
| Copy shift | BHS action not observed | Unsaved duplicate dialog, normal create validation | BHS semantics unknown / P1 | Isolated browser saved Thursday copy |
| Copy day | BHS Batch Operation showed source/target calendars and proposed rows for 21→22 October; Save stayed disabled, then Cancel | Preview and atomic copy, all-or-nothing; native date input synchronizes before preview; uncertain result clears stale preview and opens target | BHS save/persistence reason unverified; Molly intentionally keeps Copy simpler / P1 | Isolated browser success, duplicate conflict preview, 2026-10-10 date edit/preflight/save/reload/DB; 1,000-shift local service copy and 501-row PostgreSQL batch regression; 2026-10-15 committed 201 with malformed browser JSON and guarded DB count |
| Copy week | BHS Batch Operation exposed a Copy Week tab with From/To date groups; Cancel closed it | Preview and atomic period copy path, including batch insertion for large weeks; empty source week blocks preview and disables Copy; uncertain result clears stale preview and opens target; source publication stays immutable | BHS preview/save persistence unverified; Molly intentionally keeps Copy simpler / P1 | Isolated browser preview, Cancel, Save, reload and DB persistence; 500-person/5,000-shift local service/database preview and copy; occupied-target block. On 2026-10-15, empty source week preview showed NO_SOURCE_SHIFTS and disabled Copy; forced commit 422, PostgreSQL zero target periods. A committed 201 with malformed browser JSON closed preview; guarded DB found one target Shift and unchanged publication. |
| Availability | BHS picker disabled unavailable candidates | Molly picker disables invalid candidates; server validates writes | BHS server response remains unknown / P1 | Isolated browser: three available fixture employees selectable, seven unknown disabled; saved eligible shifts and blocked conflicting copy |
| Overnight template | BHS template next-day behavior unobserved | Molly infers Next Day when template end clock precedes start clock, and toolbar New Shift uses the store opening time | BHS semantics unknown / P1 | Isolated Chromium 18:00–03:00 store: QA Night 22:00–02:00 saved/reloaded, next-day continuation shown; PostgreSQL UTC 11:00Z–15:00Z |

2026-10-15 Month action follow-up: local Chromium actually reopened the focused 12–18 October period with one versioned POST, while direct PostgreSQL kept the earlier DRAFT unchanged and the original PUBLISHED snapshot immutable. Export UI still opened Publication #1 after the current period became DRAFT. This verifies Molly's local action targeting and history only; BHS saved-operation semantics remain unobserved.

2026-10-15 cross-row invalid feedback correction: the red overlapping target was captured in isolated Playwright Chromium; release displayed an inline reason, sent zero Shift mutation requests and left direct PostgreSQL Shift/assignment/period versions unchanged. Other invalid-target categories still rely on component or backend evidence unless separately observed.

Parity is limited to observed behaviour. BHS move, resize, copy, publish, and failure feedback are unverified because doing so would change live BHS data.

2026-10-14 Copy Shift follow-up: Molly's copy dialog now refreshes Availability for the chosen target date and blocks Save until that read succeeds. An isolated browser saved exactly one eligible HandoverEmployee006 target shift after rejecting unavailable Regular Bob; reload and PostgreSQL agreed. A temporary target-Availability outage preserved input and disabled Save. A component regression blocks Sydney's nonexistent DST wall clock. The current BHS Chrome reference URL returned an error after reload, so BHS saved-copy semantics remain unverified and the matrix claim is unchanged.

2026-10-15 Copy Shift evidence update: in Molly's isolated browser, an invalid Sydney 02:30 spring-forward target showed an inline blocking error. A temporary Roster outage on target Availability left the copy form intact and Save disabled; the new in-dialog Retry recovered target eligibility after restart without a date change. Cancel left PostgreSQL unchanged. This verifies Molly's local failure workflow only; BHS saved-copy behavior remains unobserved.

2026-10-15 local recovery evidence: New/Edit Shift dialogs now retry the current employee and selected-date Availability reads together after a failure, retaining unsaved input and blocking Save until the latest read succeeds. Isolated Chrome verified both outage/recovery/cancel paths with unchanged PostgreSQL version/count. BHS error and retry semantics remain unobserved; this is not a parity claim.

2026-10-15 Availability update: Molly Staff saved/reloaded 22:00–02:00 next-day Availability, preserved it through a next-week template, and saved a matching Calendar shift. Generated-ADMIN Chromium and guarded PostgreSQL verified two Availability dates, the template flag and shift. BHS overnight Availability entry and saved template behavior were not observed; parity on those details remains unverified.

2026-10-15 Staff reliability update: Molly's operating-hours preset follows an overnight store's actual clocks. Generated-ADMIN Chromium verified seven saved/reloaded night intervals and that a failed cross-employee Availability read blocks mutations, with Retry restoring the target draft. A held successful prior-employee Save response did not overwrite the current draft. Direct BHS handling of these failure states is unobserved; this is Molly local acceptance evidence only.

## 2026-10-15 early-morning Availability
Molly local behavior: Day New Shift on 10 October 00:00-02:00 allowed Cindy when her only Availability began on 9 October 22:00 and ended 10 October 03:00; Chromium save/reload and PostgreSQL endpoints agreed. Create, Copy Day preview/commit and Publish have isolated database regressions. This is Molly validation evidence, not a claim about unobserved BHS saved behavior.
## 2026-10-15 night-store visibility follow-up
Molly's 18:00-03:00 store now accepts a separate 00:00-02:00 Shift covered by a previous-day Availability row. Isolated Chromium saved/reloaded it, then verified the Day/Week event and correct Edit prefill. A fixture-inserted 22:00-next-day-02:00 Shift appeared once on each dated Day under the 00:00-24:00 time grid. Actual BHS night-store early-shift and split-display behavior remains unobserved; this is a Molly correctness result, not a parity claim.
## 2026-10-15 overnight edge Resize acceptance
Molly browser acceptance now includes a split 22:00-next-day-02:00 Shift. The apparent center of its old bottom handle reproduced an unintended whole-Shift move; after enlarging/insetting both handles, bottom Resize saved 22:00-03:00 and top Resize saved 21:00-03:00. Both survived reload and direct PostgreSQL agreed on one Shift/assignment with unchanged publication. BHS saved resize behavior remains unobserved.
## 2026-10-15 split overnight Move acceptance
Molly local Chrome moved a saved split 22:00-02:00 Shift to 23:00-03:00 by dragging its next-day segment; reload and PostgreSQL agreed on unchanged duration and employee. A move to 00:00-04:00 was rejected with structured operating-hours feedback and no database change. A simulated 503 also reverted and reloaded. BHS saved cross-midnight move and failure feedback remain unobserved, so this is not a full parity claim.

## 2026-10-15 copy role-state follow-up
Molly Roster now blocks Copy Day, Repeat Shift and Copy Week when a source Shift Role has been deactivated or no longer belongs to the store. Preview names the affected Shift and execution rechecks atomically. Isolated PostgreSQL covers Day/Week preview and commit, and two-shift same-date Repeat selects only the chosen source. Generated-ADMIN Chromium verified the Copy Day issue, disabled commit, HTTP 422 forced execute and unchanged source/target DB. Direct ShiftHelper behavior for deactivated roles remains unobserved; this is a Roster scheduling integrity rule, not a claim of BHS parity.

## 2026-10-15 Week employee-row stale version
Molly's Week employee-row move now refreshes the authoritative Calendar after a stale HTTP 409, matching the existing time-grid Move/Resize recovery behavior. Generated-ADMIN Chromium reproduced the old stale QA Front chip after another administrator changed the Shift to QA Changed, then verified the fix showed QA Changed on Bob with no Cindy assignment. PostgreSQL confirmed unchanged Shift ID and assignee, Shift/DRAFT version 2. This is Molly concurrency safety evidence; BHS multi-user failure behavior remains unobserved.

## 2026-10-15 employee-row edge scrolling
Molly Week employee rows now scroll the vertical workspace during an active pointer drag near its top or bottom edge. In isolated Chromium, the old behavior stayed at scrollTop 719; the fix reached 1627 downward and 0 upward, with Escape sending zero Shift mutations. A separate real pointer drag used the upward scroll to reveal an initially offscreen HandoverEmployee006 row, saved Bob-to-HandoverEmployee006 as one PATCH and survived reload; PostgreSQL confirmed the same Shift ID and immutable published snapshot. BHS auto-scroll behavior was not observed, and narrow-screen horizontal edge scrolling remains unverified.

## 2026-10-15 narrow Week row scrolling

Molly's Week employee-row board now auto-scrolls horizontally while an active Shift drag is held near either edge of a 600px viewport. Chromium red-green confirmed left 433 to 0, right 0 to 462, and zero writes for canceled drags. One leftward cross-date move saved and survived fresh login, with PostgreSQL confirming the canonical assignment and stable publication. Direct BHS edge-scroll behavior remains unobserved, so this is local usability and integrity evidence rather than a 1:1 parity claim.

## 2026-10-15 row-drag pointer ownership

Molly's Week employee-row gesture now keeps its first pointer as owner until release or cancellation. A second pointer cannot replace the drag or submit a Shift; a non-owner cancel does not end it. A component red-green test and disposable Chromium real-mouse plus injected second-pointer pass verified one final Bob-to-HandoverEmployee006 save and stable publication. Physical multi-touch and BHS equivalent behavior remain unobserved.

## 2026-10-15 touch alternatives

Molly's 390px Week employee board supports touch tap to Edit and touch tap on a date '+' to open a prefilling new Shift without hover. A horizontal swipe starting on a Shift card scrolled the board and did not save. The '+' and employee-name selector now have 44x44px touch targets; employee-name tap focuses the time grid. Disposable browser Cancel paths and PostgreSQL found no writes. BHS mobile behavior and physical store-device acceptance remain unobserved.

## 2026-10-15 inactive-role reposition

Molly now rejects dragging or resizing an existing draft Shift whose Shift Role has been deactivated or is out of store scope, consistent with Edit and Copy. An isolated PostgreSQL test reproduced the previous successful move, then verified atomic refusal; generated-ADMIN Chromium observed the 422, source-card rollback and unchanged database after reload for a cross-date row move. BHS behavior for deactivated roles remains unobserved.

## 2026-10-15 Batch Update safety

Molly's grouped Calendar batch role change now rechecks current employee Availability and active source role state inside the store-locked transaction. A disposable browser group of two Shifts returned 422 for Bob's uncovered time, kept the original group after reload and left direct PostgreSQL versions unchanged. Isolated backend tests also cover note-only inactive-role refusal and a valid batch after coverage restoration. BHS grouped batch behavior remains unobserved.

## 2026-10-15 Publish after settings change

Molly now rechecks current minimum Shift duration and operating hours before publishing an existing draft. In disposable Chromium, an invalid draft received HTTP 400 / MIN_SHIFT_DURATION and stayed DRAFT after reload with zero publication rows; restoring valid settings allowed HTTP 200 and a single immutable publication. Direct BHS behavior after store settings changes has not been observed, so this is a Molly integrity check rather than a parity claim.
## 2026-10-15 Batch Update with changed store settings

Molly's grouped batch role change now refuses a draft Shift that no longer meets current store minimum duration or hours. Disposable Chromium observed HTTP 400 / MIN_SHIFT_DURATION, original grouped card after reload, and direct PostgreSQL versions unchanged. Direct BHS behavior for later settings changes remains unobserved.

## 2026-10-15 repeated-hour copy evidence

Molly Copy Day preserves first/second Sydney 02:30 occurrence when the target also repeats that hour. A normal target that would collapse the interval gets a blocking preview. Generated-ADMIN Chromium tested both paths, copied the valid day and reloaded it; PostgreSQL confirmed exact UTC times and no invalid target period. Copy Shift target-date occurrence control has a passing component regression test. Direct BHS/ShiftHelper fall-back copy behavior has not been observed, so exact parity remains unverified.
## 2026-10-15 Copy Shift repeated-hour browser evidence

Molly's single-Shift Copy dialog refused a normal target that would collapse the one-hour source interval, retained the second 02:30 choice on another fall-back day and saved a distinct HandoverEmployee006 target Shift. Chromium reload and guarded PostgreSQL verified it. Direct BHS/ShiftHelper handling of repeated-hour Copy Shift remains unobserved.
## 2026-10-15 period-cycle interaction gap

Molly's configured WEEK start now guards new auto-period creation on both create and reposition. This is a Molly data-integrity result; direct ShiftHelper cycle behavior has not been observed. FORTNIGHT is available in Settings, while Calendar automatic create/move and Copy Day/Repeat still create WEEK periods. A fixed 14-day anchor and reference behavior need confirmation before fortnight interaction parity can be claimed.

## 2026-10-15 current-source local interaction evidence

Fresh Chromium and isolated PostgreSQL reconfirmed Molly Day drag-create persistence and a two-evaluator stale Resize rollback. The employee-row touch alternatives now work at 390px and 320px after sticky-navigation scroll visibility was corrected; 600px horizontal drag auto-scroll/cancel also passed. These observations update Molly's Current Behavior/Verification evidence only. Direct BHS saved gestures and target-store device behavior remain unobserved, so parity is not claimed.

## 2026-10-15 overnight pointer evidence

Molly's current-source Day View was verified by pointer and PostgreSQL through a 22:00–next-day 02:00 move to 23:00–03:00, invalid move rollback, bottom Resize to 03:00, and top Resize to 21:00, each with reload persistence. The Shift ID and canonical employee stayed stable; prior published history was unchanged. This updates Molly's Current Behavior and Verification evidence only. Direct ShiftHelper saved-operation behavior remains unobserved.

## 2026-10-15 current-source cross-row and copy evidence

Molly's employee-row pointer drag auto-scrolled a target below the 1200x650 viewport, committed one mutation and retained the canonical target employee after reload; direct PostgreSQL confirmed unchanged Shift time/ID and prior publication. Copy Day previewed and committed two separate target Shifts, with exact target assignments confirmed in PostgreSQL. Copy Previous Week preview blocked a published target and disabled confirmation. These are verified current Molly behaviors, not verified BHS/ShiftHelper parity. Actual BHS saved drag/drop and copy behavior remains unobserved.

## 2026-10-15 Molly FORTNIGHT behavior

Molly now provides a store-selected 14-day anchor and uses it in Calendar Create, Move, Copy Day, Repeat and Copy Period. Generated-ADMIN Chromium verified Settings, Day Create and Copy Day; authenticated browser-session API verified Copy Period and Repeat; isolated PostgreSQL and integration tests cover the remaining write paths. Direct BHS/ShiftHelper cycle and saved-operation behavior has not been observed, so no 1:1 parity claim is made.

## 2026-10-15 Copy Previous Fortnight source boundary

Molly now selects the prior source only when start, end and cycle type exactly match the store-configured prior cycle. In current-source Chromium, a WEEK ending 2026-10-25 was not offered as the previous FORTNIGHT for 2026-10-26..11-08; the browser showed a missing-source message and made zero copy-preview requests. Guarded PostgreSQL showed no roster mutation. This verifies Molly's boundary only; direct BHS cycle-switch behavior remains unobserved.

## 2026-10-15 Month cross-fortnight move

Molly's Month pointer drag moved one existing Shift from the final day of a FORTNIGHT to the next period's first day, preserving ID, employee and four-hour duration. Browser navigation after reload and direct PostgreSQL confirmed persistence and unchanged prior publication. Reload resets Calendar to its default October Week View in this fixture, so returning to November requires navigation; this is a Molly UX context gap, with no direct BHS comparison. Direct ShiftHelper saved-operation behavior remains unobserved.

## 2026-10-15 Molly Calendar refresh context

Molly now restores Store, Month/Week/Day view and date from validated URL context after browser refresh. Current-source Chromium verified all three views, another store and generated evaluator scope; guarded PostgreSQL showed no write. This is a Molly reliability improvement. Direct BHS refresh and deep-link behavior remains unobserved, so no parity claim is made.

## 2026-10-15 Week Availability visibility update

Molly Week employee rows now show recorded available and unavailable time windows, including local-date segments of overnight windows; unrecorded dates have no marker. In isolated Chromium an Availability 503 left Shift cards visible, Retry restored markers, a marker click opened Add and Cancel wrote nothing. Direct PostgreSQL preserved the source Shifts and publication. This updates Molly's current behavior for the Availability row interaction; BHS/ShiftHelper's row display and failure behavior remain unobserved, so exact parity is not claimed.

## 2026-10-15 repeated-hour Staff Availability

Molly Staff now offers first/second UTC-offset choices for Sydney's repeated local hour. Disposable Chromium saved and reloaded first 02:30 UTC+11 to second 02:30 UTC+10, with an exact one-hour PostgreSQL interval. This is confirmed Molly behavior; direct BHS/ShiftHelper repeated-hour entry behavior is unobserved and remains a parity gap. The Week badge continues to distinguish offsets.

## 2026-10-15 Availability concurrency follow-up

Molly Staff now refuses a stale whole-range Availability save with HTTP 409 while retaining the second editor's unsaved draft; explicit reload shows the first editor's saved row. This was verified with two independent local Chromium contexts and direct PostgreSQL. BHS/ShiftHelper's concurrent Availability editing behavior is unobserved. A Windows window inventory at this checkpoint showed one Chrome window with a Facebook title, not a visible ShiftHelper page; the user plans to open a BHS session for read-only observation. No reference-system mutation was attempted.

## 2026-10-15 reference-window observation attempt

The shared Chrome window title intermittently showed `BHS Shift Helper - Google Chrome` after the user offered to open the session, but changed to another tab when binding the returned window. Computer Use `get_window_state` failed with `node_repl exec context not found` after a fresh window recovery, so no page contents or actual BHS interaction were observed. No reference-system action was performed. Direct interaction parity remains unverified.

## 2026-10-16 formal-position candidate filter

Molly now offers a formal-position selector sourced from Evaluate position IDs, independently of the existing Shift Role skill filter. Fresh disposable generated-ADMIN Chromium and separate Evaluate/Roster PostgreSQL checks verified HandoverEmployee006 alone held QA Water, unconfirmed excluded him, and selecting him saved one canonical Shift assignment. BHS's formal-position filter behavior remains unobserved; this is a Molly workforce distinction, not a confirmed 1:1 match.

## 2026-10-16 repeated-hour click-create

Molly's Sydney Day 02:30 blank-cell click prefills first 02:30 UTC+11 through second 02:30 UTC+10 as one actual hour. Local generated-ADMIN browser Save/reload and guarded PostgreSQL verified exactly one Shift and unchanged publication. Direct ShiftHelper repeated-hour click behavior remains unobserved.

## 2026-10-15 fall-back drag-create feedback

2026-10-16 local saved-action evidence: a fresh disposable Chromium drag, second-occurrence choice and one Save persisted UTC 16:00Z–17:00Z for HandoverEmployee006; reload and direct PostgreSQL agreed, with unchanged publication. Direct ShiftHelper repeated-hour behavior is still unobserved.

Molly's Day drag mirror and Shift dialog now expose both offsets and actual elapsed duration when a selection crosses a DST change. Local generated-ADMIN Chromium verified a visible 02:00–03:00 drag initially spans two actual hours, selecting the second 02:00 makes it one hour, and Cancel writes nothing. The single-sequence 02:xx axis remains a gap. Direct ShiftHelper repeated-hour drag behavior remains unobserved; no 1:1 claim is made.

## 2026-10-15 move across a DST date

Molly's Week TimeGrid now moves an eight-hour Shift onto Sydney's fall-back date while retaining eight actual hours; a local generated-ADMIN browser drag, reload and guarded PostgreSQL verified it. Before repair, the same drag displayed a duration error and made no request. The target card reads 00:30–07:30 because an hour repeats. Direct BHS/ShiftHelper cross-date DST move behavior remains unobserved, so this is a Molly scheduling-integrity rule rather than a confirmed reference match.

## 2026-10-15 repeated-hour Shift label

Molly's Day/Week/Month Shift cards now distinguish first and second occurrences of a Sydney repeated hour with UTC offsets, as verified in local generated-ADMIN Chromium. The underlying FullCalendar axis still has one visual 02:xx sequence. Direct ShiftHelper DST display and drag behavior remain unobserved; this is a Molly clarity improvement, not a confirmed ShiftHelper match.

## 2026-10-15 Copy Day preview response

Molly now discards an in-flight Copy Day preview if the manager changes the source or target date, and only enables Copy for a preview matching the visible form. Generated-ADMIN Chromium reproduced the stale metrics before correction and verified their absence, a fresh preview and zero database writes afterward. This is a Molly workflow integrity improvement; direct BHS/ShiftHelper preview behavior remains unobserved.

## 2026-10-15 Repeat Shift preview response

Molly now discards an in-flight Repeat Shift preview if the end date or weekdays change before it returns. Local component tests and generated-ADMIN Chromium verified an obsolete result stays hidden, a fresh preview uses the displayed rule and no Repeat write occurs on Cancel. BHS/ShiftHelper's corresponding repeat workflow remains unobserved. A newly listed Chrome control skill was absent from its installed skill directory; Computer Use could list the Chrome window but still failed to capture page state. No direct reference action was performed.

2026-10-15 Copy Shift target-date follow-up: Molly now reads target-date Calendar state on a copy draft, shows target conflicts, and disables Save while the read is pending/failed or the target period is published. Generated-ADMIN Chromium blocked a published target and injected 503 without any Shift write, retried, and then in a fresh fixture copied Bob 9 October to HandoverEmployee006 10 October. Browser reload and direct PostgreSQL confirmed exactly one new Shift, DRAFT version 2, unchanged publication. BHS saved-copy and failure semantics remain unobserved.

2026-10-15 Copy Shift conflict follow-up: in a fresh disposable Chromium fixture, a source-week Bob Shift copied toward an offscreen target week with an existing Bob Shift showed a local overlap warning and sent zero Shift writes. Selecting HandoverEmployee006 instead saved one new target Shift; browser target-week navigation and guarded PostgreSQL confirmed both employees' distinct records and an unchanged publication. BHS conflict feedback and saved-copy semantics remain unobserved.

2026-10-15 reference-window recheck: Computer Use listed one Chrome window, initially titled Molly Roster; rebinding its returned ID exposed a Facebook tab title. Both original and recovered `get_window_state` calls failed with `node_repl exec context not found`. No BHS interaction was observed or performed. Saved ShiftHelper move/resize/copy/publish behavior remains unverified.

2026-10-15 Sydney fall-back TimeGrid repair: a local first-02:30 to second-02:30 one-hour Shift initially saved a 90-minute end change after a 30-minute bottom drag because FullCalendar exposed no old end instant while its resize delta was 30 minutes. Molly now applies same-day resize deltas to the saved UTC endpoints. Fresh generated-ADMIN Chromium verified bottom +30, top -30, full-card move +30, reload and guarded PostgreSQL exact UTC/version results. An unavailable extension returned 422 with visible rollback and no DB version change. The grid still labels only one visual sequence of 02:xx slots; offset choice is explicit in the form, and direct BHS DST drag semantics remain unobserved.

## 2026-10-21 Day Add Shift Job-candidate observation

In a signed-in BHS Day for 21 October, a read-only click at 09:00 opened an unsaved 09:00–09:30 Add Shift with six unchecked Jobs and `Shift Staff (0)`. Checking 全岗 populated `Shift Staff (7)`: one employee with 09:00–22:00 Availability was enabled; six other associated staff remained listed but disabled for unavailable or non-covering time. Cancel closed the draft. No BHS Save/Submit occurred. Molly's current verified-Job Add flow likewise starts with zero candidates and, after Job selection, lists exact Evaluate formal-Job holders including disabled unavailable/conflicted rows. Local Hurstville had one current 全岗 holder, disabled for unknown Availability, so `当前岗位 1 · 可排 0` is expected from its distinct source data. A red regression preceded the correction, then 32/32 focused and 312/312 frontend tests passed with normal Chrome and unchanged Roster data. Candidate-list behavior is **PARTIAL** parity; BHS Level/qualification rules and saved actions remain unverified. Historical saved-card drag tests above predate the user's later click-only requirement; Molly's current saved cards remain click-to-edit with no direct move/resize.

Further unsaved BHS Add observation: checking both 全岗 and 莉小白 kept both Job checkboxes checked and reduced `Shift Staff` from seven to four employees who visibly carried both associations. This is direct evidence of an AND candidate filter for multiple selected Jobs. The actual saved Shift representation and whether multiple Jobs can be persisted were not tested, because BHS Save is out of scope. Molly currently has one Shift Role per Shift and a separate multi-select skill filter with different semantics. Keep multi-Job persistence and filter parity open rather than inferring a database model from the unsaved form. Cancel closed the BHS draft without a write.

### 2026-10-21 BHS multi-Job client code evidence

Read-only Chrome CDP inspection of the currently loaded `https://shifthelper.bhsoftware.com.au/assets/index-B-sFzmgE.js` (6,792,343 characters, no source map) found Add/Edit Save logic near offset 5,952,850 requiring `job.length > 0`, assembling the display title from `job.map(...job_name).join("/")`, and staging an object containing the `job` array. Calendar card logic near offsets 5,918,527 and 5,920,150 iterates `qe.job` and renders a Job badge for each entry. The client update path constructs `/api/shift/update` with shift and deletion arrays. This supports multiple Jobs in the BHS staged client shift and its card display. **Server acceptance and persisted multi-Job data have not been observed**, because no BHS Save/Submit was performed. Molly still stores one `shiftRoleId`; multi-Job edit/card/storage parity remains open. The inspection made no BHS mutation and the CDP debugger was disabled afterward.

### 2026-10-21 paired Day Add modal follow-up

At the same 1600 × 1000 CSS viewport, both BHS and Molly blank 09:00 clicks produced 09:00–09:30 unsaved Add forms. BHS showed its Job/Level/Time controls and blank Shift Staff (0) panel inside an approximately 1280 × 800px dialog. Molly's dialog now has the same outer bounds and a persistent action footer; initial verified-Job employee controls stay hidden until a Job or diagnostic all-staff view is selected. Its preset actions became one dropdown, reflecting the BHS preset entry and reducing clutter. Selecting a Molly preset and Job updated the clocks/break and candidate list without saving. All drafts were cancelled. The five BHS saved cards visible on 21 October each rendered one Job; this observation does **not** prove or disprove persisted multi-Job Shifts. Molly retains one Shift Role and exact Evaluate formal-grant checks, so multi-Job parity remains open.
