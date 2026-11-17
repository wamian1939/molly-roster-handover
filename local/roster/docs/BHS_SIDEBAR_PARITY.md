# BHS sidebar parity

## 2026-10-21 signed-in icon and link-state measurement, read-only

The current signed-in BHS Setting page again has exactly five ordered desktop links: Calendar (`/calendar`), Export (`/export`), Staff (`/staff`), Setting (`/setting`) and Help (`/help`). At the current 5498×2970 CSS viewport, each expanded link measured approximately 299×40 px with 17.5 px text, a 10 px icon gap and 8 px radius. Its active Setting link had `rgb(30,58,59)` background; the inactive Calendar link had a transparent background and `rgb(248,224,178)` text. The rendered Lucide SVG names were `calendar-days`, `cloud-download`, `id-card`, `settings` and `badge-help`. A transient forced `:hover` on the inactive Calendar link produced no computed background or text-color change in this measurement and was cleared; this does not establish every pointer/focus animation.

Molly's shared links use `CalendarDays`, `Download`, `UsersRound`, `Settings` and `HelpCircle`, with its Templates link between Staff and Settings. The three icon-shape differences and extra Templates destination are explicit visual/product differences. Molly retains its established brand and navigation; this observation does not authorize copying BHS colors or removing Templates. No BHS route was opened, form edited or business data changed during this check.

## 2026-10-21 signed-in navigation and Setting recheck, read-only

The current Chrome BHS Staff page again showed the five ordered top-level links Calendar, Export, Staff, Setting and Help. Its Setting page exposed Store Info, Preset Shift, Shift Export Setting and Job Info as page tabs, rather than sidebar children. Job Info listed six Hurstville entries (`带训员`, `莉小白`, `前台`, `培训`, `后厨`, `全岗`); Preset Shift showed AA/BB/CC with 10:00–22:00/60-minute, 10:00–17:00/30-minute and 16:00–22:00/0-minute breaks. These observations agree with the earlier dated record. Only navigation and tab selection occurred; no BHS form was edited or submitted. Calendar navigation was avoided because its load can write settings. Molly's top Calendar row remains deliberately small, with Copy in the footer action menu under the user's Day-first preference.

## 2026-10-21 account popover, read-only

The signed-in BHS account control showed the current Hurstville account/store. Opening it exposed only `Home` and `Log Out`, with no store-switch action in this account's menu; it was closed by clicking the Day heading. Molly retains its own account footer and logout within the existing brand shell. The observed menu is a reference UI difference, not evidence of cross-store authorization or a reason to add a store-switch control. No BHS account action was submitted.

## 2026-10-20 Molly navigation order follow-up

Molly's desktop sidebar and mobile drawer now list Calendar, Export, Staff, its own Templates extension, Setting and Help. This follows the observed BHS five-link order for shared destinations while retaining the Molly-only Templates page. The mobile bottom bar remains Calendar, Staff, Templates, Export. Clean-fixture Chromium verified both orders, navigation, expanded/collapsed geometry and no Roster write; the prior BHS order remains a dated reference observation because the current Chrome tabs are at login.

## Measured desktop geometry, 2026-10-20

At 3093×1670 CSS px, read-only Chrome DOM measurements found the BHS sidebar **320 px** wide when expanded and **60 px** when collapsed. Its five links were about **299×40 px** expanded, with **17.5 px** text, **20 px** icons, 10 px icon/text gap, 10 px horizontal padding and 8 px corner radius; collapsed links were **40×40 px**. The active Staff background was `rgb(30,58,59)` against sidebar `rgb(62,90,91)`. Molly previously used a 280 px sidebar and roughly 246×55 px links, with no desktop toggle. Current-source isolated Chromium now measures Molly at **320 px expanded, 60 px collapsed, 298×40 px expanded link, 40×40 px collapsed link**, with a working toggle and accessible icon-only links. Molly retains its brand colors and its sixth top-level Templates link. BHS hover, account popover and persistence of the collapsed state remain unverified.

The same-viewport Molly Month surface now measures **x=341, y=143, width=2731, height=1458 px**, against the earlier BHS read-only measurement **x=340, y=143, width=2733, height=1458 px**. These are geometric comparisons, not a claim about dense content, colors or complete workflow parity. [Expanded Molly screenshot](evidence/molly-month-sidebar-expanded-2026-10-20.png) and [collapsed screenshot](evidence/molly-month-sidebar-collapsed-2026-10-20.png) use synthetic roster data. At 640×800 CSS px, the desktop sidebar hides, the mobile drawer opens/closes and the document has no horizontal overflow. Isolated browser navigation and layout checks sent zero Roster mutations.

Observed in the signed in Hurstville reference session on 2026-10-20. BHS has five ordered top level links and no visible sidebar child links. The Setting and Help subnavigation is on the destination page.

| Order | BHS menu | BHS submenu | BHS destination / observed purpose | Molly current | Missing | Priority | Evidence |
|---:|---|---|---|---|---|---|---|
| 1 | Calendar | None | `/calendar`, Month/Week/Day, Batch Operation, Scheduled Shift sidebar | `/calendar` | Detailed layout and gesture parity | P0 | BHS Calendar accessibility observation, 2026-10-20 |
| 2 | Export | None | `/export`, date range, PDF/Excel, four preview tabs | `/export` | Export mode and layout comparison | P1 | BHS Export accessibility observation, 2026-10-20 |
| 3 | Staff | None | `/staff`, table, script, add, row and batch menus | `/staff` | Script workflow | P0 | BHS Staff accessibility observation, 2026-10-20 |
| 4 | Setting | None | `/setting`, Store Info, Preset Shift, Shift Export Setting, Job Info tabs | `/settings` | Shortcut and export settings; preserve Evaluate ownership | P1 | BHS Setting four tab observations, 2026-10-20 |
| 5 | Help | None | `/help`, Usage Instructions, Features, Tips tabs | `/help` | Content parity | P2 | BHS Help three tab observations, 2026-10-20 |

Molly has a sixth top level link, `排班模板`, after Staff. BHS does not expose a matching first level link in this account; this remains a Molly extension. BHS has a BH Software brand button, account/store popover and Toggle Sidebar. Molly retains its Molly brand, user menu and mobile navigation while providing a desktop collapse toggle. Icon shapes and the inactive Calendar link's computed hover colors were measured in the 2026-10-21 check above; keyboard-focus styling, collapse persistence and responsive BHS behavior remain unverified.
