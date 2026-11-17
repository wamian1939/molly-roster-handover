# Molly Roster QA Report

Date: 2026-09-07 (Australia/Sydney)

## Outcome

No known P0 or blocking P1 defect remains. The local product is suitable for an internal pilot. Production release still requires the credentialed and infrastructure gates in `ROSTER_DEPLOYMENT_READINESS.md`.

## Automated verification

| Layer | Result | Coverage highlights |
|---|---|---|
| Frontend lint | Pass | ESLint across source and tests |
| Frontend tests | 4 files, 22 tests passed | Date/time, scheduling conflicts/warnings, daily/configured-week/break rules, API errors, 500-employee picker pagination/search and shift submission |
| Frontend production build | Pass | TypeScript project build and Vite production bundle; no chunk-size warning |
| Backend tests | 4 files, 33 tests passed | Store scope, PII allowlist, contract version, archived employees, official snapshots, operating-rule enforcement, published/batch lock, optimistic concurrency, advisory lock recheck, exports, outage and session expiry |
| Backend production build | Pass | Prisma Client generation and TypeScript compilation |
| Production start smoke | Pass | Real `dist/server.js`; health 200; `/calendar` SPA 200; CSP/frame/no-cache headers present |
| Evaluate regression | Pass | Frontend build/lint and 87/87 tests; backend build and 123 passed / 5 intentionally skipped |
| Prisma | Pass | Schema validate; 2 migrations applied; no pending migrations; seed passed |
| Dependency audit | Pass | Root and backend production audits report 0 vulnerabilities |

## Real browser acceptance

The browser used the existing authenticated ADMIN session and the live local frontend/API/database.

### Day create and cancel

- Switched to Hurstville and Day.
- Pointer-dragged 09:00→10:00. The dialog prefilled exactly 09:00 and 10:00.
- Canceled the first attempt; the database still contained zero shifts.
- Repeated the drag, selected HandoverEmployee006 and saved. The calendar showed 09:00–10:00.
- The employee card showed `T2 · 73.3` and current skill percentages, without HR PII.
- Database evidence recorded HandoverEmployee006's score `73.30`, Tier `T2`, and official round id.

### Edit, delete and multi-staff

- Edited the shift to add HandoverEmployee018; both names rendered.
- Exercised the two-step delete confirmation and confirmed the event disappeared.
- Created 10:00–17:00 with HandoverEmployee006 and HandoverEmployee018; Day showed both names and Month stayed compact.
- Created 09:00–10:00 with HandoverEmployee023 on the 390×844 mobile layout.

### Availability and warning behavior

- Saved HandoverEmployee006 as AVAILABLE 09:00–17:00 through the Staff page; the database stored the Sydney-local window correctly.
- Drafted 17:00–22:00 and observed `超出可用时段` before save.
- Availability UNKNOWN is never silently treated as available.

### Batch, templates, settings and context

- Selected two shifts and batch-changed both to the same role; UI reported `已更新 2 个班次`.
- Created a store shift template and availability template.
- Saved Hurstville rules and created a Hurstville custom role.
- After the shared store-context fix, Hurstville remained selected when navigating Settings → Templates → Calendar → Export, without storing scope in localStorage.

### Publish, export and concurrency

- Published the period, confirmed events could not open for editing, and received the reopen-first message.
- Reopened, modified, then published again. Two immutable publication records remain.
- Employee-safe and ADMIN manager CSV downloads were each captured by pairing the download wait with the click on the same authenticated tab.
- Opened the same shift in two tabs. Tab A saved; stale Tab B received `班次已被其他人更新，请刷新后重试` and kept its dialog open.

### Responsive

- Desktop flows were exercised before and after lazy route splitting.
- The real CSS mobile viewport was 390×844. Body width stayed 390 with no horizontal overflow.
- The mobile shift dialog fit within x=21, width=347, top=36 and height=788; the create action completed.

### Production artifact smoke

- The build layout was corrected so `npm start` resolves the generated `dist/server.js` entry and excludes tests/seeds from the runtime artifact.
- A real production process started on an isolated port. Health returned database=true and evaluateMolly=true; direct `/calendar` returned the SPA HTML with Content Security Policy, frame protection and no-cache headers.

## Final visual and interaction audit

The final `impeccable` product audit scored **18/20 (Excellent)** after fixes: Accessibility 3/4, Performance 4/4, Responsive 4/4, Theming 3/4 and Anti-patterns 4/4. There are no open P0/P1 findings. The remaining score gap reflects the absence of an independent screen-reader/automated contrast certification and a few intentionally local color declarations, not a known blocking defect.

- Removed the bordered wide-shadow mobile navigation pattern and retained a compact eight-pixel elevation.
- Raised select options, template actions and toast dismissal to 44px touch targets.
- Added visible/retryable store-load failure handling and corrected the ADMIN selected-store label.
- Added two-step batch deletion; browser QA stopped at the confirmation state and made no delete request.
- Confirmed the settings page exposes week start, operating window, interval, minimum shift, default break and both warning thresholds.
- Confirmed a real 390×844 CSS viewport reports body width 390, defaults to Day view and exposes the full core toolbar/navigation without page overflow.
- Final browser console check returned no warning or error entries.

## Full-stack store-scope acceptance

Evaluate Molly's isolated browser-acceptance utility created a temporary schema and random STORE_EVALUATOR account. Credentials were consumed only inside the local process and not printed.

| Check | Result |
|---|---|
| Login through Roster auth proxy | 200 |
| Own-store workforce, 10 employees | 200 |
| Own-store roster calendar | 200 |
| Cross-store workforce | 403 |
| Cross-store employee-id probe | 404, no existence disclosure |
| Cross-store roster | 403 |
| Missing session | 401 |

The temporary schema was dropped and Roster was restarted against the normal Evaluate API. Final health again reported both services available.

## Database integrity evidence

- Hurstville `2026-09-07`–`2026-09-13`: PUBLISHED, version 11, 2 shifts, 4 distinct assignments.
- Employee-overlap query: 0.
- Orphan assignment query: 0.
- Publication versions 6 and 11 contain 1 and 2 shift snapshots respectively.
- Current assignments retain employee name/type, official score, Tier, official round id and close-time snapshots.

## Remaining QA gaps

1. The current interactive browser had only ADMIN. Before production, repeat the visual UI workflow after the operator enters a real STORE_EVALUATOR credential. Full-stack API and automated scope tests already pass.
2. A new CLOSED evaluation round was not created in the live business database for QA. Integration tests prove latest-CLOSED selection, live cards prove current reads, and two publication snapshots prove historical stability. Repeat the live refresh scenario when a legitimate new round closes.

These are release-verification follow-ups, not known product defects.

## Calendar grouping and role-filter regression — 2026-09-07

The Day/Week refinement was verified against the live local frontend/API/database with an authenticated ADMIN session.

| Scenario | Result |
|---|---|
| Separate shifts, same date/start/end/role/break | One visual block with both employee names |
| Same date/start/end/role, different break | Independent side-by-side blocks; both Break values visible |
| Same date/start/end/break, different role | Independent side-by-side blocks |
| Same role, different time | Independent blocks on the timeline |
| Three simultaneous independent blocks | Three deterministic non-overlapping columns |
| Grouped block edit | Concrete-shift chooser opened; selected Shift retained normal edit/delete flow |
| Role chips | Mouse selection, selected styling and native radio ArrowRight navigation passed |
| 1920×1080, 1366×768, 1024, 768×1024 | No page overflow; no card internal overflow; narrow Week scrolls inside the calendar |

Temporary HandoverEmployee006, HandoverEmployee018 and HandoverEmployee026 acceptance shifts in Hurstville and the temporary Green Square shift were removed. Green Square was republished after cleanup. Final frontend checks: 5 files / 31 tests, lint pass, production build pass.

## ShiftEventCard render-crash regression — 2026-09-07

- Before fix: real Day View 09:00–10:00 drag reproduced the full-page Error Boundary and `group.assignments` TypeError.
- Root cause: FullCalendar selection-mirror events do not carry roster extended props; the grouped event renderer did not distinguish mirrors from persisted Shift groups.
- After fix: the identical drag opened the create dialog with no page error. A fresh browser tab completed Day drag, Week, Month and Month-date-to-Day checks with no console errors.
- CRUD/refetch: two same-condition temporary Shift records merged; changing one break split them; deleting both left the calendar healthy. Temporary data was removed.
- Defensive cases: missing assignments normalize to an empty array; incomplete inputs do not create events; stale/invalid event props render one neutral placeholder rather than crashing the page.
- Final automated result: 7 files / 42 tests, lint pass, production build pass. See `CALENDAR_RUNTIME_CRASH_FIX_REPORT.md`.
