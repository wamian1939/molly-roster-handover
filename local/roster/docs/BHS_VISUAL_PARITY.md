# BHS visual parity — measured evidence and open comparison

## 2026-10-21 populated Script preview

At matched 3093×1670 CSS px, signed-in BHS's unsaved Time Slot Script conversion displayed seven AA rows in a separate right result panel; its panel measured about x=1473, y=549, w=688, h=620. BHS Cancel discarded the draft. Molly initially left its 520px-wide rules popover expanded over the result. After successful Preview, Molly collapses it; the right panel measured x=1473, y=531, w=687, h=664 and all seven rows fit in its 528px list without internal scroll. The [normal-viewport Molly capture](evidence/molly-script-seven-row-preview-2026-10-21.png) shows the repaired populated state. This removes an actual obstruction while retaining Molly brand styling. Vertical panel and typography remain different, and BHS Submit was not tested.

## 2026-10-21 script week selector

Read-only signed-in BHS Staff dialog measured the This Week / Next Week switch track at **53×29 px** with a **25 px** white thumb, checked toward Next Week by default. Molly replaced its two radio controls with a 53×29 px accessible switch and retained Molly's existing brand color. Current-source local Chrome measured Molly's track at approximately **53×29 px** and observed both checked states. This is a control geometry and interaction comparison; it is not a full dialog pixel match. Both BHS and Molly dialogs were cancelled without saving.

## 2026-10-21 Hurstville Settings formal catalog hierarchy

Read-only BHS Setting → Job Info presents six numbered Job choices and a separate Related Staff List. Molly previously placed its three legacy draft-role warnings above the six current formal jobs. The current-source local browser now shows the six Evaluate-backed definitions first, with the historical 11-Shift review in a collapsed disclosure below the settings; [local browser capture](evidence/molly-settings-formal-first-2026-10-21.png). The capture shows the formal list in the initial viewport. This improves information hierarchy while keeping Molly's brand and the repair links. It is a structural comparison at different browser viewports, not a pixel-level BHS match or an employee-grant comparison. BHS data was not changed.

## 2026-10-21 narrow Day scheduled-sidebar position

Molly's below-grid scheduled sidebar stacks vertically at widths up to 1199px. Before the fix, opening it at 640×800 scrolled to the Calendar top and left its heading at y=2429px. Current-source synthetic Chromium after the responsive scroll target measured y=84px at 640×800 and y=83.5px at 1000×900. [Narrow sidebar screenshot](evidence/molly-day-sidebar-open-narrow-current-2026-10-21.png) shows the title, date picker, filter and employee card visible above the bottom navigation. Wide desktop retains the same-viewport BHS-derived Calendar position. The private BHS reference was desktop only; BHS narrow-screen sidebar behavior is unobserved, so this is Molly usability evidence rather than a visual-parity claim.

## 2026-10-21 current-source Day sidebar positioning

The existing private BHS Day reference (3093×1670 CSS viewport, no BHS write) places the calendar top near y=143px. A fresh synthetic Molly current-source browser run at that viewport reproduced y=-154px after clicking the below-grid sidebar toggle: the browser had scrolled to the button and the first Day slots were off-screen. Opening the sidebar now scrolls the Calendar page root into view. [Current-source synthetic screenshot](evidence/molly-day-current-reference-viewport-2026-10-21.png) measures calendar and sidebar y=137px, with five Shift cards and five employee cards. At 1600×1100, close/reopen measures y=129px. This is a Day visibility correction, not a pixel match or proof of BHS saved-operation parity. The BHS image stays untracked/private because it contains real staff data.

## 2026-10-21 Day Scheduled Shift employee cards

The previously captured private signed-in BHS Day image has employee cards with a distinct total-hours panel and a visible Worklog bar. Molly previously compressed each employee into a single summary line. The Day sidebar now uses a bordered card, explicit hours, current Evaluate formal Job label when available and a Worklog disclosure while retaining Molly colors and typography. [Synthetic desktop](evidence/molly-day-worklog-card-desktop-2026-10-21.png) and [640px narrow](evidence/molly-day-worklog-card-narrow-2026-10-21.png) screenshots were inspected. The narrow card's expanded row initially fell below a fixed 600px sidebar; the mobile sidebar now grows with content and bounds only a long results list. This is a structural and interaction improvement, not pixel parity: BHS's real employee data, colors and overall typography differ. No BHS data changed.

## 2026-10-21 Script dialog tab overlap fix

Current-source Molly Chrome at **2109 × 1139 CSS px** showed the Script dialog's explanatory subtitle and absolutely positioned tab strip overlapping; after removing the redundant subtitle, the tab strip still covered the source-panel heading. The tab strip now participates in normal layout. Fresh Chrome measured a **12.9 px** gap between the tab strip bottom and source heading top on Time and New, and **24.9 px** on Edit. A narrow viewport measured **582 CSS px** after the browser override settled: one-column content, no tab/heading overlap and no page horizontal overflow; the override was reset. [Current desktop screenshot](evidence/molly-script-tabs-no-overlap-2026-10-21.png). The desktop dialog measured about **870 px** tall at this viewport, so the older 847 px BHS comparison is no longer an exact-height match. Readability and working input take priority; populated BHS/Molly visual comparison remains open. No reference-system data was changed.

## 2026-10-21 Day secondary actions moved below the grid

The user prioritizes Day scheduling and asked for fewer buttons in its top row. BHS's read-only Day image confirms Batch Operation and Sidebar controls below the time grid. Molly now keeps only store, date navigation and Month/Week/Day in the top row. Its `排班操作` menu moved below the grid beside `查看工时侧栏`; Copy Day and Copy Previous Week stay inside that menu. The footer menu opens upward so it remains visible at the end of the Day page. [Top screenshot](evidence/molly-day-minimal-top-2026-10-21.png) and [footer screenshot](evidence/molly-day-footer-actions-2026-10-21.png) show current-source isolated Chrome at 2109 × 1139 CSS px. This follows the reference operation placement while retaining Molly controls and styling.

## 2026-10-21 authenticated Day image comparison

The signed-in BHS Day page was captured **read-only** through Chrome DevTools `Page.captureScreenshot` after the ordinary browser screenshot path timed out. The source viewport was **3093 × 1670 CSS px**; Chrome returned a **2320 × 1253 JPEG** (approximately 0.75 raster scale). Its raw image is kept only in the ignored `.private-reference/` directory because it contains real employee names and schedules. It is not a tracked QA artifact. No BHS Save, Submit, Delete or other business mutation occurred.

Direct image review confirms the previously measured structure: one 24-hour Day time axis, five saved Shift cards distributed into three overlap columns, role/time/break/name text within each card, and the open Scheduled Shift panel with an independent month calendar, Job filters, employee hour cards and Worklog controls. The main Day toolbar shows Today, Back, Next, date, and Month/Week/Day. Copy is in Batch Operation below the calendar, not in that primary row.

The [synthetic Molly Day capture](evidence/molly-day-scheduled-sidebar-reference-viewport-2026-10-21.png) was made at the same CSS viewport. Its Day grid, five-card overlap placement and panel widths are close to the BHS measurements below. Remaining visible differences include BHS's card-style employee summaries and Worklog controls versus Molly's compact expandable list, toolbar wording/placement, and product-specific typography, color and border treatment. The role labels and employees in the Molly capture are synthetic and cannot be compared as content. Molly keeps its own brand. This image comparison does **not** verify BHS Save/Submit behavior, Shift eligibility, overnight attribution or real store-account acceptance.

Earlier sections saying that a BHS screenshot was unavailable describe the previous screenshot route; this CDP capture supersedes that evidence limitation for the Day view only.

## 2026-10-21 Day toolbar simplification

The authenticated BHS Day accessibility tree and read-only DOM again showed Today, Back/Next, focused date and Month/Week/Day in the primary row, with Copy absent. The ordinary screenshot route timed out at this stage; a later CDP image capture is recorded above. Molly removed the role-color legend from that row and replaced the text More button with an accessible ellipsis icon. [Current-source Molly screenshot](evidence/molly-day-simplified-toolbar-2026-10-21.png) records the compact toolbar at 2109 × 1139 CSS px. This particular toolbar capture uses a different viewport from the BHS reference, so it is not a same-viewport visual-match claim. Molly brand styling remains intentional.

## 2026-10-21 mini-calendar navigation controls

The BHS right panel visibly uses month/year selectors plus arrow buttons and week numbers 40–45 for October 2026. Molly now places native month/year selectors between its arrows and adds the week-number column to its six-week grid. Its Day surface and panel still measure 1903.72/801.59 px at the paired 3093 × 1670 CSS px viewport, with no page overflow; [current-source screenshot](evidence/molly-day-sidebar-month-year-2026-10-21.png). A later private BHS image capture confirms the broad arrangement above; exact font/padding/color equivalence is not claimed.

## 2026-10-21 Day Scheduled Shift side panel

Signed-in BHS Day was inspected read-only at **3093 × 1670 CSS px**. Opening its bottom Sidebar control narrowed the Day grid to approximately **1902 px** and opened an approximately **805 px** right panel. It contains an independent six-week month calendar with continuous date-range selection, staff search, Job checkboxes, net-hour totals and Worklog details. These dimensions are DOM measurements; the later CDP image capture above supplies visual context without a BHS data write.

Molly now has an optional panel below the Day grid, preserving the compact top toolbar. At the same viewport, current-source isolated Chrome measured the main Calendar surface at **1903.72 px** and the panel at **801.59 px**; the page had no horizontal overflow. Its selected date range did not navigate the main Day. Current-source [single-date](evidence/molly-day-scheduled-sidebar-reference-viewport-2026-10-21.png) and [cross-month range](evidence/molly-day-scheduled-range-2026-10-21.png) screenshots record the synthetic five-card fixture and panel. The panel begins about 31 px above the BHS measurement; exact vertical treatment and overnight-hour attribution remain open parity items.

## 2026-10-21 Day five-card geometry and text comparison

At **3093 × 1670 CSS px**, signed-in BHS Day was inspected read-only. Five shifts occupied three columns. Its first three event rectangles (x/y/width/height px) were **446.60/751.17/875.13/725**, **1324.73/751.17/872.13/422.08**, and **2199.85/811.75/872.13/361.5**. The time gutter was **103.94 px**. BHS role/time/break/name type measured 22.5/25/17.5/25 px; the first card's respective y positions were about 752.5/802.5/837.5/882.5. No reference Save, Submit or data mutation occurred. These are DOM and computed-style measurements; the later private image capture above supports qualitative comparison only.

A guarded disposable Molly fixture recreated five synthetic shifts at the same local clock ranges, with distinct roles and breaks to retain five cards. After the Day adjustment, its first three rectangles were **446.24/751.28/869.86/726.01**, **1316.08/751.28/869.87/423.01**, and **2185.94/811.28/869.86/363.01**. The time axis was **101.99 px** and now shows `12:00 AM`, `1:00 AM`, etc. The first card's role/time/break/name y positions were about 753.1/803.1/838.1/883.0, with 22.5/25/17.36/25 px type. Five-hour cards now use the same readable typography; they previously fell to 11 px role type. [Synthetic Molly screenshot](evidence/molly-day-five-card-reference-viewport-2026-10-21.png).

The second and third Molly columns still begin about **8.7 px** and **13.9 px** left of BHS, and the right event edge is about **16 px** left because the app workspace reserves width for a vertical scrollbar. Colors, border/radius and role/employee labels remain product specific. The synthetic `QA Other` role is deliberately unqualified in the isolated Evaluate data, so Molly correctly marks it historical/unverified; it is not an official Job proposal.

## 2026-10-20 sparse Day height correction

At the normal 2109×1139 Molly viewport, the Hurstville Day had one scheduled employee and 25 workforce members. Removing the unneeded paging panel moved its time grid from approximately **y=368 to y=232 CSS px** while retaining the existing card. This improves the Day work area within Molly's visual system; the earlier y=368 measurement below is the pre-fix state. BHS was measured at a different viewport, so a same-viewport density comparison remains open. No BHS data was changed.

## 2026-10-20 current signed-in Day measurement

Read-only authenticated BHS Day DOM at 3093×1670 CSS px measured the time grid around `x=340,y=143,w=2733,h=1458`, its time content at `y=144,h=1455`, a visible time slot at 30 px and grid font at 20 px. Molly's live Day was measured at a **different** 2109×1139 viewport: grid `x=342,y=368,w=1732,h=925`, visible slot 18.75 px. These numbers must not be compared as a same-viewport screenshot gate. The prior BHS and Molly 4536×2449 same-viewport geometry remains a historical test, while a fresh paired Day capture at a normal store desktop viewport is still open. No BHS data was modified.

## 2026-10-20 script tabs height regression correction

Adding the three observed BHS tabs left Molly's empty script dialog at **1300×826 px** in a 3093×1670 CSS px Chromium viewport, versus the earlier read-only BHS measurement of **1300×846.8 px**. Increasing the script/preview region minimum height by 21 px returned Molly's panel to **1300×847 px** at x=896.5, y=411.5; the textarea stayed **353×504 px**. The browser regression now asserts the panel dimensions and exercised all three tabs, the transient draft reset, shortcut save, Preview and Cancel. [Time tab screenshot](evidence/molly-script-tabs-time-2026-10-20.png) and [Edit tab screenshot](evidence/molly-script-tabs-edit-2026-10-20.png) are Molly captures; the current BHS Chrome tabs are at login, so the reference measurement is historical and this is geometry evidence for the empty state only. The expanded Molly shortcut panel covers part of the right preview, and populated-state comparison remains open.

## 2026-10-20 Week/Day same-viewport grid correction

Prior authenticated, read-only BHS Week/Day measurements at **4536×2449 CSS px** were `x=340,y=143,w=4176,h=2237` for both views, with approximately 91.8 px/Week hour and 93.0 px/Day hour. Current-source Molly before this correction measured `x=341,y=143,w=4174,h=2171` and 89.31 px/hour. A browser assertion against BHS height failed. After changing the time-slot viewport offset, Molly measured `x=341,y=143,w=4174,h=2237` and 92.06 px/hour in both views: absolute outer-grid differences are 1 px x, 0 px y, 2 px width and 0 px height; approximate hour differences are 0.26 px Week and 0.94 px Day. See [Week screenshot](evidence/molly-week-reference-viewport-2026-10-20.png) and [Day screenshot](evidence/molly-day-reference-viewport-2026-10-20.png). These are synthetic Molly screenshots compared with **earlier BHS DOM measurements**, because the current BHS session is at login; no paired BHS screenshot or dense-card visual claim is made. The measured Molly grid remained selectable at this viewport and had no Roster writes.

## 2026-10-20 desktop sidebar and Month surface follow-up

The prior authenticated BHS measurement at 3093×1670 CSS px recorded sidebar widths 320/60 px and Month surface `x=340, y=143, width=2733, height=1458`. Molly's previous sidebar was 280 px with no toggle, and the Month surface was shorter. Current-source isolated Chromium now measures Molly expanded sidebar **320 px**, collapsed sidebar **60 px**, expanded/collapsed navigation links **298×40 / 40×40 px**, and Month surface **x=341, y=143, width=2731, height=1458 px**. The desktop toggle works across Calendar→Settings→Calendar navigation. At 640×800, the mobile drawer still works and the page has no horizontal overflow. Week/Day empty time drags were repeated 24 times at 2109×1139; every unsaved draft showed 14:00–15:30 and no Roster mutation was sent. Screenshots: [expanded](evidence/molly-month-sidebar-expanded-2026-10-20.png), [collapsed](evidence/molly-month-sidebar-collapsed-2026-10-20.png). The BHS session is currently at login, so this is a comparison with prior measured reference geometry; dense Month, role styling, Settings content, other viewport sizes and saved BHS interactions are not proven equivalent.

## 2026-10-20 dense Month popover

Molly's isolated 50-employee fixture exposed 50 Shifts on each of five dates. Its height-based `+47 more` control retained all 50 events but the initial popover was about 1818 px tall and reached past a 1139 px viewport. A scoped scrollable body now measures 640 px desktop or 440 px at 640×800 CSS px; the last Shift can be reached and opened. BHS showed 158 visible Month events and no `show more` link at its large 4536×2449 CSS px viewport. Its smaller-viewport overflow rule remains **NOT VERIFIED**; the reference session later required re-login, so this Molly popover behavior is a reliability fix rather than a proven exact BHS match.

## 2026-10-20 Week and Day time-grid measurement

At BHS's current 4536×2449 CSS px viewport, Week and Day grids each measured approximately **x=340, y=143, width=4176, height=2237 px**. Both showed all 24 hourly labels; a Week hour group was about **91.8 px** and a Day hour group about **93.0 px**. This is one large-viewport reference measurement; identical-size Molly comparison and shorter BHS viewport behavior remain open.

Molly previously used a fixed 42 px per 30-minute slot. It now scales desktop time-grid slots with viewport height and the store's configured 15/30/60-minute interval, down to an 18 px minimum, while retaining 46 px mobile slots. At Molly's normal 2109×1139 CSS px viewport with 30-minute settings, Week and Day slots measured **18 px**, and browser blank drags opened correctly timed unsaved drafts after the grid settled. Molly's Day view still starts substantially lower because of its toolbar, legend and employee filter, so equal visual placement is not yet achieved. Saved Shift cards remain click-only by user requirement.

## 2026-10-20 Month density follow-up

In the authorized BHS Hurstville October 2026 Month DOM, the grid rendered **5 week rows**. There were **158 visible event elements** and no `rbc-show-more` links at its then-current 4536×2449 CSS px viewport. Sample visible event text contained **role, local time range and break duration**; employee names were in the event title. The BHS weekday header used `rgb(62,90,91)` background, warm text, 18 px type, and about 28 px height. The Month grid height was 2237 px at this viewport, approximately viewport height minus 212 px. This large-viewport observation does not establish BHS overflow behavior on a short viewport.

Molly previously used six fixed week rows even when October needed five, limited a day to three visible events, and showed employee names above the time in a two-line compact card. The current Month grid uses the actual 4/5/6 week count, lets FullCalendar calculate overflow from cell height instead of a hard three-event cap, fills more of the available viewport and gives all weeks equal height. The Month card shows role, time and break on one line, retaining full employee names in its accessible label/title; the header now uses the measured BHS colors and 18 px text. At Molly's normal 2109×1139 CSS px viewport, October now measures about **859 px** high with **five 167 px rows**. November 2026 produced six equal 139 px rows; February 2027 produced four equal 208 px rows. At 640×800 CSS px the minimum grid was 540 px with five equal 102 px rows and horizontal grid scrolling. BHS and Molly still differ in toolbar position, dense-data appearance, Shift role colors, modal and Day/Week behavior; this is partial Month parity.

## 2026-10-20 Month Calendar same-viewport measurement

At **3093 × 1670 CSS px**, read-only DOM rectangles in the signed-in Hurstville BHS Month view measured its calendar grid at **x=340, y=143, width=2733, height=1458 px**. The first weekday header was about **389 × 28 px** with 18 px text; a sample event was about **388 × 27 px** with 20 px text. Molly's normal Month view before the scoped width change measured **x=887, y=213, width=1614, height=497 px**; its first weekday header was about **230 × 24 px** with 13 px text, and a sample Shift card about **226 × 30 px** with 11 px text. The large horizontal difference came from the shared page frame's 1680 px cap.

The Calendar page alone now uses the available workspace width. Live HMR measurement at the same viewport found the Molly Month grid at **x=342, y=213, width=2729, height=497 px**. Horizontal placement and width are close to the BHS reference; **vertical extent, header and event typography, density, overflow, and interaction behavior remain open**. Other Molly pages retain their existing page-frame width. This is visual geometry evidence, not a claim of full parity.

## 2026-10-20 Staff script editor reference

Read-only Chrome observation in the authorized Hurstville BHS Staff page, viewport **3093 × 1670 CSS px**. The visible `Preset Time Slot Script` panel measured approximately **1300 × 847 px** with **10px** panel padding. Its three tabs were **35px** high and used **17.5px** text; the ordinary textarea measured **352 × 504 px**, with **17.5px** text and `10px 15px` padding. BHS showed a left script fieldset, middle convert/clear controls, right append preview and footer Cancel/Submit. The editor was cancelled without writing to BHS.

Molly's independently tested editor showed the same broad left/convert/right structure, but its current title/header, tab count, shortcut placement, pane sizing and typography differ.

### Same-viewport comparison (2026-10-20)

Both pages were measured at **3093 × 1670 CSS px** using read-only DOM bounding rectangles and screenshots. The browser viewport override was reset after the measurement.

| Element | BHS | Molly | Gap |
| --- | ---: | ---: | --- |
| Dialog panel | 1300 × 847 px | 1440 × 743 px | Molly is 140 px wider and 104 px shorter. |
| Dialog top | 412 px | 464 px | Different vertical placement. |
| Script textarea | 352 × 504 px | 606 × 220 px | Molly is much wider and less than half as tall. |
| Script textarea font | 17.5 px, 25 px line | 14 px, 21 px line | Molly is denser. |
| Tab navigation | Three tabs | No equivalent tabs | `Time Slot Script`, `New: Time Slot Script`, `Edit Script` remain a functional and visual gap. |
| Right preview fieldset | 688 × 620 px | 606 × 467 px | Molly preview is smaller. |

The BHS `New: Time Slot Script` tab held a separate initially blank draft. Switching back to the ordinary tab cleared the earlier unsaved synthetic draft. An attempted synthetic convert in the New tab produced no visible preview and Submit remained disabled; the exact enablement rule is **unknown**. All BHS drafts were cancelled; no reference data was saved. Do not copy unverified New-tab submit behavior into Molly.

At this initial measurement, Molly's dialog was not visually matched. The layout gap was an implementation target, subject to keeping the Molly brand and the canonical-employee validation workflow.

### Implemented same-viewport layout follow-up (2026-10-20)

On a fresh isolated current-source Molly stack, the panel and its main script/preview regions were adjusted and remeasured at the same **3093 × 1670 CSS px** viewport. Measurements below are browser `getBoundingClientRect()` values, rounded to 0.1 px. BHS values are from the earlier read-only reference capture at that viewport.

| Element | BHS | Molly after change | Absolute difference |
| --- | ---: | ---: | ---: |
| Dialog x / y | 896.7 / 411.9 | 896.4 / 413.1 | 0.3 / 1.2 px |
| Dialog width / height | 1300 / 846.8 | 1300 / 843.8 | 0 / 3.0 px |
| Script fieldset x / y | 942.5 / 548.7 | 942.4 / 550.0 | 0.1 / 1.3 px |
| Script fieldset width / height | 375 / 620 | 375 / 620 | 0 / 0 px |
| Script textarea x / y | 953.8 / 653.7 | 953.3 / 655.9 | 0.5 / 2.2 px |
| Script textarea width / height | 352.3 / 503.7 | 353.2 / 504.0 | 0.9 / 0.3 px |
| Append fieldset x / y | 1473.4 / 548.7 | 1473.4 / 550.0 | 0 / 1.3 px |
| Append fieldset width / height | 687.5 / 620 | 687.0 / 620 | 0.5 / 0 px |

The editor uses 17.5 px / 25 px text to match the measured BHS textarea. The visually awkward inline shortcut section became a header popover; its expanded 520 px width keeps the code and time inputs visible without horizontal clipping. Molly also adds a clear-script control; isolated Chrome verified it removes the input and invalidates the dry-run preview. At 640 CSS px, the dialog stacked vertically and had zero horizontal overflow. Its preview, clear and cancel operations produced no Availability or import audit rows in guarded direct PostgreSQL readback; only an explicit test-store shortcut configuration version 1 was saved. The disposable browser stack and database schemas were removed after verification.

This is **geometry parity for one empty dialog state**, not complete visual or functional parity. BHS still has three tabs, a different title treatment and unverified New-tab/Submit semantics; populated preview, error and multiple-employee states need paired visual checks.

## Remaining measurements

Sidebar width/collapse and outer Month surface geometry have same-viewport measurements. Month/Week/Day cell geometry under dense data, Shift card dimensions, Staff table row metrics, Setting tabs and Copy/Publish dialogs still require paired same-viewport measurement. Record the BHS value, Molly value, viewport, method and error margin before changing shared design tokens.

## 2026-10-21 Day grid same-viewport follow-up

Read-only observation of the signed-in BHS Day view at **3093 × 1670 CSS px** measured the time view at **x 340, y 142.67, width 2733.33, height 1458 px**. Its time content began at **y 144** and a half-hour occupied about **30.29 px**. No BHS Save or Submit was used.

In a current-source Molly browser backed by disposable paired PostgreSQL schemas, the Day view after moving the role legend into the toolbar and removing the redundant Day weekday header measured **x 341.80, y 144.29, width 2715.48, height 1456.59 px**. Its time content began at **y 144.29** and a half-hour occupied **30.33 px**. The Day grid now lands within about 2 px vertically at the same viewport; its width is about 18 px narrower. Screenshot: `docs/evidence/molly-day-same-viewport-2026-10-21.png` (synthetic roster data only).

This measures grid geometry, not full visual parity. BHS and Molly had different roster data, so card density and card dimensions were not compared. Typography, colors, tool actions, employee presentation and saved BHS interactions still need direct paired evidence. At 900 and 430 CSS px, Molly's toolbar wrapped and the page had no document-wide horizontal overflow; the 430 px layout used two control rows and a separate legend row.

The evidence screenshot was recaptured after a fresh page load at the target viewport. An immediate capture during a Chrome emulated narrow-to-wide transition showed an inner calendar table that had not yet reflowed and was discarded. Physical resize behavior remains unverified.

## 2026-10-21 Job list cropped reference

[Read-only BHS Job Info job rows](evidence/bhs-job-list-cropped-2026-10-21.png) and [Molly formal job rows with current Evaluate grants](evidence/molly-formal-job-grants-2026-10-21.png) are available for visual review. BHS used six colored gradient rows with staff counts; Molly retains its brand rows and explicitly labels Evaluate formal grants. The crops came from different active viewports (BHS 5498×2970 CSS px, Molly 2109×1139 CSS px), so they establish content and layout direction, **not** pixel-level parity. Same-viewport full-page comparison remains open.

## 2026-10-21 Day edit candidate density

Read-only BHS Day Edit Shift for a 17:00–22:00 全岗 card listed seven candidates after current Job/Level/Availability filtering. Molly's prior editor listed 25 store employees, most disabled. Molly now defaults to verified Job/Availability/conflict candidates and offers 显示全部员工 for diagnostic review. The local screenshot docs/evidence/molly-day-eligible-staff-2026-10-21.png has zero candidates for a different 10:00–10:30 draft and different employee Availability; it proves behavior, not matched card-count or pixel parity. A temporary viewport override was reset after the BHS and Molly windows continued reporting different CSS viewport dimensions. Full paired same-viewport modal screenshots remain open.

## 2026-10-21 Day candidate-list density observation

BHS Add Shift at 09:00 showed six Job checkboxes and `Shift Staff (0)` before selection. Molly's prior Day Add displayed 25 disabled Hurstville employees at this point; it now shows a choose-Job prompt and zero initial candidates for verified formal Job catalogs. This aligns the initial information density without changing Molly branding or formal qualification rules. A CDP viewport override applied to the BHS tab reported a nominally matching CSS viewport, but screenshot capture and content width did not match the normal Molly window. The override was cleared, and this pass does **not** claim same-viewport pixel comparison. Dense-card and paired modal geometry remain open.

## 2026-10-21 Day at 1600 × 1000 CSS px

Both signed-in Chrome tabs reported the same **1600 × 1000 CSS px** viewport under temporary per-tab CDP device metrics overrides; the overrides were cleared afterward. BHS was observed read only. BHS Day time grid began at y≈143 and each hour occupied 40px. Molly before this pass began at y≈197 and alternated roughly 29px labeled slots with 18px unlabeled slots because the 20px hour text had a 28px line box. Molly now uses equal 20px half-hour rows, a 960px 24-hour time body and a grid start at y≈136. The Molly toolbar no longer wraps at this width; its date navigation and view switch remain visible.

This is a measured time-axis and toolbar correction, not full visual parity. Molly's grid top is about 7px above BHS; saved card density, colors, text, modal and multi-Job behavior still need paired comparison. The BHS and Molly windows have different native zoom settings, so CSS viewport sizes were verified from each tab rather than inferred from physical screenshots.

## 2026-10-21 paired Day Add modal at 1600 × 1000 CSS px

Both tabs reported 1600 × 1000 CSS px through temporary per-tab viewport overrides. An unsaved 09:00–09:30 Add Shift was opened on each Day grid and both were cancelled. BHS's screenshot showed an approximately **1280 × 800px** panel centered at x≈160/y≈100; Job, Level, Shift Time and note occupied its left column, Shift Staff (0) its right, with Cancel/Save on the bottom. Its Job and staff fieldsets measured x=180/w=434 and x=624/w=796. Molly's prior panel measured **1440 × 968px** at x=80/y=16 and had 1198px of scrollable content. The current Molly panel measures **1280 × 800px** at x=160/y=100. Its header is about 86px, main scroll region 618px and always visible footer 96px. The BHS outer bounds come from the live screenshot; Molly outer and internal bounds come from DOM rectangles.

Molly now uses one preset dropdown in the left column and withholds employee search/advanced filters until a Job or diagnostic all-staff view is chosen, placing the initial empty staff region at y≈340 instead of y≈636. Its extra qualification/Availability controls, two note fields, wording, colors and single Shift Role still differ from BHS. This is a concrete modal density improvement, **not** complete pixel or workflow parity. No screenshot file was archived in this pass. The browser viewports were restored afterward.
