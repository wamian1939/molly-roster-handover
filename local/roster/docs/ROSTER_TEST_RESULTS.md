# Test results — 2026-10-09

## 2026-10-21 formal-Job write-path acceptance

Fresh paired migrated PostgreSQL schemas and current-source 4010/4035 services: generated STORE_EVALUATOR HTTP Create and Update with a same-store employee lacking the exact Evaluate Job grant returned **422 `UNQUALIFIED_EMPLOYEE_ROLE`**. Immediate direct Roster readback remained three original Shifts/version 1, DRAFT/PUBLISHED version 1 and one publication. Positive control for the sole granted canonical employee returned **201** with exact 2026-10-09T23:00Z–2026-10-10T00:00Z endpoints, and paired readback found exactly one new Shift, DRAFT version 2, originals and publication unchanged, two Availability rows unchanged. Reusable verifier: `backend/scripts/verify-formal-grant-http.ts`. Focused `rosterRoutes.test.ts` **83/83**, backend `tsc --noEmit` and diff check passed. QA services and both exact schemas were cleaned. Normal Hurstville hashes remained unchanged. This is real HTTP/PostgreSQL evidence; no browser UI save attempt was made for the synthetic case and no BHS data was changed.

## 2026-10-21 duplicate-day Script review

Red backend tests: parser returned only one row for `1AA1BB`; a direct two-window, nonoverlapping same-day preview counted both CREATE. Green: parser retains two valid rows plus `DUPLICATE_DAY`, preview marks both CONFLICT and reports one issue, and a duplicate on a second source line points to that line. Direct service rejects even nonoverlapping same-day rows before any Availability/audit write. Focused parser/preview **2 files/32 tests**, TypeScript production compile, and final full real isolated PostgreSQL **29 files/240 tests** passed. Exact migrated final QA schema `codex_roster_backend_test_1792549082840_8f02` was cleaned. Normal Chrome showed both conflicts and disabled Commit; Cancel and direct normal-data digests proved zero write. BHS Submit was not tested.

## 2026-10-21 Script populated-preview visibility

Red component assertion: after successful Preview, `Shortcuts & Rules` remained open. Green: it closes while the seven-row preview remains available, **5/5** focused Script dialog tests. Full frontend Vitest **44 files/297 tests**, ESLint and TypeScript/Vite production build passed; `git diff --check` exit 0 (only Git LF/CRLF notices). Normal Chrome at 3093×1670 CSS px confirmed seven preview rows fit without inner scrolling; Cancel made no database write. Backend was unchanged; the last isolated PostgreSQL full gate remains **29 files/238 tests**.

## 2026-10-21 Day pointer ownership and touch-end coordinates

Red browser console: simulated two-touch Day selection threw `TypeError` in `Document.elementsFromPoint` because FullCalendar supplied a touch event without mouse coordinates. Red unit test called the helper with `changedTouches` and observed `undefined, undefined`. Green: first-pointer ownership ignored a second pointer's down/move/cancel; touch-end coordinates resolve the visible slot and missing/non-finite coordinates return null. Focused `timeGridPointer.test.ts` **7/7**; full frontend Vitest **44 files/297 tests**, ESLint, TypeScript/Vite production build passed. Chrome replay had no new console exception; a real mouse drag opened 10:00-11:30 and was cancelled. Normal PostgreSQL remained unchanged. Backend was not modified; the prior full isolated PostgreSQL gate remains **29 files/238 tests**.

## 2026-10-21 read/export timezone and configured-store browser gate

Post-browser copy refinement: two red route assertions for Chinese legacy UTC labels failed, then focused **82/82** passed after CSV/print text changes. A new migrated disposable PostgreSQL schema `codex_roster_backend_test_1792547068305_2dae` passed the final backend **29/238**, was cleaned; current-source backend production build passed after a controlled 4020 restart. Actual local print displayed the Chinese UTC warning and frozen 23:00–00:00 next-day UTC time. Prior frontend **44/295**, lint and build remain current because this follow-up changed backend route text only.

Red tests: Calendar with legacy Shifts and null settings incorrectly resolved; current CSV/print incorrectly returned 200; Export page failed to warn or disable current links. Green: frontend full Vitest **44 files/295 tests**, ESLint, TypeScript/Vite production build; backend full Vitest on fresh migrated real PostgreSQL schema `codex_roster_backend_test_1792546416134_fdbe` **29 files/238 tests**, exact schema cleaned; backend TypeScript, production build, Prisma Validate and migration status (nine current migrations). Initial backend build hit the known Windows Prisma DLL lock from the identified 4020 process; controlled stop/build/restart passed. One intermediate full test failed because an empty Copy Week source had no settings; retaining its NO_SOURCE_SHIFTS preview restored the final 238/238 green result. Normal 5176 HTTP 200 and 4020 `/api/health` database/Evaluate true after restart. Browser: configured Hurstville Day click 10:00–10:30 and drag 10:00–12:30 opened Add, both Cancel; Export loaded current links and returned to Day. Normal Chrome also checked Green Square with no settings: empty Day warned and blocked Add, historical Shift day returned 409, Export had no current links and Staff disabled time entry; Hurstville was restored. No normal data write or BHS operation.

Live read-only print-route acceptance also displayed an explicit UTC warning and a 23:00–00:00 UTC historical Shift for Green Square publication #2, whose saved snapshot has no timezone. The temporary print tab was closed.

## 2026-10-21 missing-store-timezone write guard

Red `RosterService` tests reproduced a manual Availability write without settings and a Day Shift whose first failure was employee availability instead of a required timezone. The service now rejects unconfigured Shift validation and timed or UNKNOWN Availability rows with 409 before data writes. Focused `rosterService.test.ts` passed **41/41** after the fix. A fresh migrated isolated PostgreSQL schema `codex_roster_backend_test_1792545764459_b3de` ran the complete backend with `RUN_DATABASE_TESTS=1`: **29 files/235 tests passed**. Integration checks asserted zero Shift/Availability rows on the no-settings paths. The exact schema and state file were cleaned. Backend TypeScript no-emit and Prisma Validate passed. One interim full run exposed seven old fixtures depending on implicit Sydney; after explicit fixture settings, the final full run passed. No migration or Evaluate application change.

## 2026-10-21 explicit timezone guard for Script import

Red route regression showed an unconfigured store returned HTTP 200 for Script Preview. After the guard, `rosterRoutes.test.ts` passed **81/81**; both Preview and Commit return 409 with a store-setting instruction. Backend TypeScript passed. Full backend Vitest on freshly migrated isolated PostgreSQL schema `codex_roster_backend_test_1792545213851_1368` passed **29 files/231 tests** with `RUN_DATABASE_TESTS=1`, including a direct service call that rejected before Availability or import-audit writes. The first cleanup attempt used a quoted `.env` URL and failed; the exact named schema was then safely cleaned, with no persistent test state. No migration was needed. Frontend full gate from the preceding store-persistence change remains **44 files/294 tests**, lint and production build passed.

## 2026-10-21 account-scoped store persistence

Red `StoreContext` regression: after selecting store-2 and remounting the provider, the old implementation returned an empty store and first-store initialization overwrote the choice. The new provider restores an account-keyed tab-session selection. Focused tests **5/5** cover reload persistence, a different account, and an evaluator no longer authorized for the stored choice. Full frontend Vitest **44 files/294 tests**, ESLint and production build passed. Normal Chrome reproduced Green Square after reloading Hurstville Staff before the fix, then verified Hurstville across Day → Staff → reload → Day after the fix. No local roster mutation or backend/schema change was needed.

## 2026-10-21 Script target-week tab persistence

BHS Staff read-only UI trial showed a This Week selection survived New → Time → New and Cancel/reopen; a Staff reload restored Next Week. Changed Molly component assertions first failed against the old tab-reset and reopen behavior, then passed after retaining the selection in the dialog and Staff page. Final focused 2 files/14 tests, full frontend Vitest **44 files/292 tests**, ESLint and TypeScript/Vite production build passed. Normal Hurstville Chrome preserved This Week through Time → New → Time and Cancel/reopen, then reverted to Next Week after reload; no Commit was pressed. Guarded normal PostgreSQL before/after hashes matched for 13 Shifts, three periods, two publications, 14 Availability rows and shortcut version 1; import count stayed zero. Backend code/schema and BHS business data were not changed in this pass.

## 2026-10-21 20-letter Script shortcut acceptance

After read-only BHS Edit Script exposed an advertised 20-letter shortcut limit, Molly's route schema, service normalizer, parser/tokenizer and editor input were aligned to 20. Focused backend parser/routes **2 files/100 tests**, frontend Script dialog **4/4**, backend TypeScript no-emit, Prisma Validate, full frontend **44 files/291 tests**, ESLint and production build passed. A fresh migrated disposable real PostgreSQL schema `codex_roster_backend_test_1792543593674_06d6` ran the full backend with `RUN_DATABASE_TESTS=1`: **29 files/229 tests passed**, including a 20-letter saved/reloaded configuration and 21-letter rejection. The exact isolated schema and state file were cleaned. The normal 4020 `tsx watch` process restarted at the source change time and listened on 4020. Normal Hurstville Chrome filled 20 letters, rejected a 21st keystroke, then cancelled; before/after direct PostgreSQL shortcut and Availability digests and counts were identical. No migration, Evaluate source, normal-store business data or BHS business data changed. This does not verify BHS Submit acceptance of 20 letters or real STORE_EVALUATOR/device behavior.

## 2026-10-21 script target-week switch

`PresetTimeSlotScriptDialog.tsx` now uses a 53×29 px accessible This Week / Next Week switch matching the read-only BHS control geometry while retaining Molly color. The focused component regression checks the default checked state, CURRENT preview request after toggling and NEXT reset on changing tabs; **4/4 passed**. Full frontend Vitest **44 files/291 tests passed**, ESLint passed, and TypeScript/Vite production build passed after this source change. Normal local Chrome confirmed both states, date-correct preview, stale-preview clearing and Cancel. A guarded before/after Hurstville PostgreSQL audit found identical 14-row Availability digest, zero imports, 13 Shifts and two publications. Backend application/schema and Evaluate were unchanged, so the prior full isolated PostgreSQL backend gate remains historical rather than being represented as rerun this pass.

## 2026-10-21 read-only reference and live service check

This pass edited documentation only. Normal Molly frontend `http://127.0.0.1:5176/` returned HTTP 200; backend `/api/health` returned `ok=true`, `database=true`, `evaluateMolly=true`. Chrome's existing Molly Day tab remained open. Read-only signed-in BHS Setting DOM supplied sidebar geometry/icons; transient hover pseudo-state was cleared and no BHS business mutation was sent. `git diff --check` for the edited tracked documentation passed. No application test rerun was needed because product source did not change; the last full frontend gate remains 44 files/291 tests plus lint/build, and the last full isolated PostgreSQL backend gate remains 29 files/227 tests as recorded below. Real store evaluator/device acceptance and BHS Submit remain untested.

## 2026-10-21 Script checkbox stability fix

`src/components/staff/PresetTimeSlotScriptDialog.tsx` no longer collapses `Shortcuts & Rules` when its own acknowledgement checkbox is checked; the component regression expects the checkbox to remain checked in the open disclosure. Focused Vitest **4/4**; post-change full frontend **44 files / 291 tests**, ESLint and TypeScript/Vite production build passed. Normal Hurstville Chrome completed checkbox `.check()` without its prior target-disappearance failure, previewed seven joined-code rows and cancelled. Direct read-only PostgreSQL before/after digest and counts remained identical (14 Availability, 0 import audits, 13 Shifts, 2 publications). Backend product code/schema unchanged; the preceding fresh full real-PostgreSQL backend gate was 29 files/227 tests.

## 2026-10-21 normal browser nonmutation checks

Normal source-loaded Hurstville Day blank 13:00 drag opened 13:00-13:30 Add, then Cancel. Normal Staff parsed `name1234567AA` and `name1AA2AA34567AA` to the same seven next-week 10:00-22:00 AA preview rows, then Cancel. `npx tsx scripts/audit-hurstville-script-preview.ts` before/after returned Availability count 14, the same SHA-256 digest, Script Import audit count 0, Shift count 13 and publication count 2. The existing Hurstville minimum-setting dry run returned version 3 and 13/23/2 Shift/assignment/publication counts. No Commit or Shift Save was attempted against normal data; prior isolated positive-save tests are recorded below. No product source changed and no new full suite rerun was needed after this browser/read-only-script check.

## 2026-10-21 fresh full gate after 30-minute Day browser acceptance

Current worktree frontend: `npm test -- --run` **44/44 files, 291/291 tests**; `npm run lint` passed; `npm run build` passed with 2,256 transformed modules. Backend: fresh migrated disposable PostgreSQL schema `codex_roster_backend_test_1792542375850_df91`, `RUN_DATABASE_TESTS=1 npm test` **29/29 files, 227/227 tests**; guarded cleanup completed. Backend `npx tsc -p tsconfig.json`, `npx prisma validate` and `npx prisma migrate status` passed; public database schema is up to date with nine migrations. These gates cover the current source and real PostgreSQL integration, not BHS Submit, target HTTPS, real evaluator credentials or physical store-device use. No application source or migration was edited during this gate.

## 2026-10-21 disposable browser 30-minute Day save

Local Chrome 5177 with paired disposable Evaluate/Roster PostgreSQL and a synthetic STORE_EVALUATOR clicked Day 13:00 blank, selected QA Front and available HandoverEmployee006, saved once, reloaded and reopened Edit. The UI showed 13:00-13:30, draft version 2 and one new card. `npx tsx scripts/verify-thirty-minute-browser-save.ts` passed direct Prisma: four total fixture Shifts, one new Shift with one canonical HandoverEmployee006 assignment, exact 2026-10-09T02:00:00Z-02:30:00Z, and unchanged published snapshot. The temporary browser tab, listeners 4010/4035/5177 and two named schemas were cleaned. BHS was read only; this does not establish BHS Submit or real-account/device acceptance. No product code, schema or migration changed in this check, so the earlier full-suite results remain the latest.

## 2026-10-21 Hurstville minimum-duration setting

`backend/scripts/align-hurstville-bhs-minimum-shift.ts` dry-run matched version 2 and 13/23/2 Hurstville Shift/assignment/publication counts. Its guarded `--apply` backed up the row and set only `minimumShiftMinutes` 60→30 with version 2→3. Direct field/count/publication-identity checks passed, and a repeat invocation returned `already-aligned`. Backend `npx tsc -p tsconfig.json --noEmit` passed. Normal local Chrome click 09:00 opened 09:00–09:30 Add and Cancel closed it. A fresh named disposable PostgreSQL schema passed `backend/scripts/verify-thirty-minute-shift-fixture.ts`: 09:00–09:30 Sydney persisted as 22:00–22:30Z, exactly one extra Shift and fixture assignment, draft version 1→2 and unchanged published snapshot. The disposable schema was cleaned. No frontend/backend application source, schema or migration changed; no full test suite rerun was needed for this store-scoped setting update. Browser UI Save/reload of a disposable 30-minute Shift remains unverified.

## 2026-10-21 historical-role Settings disclosure

- `DraftRoleReconciliation` now follows the formal settings and starts closed with a visible 11-Shift count. A focused test preserves filtering and source links after expansion. The first full frontend run failed one old `region` accessibility assertion because native `details` exposes `group`; the corrected regression passed.
- Final current-source frontend gate: **44 files / 291 tests passed**, ESLint passed, TypeScript/Vite production build passed. Normal local ADMIN Chrome confirmed default-closed, six formal jobs first, and three review links after expansion. No backend application/schema or database mutation was needed. The prior full backend real-PostgreSQL result remains 29 files/226 tests; it was not rerun for this frontend-only change.

## 2026-10-21 six-role mapping and local data safety

- Roster role sync dry-run identified exactly `li-xiaobai` and `front-counter`; `--apply` wrote a pre-change JSON backup and inserted those two store-scoped roles in a Serializable transaction. Idempotent `--apply` rerun returned `already-aligned`. Direct role audit retained inactive `验收岗` with eight historical draft Shifts and unchanged Hurstville 13 Shifts, 23 assignments and 2 publications.
- Frontend six-role mapping focused **4/4**, then full Vitest **44 files / 291 tests passed** and ESLint passed. Backend formal-role mapping focused **3/3**, backend TypeScript no-emit and Prisma Validate passed. No schema migration or Evaluate application change. Normal local Chrome ADMIN Day verified six options and a 09:00–10:30 blank drag; real STORE_EVALUATOR/device acceptance remains separate.
- BHS reference drag forms were cancelled with no reference business-data write. Its observed 30-minute and upward-drag behavior is documented in `docs/SHIFTHELPER_INTERACTION_PARITY.md`.
- Settings status wording corrected from “已用于排班” to “已关联排班岗位” because association alone does not prove a Shift exists. Focused Settings 13/13 and frontend TypeScript no-emit passed; normal local Chrome showed six new labels and zero old labels. The post-change full frontend gate passed **44 files/291 tests**, ESLint and production build.

## 2026-10-21 formal jobs and Day action priority

- Roster frontend: full Vitest **44 files / 290 tests passed**; ESLint passed; `npm run build` passed.
- Roster backend focused formal-role matching: **2/2** passed. Backend application and schema were not changed in this follow-up; the prior full isolated PostgreSQL backend gate is **215/215**.
- Evaluate backend: `storeJobService.test.ts` **3/3**, TypeScript no-emit and Prisma Validate passed. The Hurstville catalog apply was dry-run checked and direct-read audited before and after. Four new definitions each have zero assignments; original two assignment rows remain.
- Disposable current-source browser Day secondary menu passed twice, with zero writes and unchanged Roster database. BHS observation was read only. A real store evaluator/device gate remains open.

## 2026-10-21 Day saved edit and two-session concurrency

`scripts/qa-day-click-edit-browser.py` passed against current-source Chromium and paired disposable PostgreSQL: save/reload, two-session stale PATCH 409, retained stale form input, authoritative reload and unchanged published Calendar JSON. `backend/scripts/verify-day-click-edit-browser.ts` passed direct Prisma: eight Shifts, edited Shift version 3 and canonical HandoverEmployee006 assignment, DRAFT version 3, PUBLISHED/publication version 1. `scripts/qa-calendar-fast-gesture-browser.py` passed 12 blank gestures, two saved-card drag attempts, zero Roster writes, unchanged draft/published JSON and a top toolbar without Copy/Batch. Backend `tsc --noEmit`, Python QA syntax and `git diff --check` passed. No product-code change in this continuation; latest full frontend/backend suites remain those recorded below.


## 2026-10-21 stacked Day sidebar browser regression

Red current-source Chromium at 640×800 found the scheduled sidebar heading y=2429px after opening it from the below-grid control; it was off-screen. Green after responsive scroll targeting: y=84px at 640×800, y=83.5px at 1000×900; wide desktop Calendar position remained y=137px at 3093×1670 and y=129px at 1600×1100. Narrow blank click, 08:00–09:30 drag, Cancel and saved-card click passed with zero Roster mutations/page errors. Guarded disposable PostgreSQL retained eight Shifts and unchanged publication/period versions. Full frontend Vitest **44 files/289 tests**, ESLint, TypeScript/Vite production build and Python browser-script syntax passed. No backend product/schema change or full backend-suite rerun; the latest backend fresh-PostgreSQL result remains **29 files/226 tests** from the preceding Script parser turn.

## 2026-10-21 Script unknown punctuation nickname boundary

Red parser test: unknown `Tea (Nick)1234567AA` and `Tea (Nick)1AA2AA34567AA` returned `AMBIGUOUS_NAME_BOUNDARY`, preventing the explicit employee chooser. After the boundary rule accepted ordinary trailing punctuation/symbols, focused parser **19/19** passed while existing digit-bearing nickname ambiguity stayed guarded. Fresh current-source browser and direct disposable PostgreSQL verified one mapped seven-day import, three unchanged Shifts and one publication. Full backend suite on a newly migrated disposable PostgreSQL schema passed **29 files/226 tests**; backend TypeScript no-emit, Prisma Validate, Python script syntax and diff check passed. All three exact QA/test schemas and temporary listeners were cleaned. No frontend product or migration change in this continuation.

## 2026-10-21 Dialog focus/Day time-position regression

Red Chromium with the Day sidebar open measured an 08:00 blank lane y=509.125px before Add and y=-25.875px after Escape. The shared Dialog's focus restoration was the cause. After `focus({ preventScroll: true })`, current-source Chromium measured y=509.125px both times; an immediate 08:00–09:30 blank drag and saved-card click passed with zero Roster writes/page errors. Guarded disposable DB verifier found eight fixture Shifts and unchanged period/publication versions. Full frontend Vitest **44 files/289 tests**, ESLint, TypeScript/Vite production build and Python QA syntax passed. Backend application/schema unchanged; latest full backend disposable-PostgreSQL gate is the preceding 29 files/225 tests.

## 2026-10-21 Day sidebar scroll regression

Red current-source Chromium assertion found calendar y=-154px after opening the below-grid scheduled sidebar. After the page-root scroll fix, same-viewport y=137px and common desktop y=129px passed with five cards, five employee rows, zero Roster writes/page errors; direct disposable Prisma confirmed eight fixture Shifts and one unchanged publication. Full frontend Vitest **44 files/289 tests**, ESLint, TypeScript/Vite production build, Python browser-script syntax and guarded DB verifier passed. No backend product/schema change or new full backend-suite run in this continuation; the latest full backend disposable-PostgreSQL result remains **29 files/225 tests** from the preceding Script parser turn.

## 2026-10-21 punctuation-safe name-first Script parser

Red parser regression rejected synthetic Evaluate display name `Anne (Tea) & Co` as `INVALID_CHARACTERS` even with a Tab boundary. After allowing name punctuation but still rejecting control/format/surrogate characters, focused parser 18/18 passed for Tab-separated `1234567AA`, joined `1AA2AA34567AA`, and a bidi-control refusal. Full backend real-PostgreSQL suite passed 29 files/225 tests on fresh migrated disposable schema `codex_roster_backend_test_1792537312109_4621`; exact schema cleaned. Backend TypeScript emit, Prisma Validate, Python QA syntax and diff check passed. Browser and direct DB evidence are recorded separately. No migration or Evaluate product edit.

## 2026-10-21 personal Script alias collision regression

Red `presetScriptInput` tests showed the selected employee was submitted under a constant `SelectedEmployee` alias. After the name-first fix, focused frontend 2 files/7 tests and full frontend 44 files/289 tests passed; ESLint, TypeScript/Vite production build, backend TypeScript no-emit, Python syntax and diff check passed. Current-source disposable Chromium/PostgreSQL with a separate employee actually named `SelectedEmployee` committed one HandoverEmployee006 Availability and one import audit without altering baseline Shifts/periods/publication. No backend product or migration change; no new full backend-suite claim in this continuation.

## 2026-10-21 store-local Export year regression

`ExportPage.test.tsx` reproduced a Sydney-browser/Adelaide-store New Year mismatch: the prior implementation queried 2027 while the store still used 2026. The fix selects the store-local year and current period and clears old export links while a new year loads. Focused 6/6; frontend full 44 files/288 tests; ESLint and TypeScript/Vite production build passed. Focused backend Availability Script parser and route suites 97/97 passed. No schema migration or backend application change. Current-source disposable Chromium and normal stack checks are in `docs/ROSTER_BROWSER_QA.md`.

## 2026-10-21 saved-card double-click regression

Red `src/components/ui/Dialog.test.tsx` reproduced the newly mounted backdrop dismissing a dialog on the second mouse press (`detail=2`). After the focused guard, the unit regression passed; full frontend **44 files/286 tests**, ESLint and TypeScript/Vite production build passed. `qa-full-day-saved-card-browser.py` passed in current-source disposable Chromium for Day and Week saved-card double-click, ordinary click and no-drag, with zero Shift HTTP writes. Direct disposable Prisma retained three Shifts/version 1 and unchanged DRAFT/PUBLISHED versions/publication. Python QA script compilation passed. Backend product source and schema were unchanged, so no new backend suite claim is made.

## 2026-10-21 Week adjacent-column red/green browser gate

Red current-source Chromium demonstrated an adjacent Week cross-column 11:00 Thursday→10:00 Friday drag opening a 11:00–10:30 next-day Add. After the pointer-column guard, the same browser script passed adjacent and distant rejection, valid same-column selection, explicit overnight form preview and Cancel with zero Shift writes. Guarded isolated PostgreSQL found the baseline three Shifts/two periods/one publication and zero Availability. Full frontend Vitest **43/285**, ESLint, TypeScript/Vite production build, Python syntax and diff check passed. Exact paired schemas/listeners cleaned; normal 5176/4020 health good. Backend application, migration, Evaluate and BHS were unchanged.

## 2026-10-21 Week DST browser/DB gate

Fresh current-source Chromium on paired disposable Evaluate/Roster PostgreSQL passed Week upward drag mirror/form assertions on Sydney fall-back and spring-forward dates, plus cross-column rejection and zero Shift requests. Guarded `verify-dst-week-cancel-browser.ts` passed direct counts and versions: three original Shifts, two periods, one publication, no Availability. Python QA syntax and diff check passed; exact temporary services/schemas cleaned. No product source changed after the preceding frontend full 43/285, ESLint and build gate, so those results are historical prior-turn gates rather than rerun here. Normal 5176/4020 health remained good. BHS DST behavior and target real-account/device acceptance remain open.

## 2026-10-21 Day DST upward drag regression

Red `timeGridPointer.test.ts` showed spring-forward upward 04:00→03:30 incorrectly ending 04:30; after the fix the focused 5/5 passed. Fresh synthetic Chromium on paired disposable PostgreSQL verified both DST directions' mirrors/forms and one fall-back save/reload. Guarded Prisma confirmed exact UTC/canonical employee and unchanged publication. The ordinary Day directional browser script and its direct DB verifier passed after the change. Full frontend Vitest **43/285**, ESLint and TypeScript/Vite production build passed; Python syntax and diff check passed. The QA 4010/4035/5177 listeners and exact schemas were cleaned; normal frontend/backend health remained good. No backend application, migration or Evaluate source change. BHS DST behavior and real store/device acceptance are still unverified.

## 2026-10-21 CSV export prefix regression

Red `rosterRoutes.test.ts` observed raw `\t=1+1`, `  @SUM(1,1)` and `＝1+1` in the authenticated employee CSV response. After the shared `csvCell` fix, that route suite passed **80/80** and backend TypeScript no-emit passed. Full backend real-PostgreSQL suite passed **29 files/224 tests** on a fresh migrated named schema, which was then removed. The current normal frontend/API remained healthy. No browser download was performed in this change, and no business database row was modified. The existing apostrophe text prefix reduces immediate formula interpretation but CSV re-save and behavior in different spreadsheet products are not universally guaranteed.

## 2026-10-21 live formal-job boundary check

Read-only local Evaluate and Roster PostgreSQL audits reconfirmed the two-job Hurstville formal catalog and eight inactive `验收岗` draft references. Source review found Calendar/Settings new-role choices and server Shift/publication gates tied to that formal catalog. Focused frontend `verifiedShiftRoles`, Settings and Shift dialog tests passed **3 files/43 tests**; focused backend `formalRoleMatch` passed **1 file/2 tests**. The first backend command targeted `src/` and discovered no tests; it was corrected to `tests/` and passed. Normal frontend HTTP 200, Roster health with database/Evaluate true. No product code, schema, migration or business data changed; the last full-suite and isolated browser gates remain those recorded below.

## 2026-10-21 Day directional browser/DB gate

`qa-upward-drag-create-browser.py` Python syntax and a fresh current-source Chromium/paired-disposable-PostgreSQL run passed downward and upward 30-minute boundary cases, live mirror = Add clocks, Cancel zero-write, and one persisted/reloaded upward Shift. New guarded `verify-day-directional-snap-browser.ts` passed direct DB checks for exact UTC times, canonical employee, one new row, DRAFT version 2, PUBLISHED version 1 and one publication. An initial QA-only Save failure was explained by the newly required explicit Job; the failed run left the baseline three Shifts and published history unchanged, and the updated script passed on the same isolated fixture. Exact schemas/listeners cleaned. Product code did not change; the latest full frontend **43/284**, ESLint/build and backend real-PostgreSQL **29/223** are prior gates, not rerun in this continuation.

## 2026-10-21 Script mapping label gate

A new red component assertion reproduced canonical IDs in ordinary chooser labels. After the frontend change, focused `PresetTimeSlotScriptDialog` passed **4/4**, full frontend Vitest passed **43 files/284 tests**, ESLint, TypeScript no-emit and Vite production build passed. Updated isolated Chromium/PostgreSQL name-mapping QA passed name-only choices and one commit, with 14 exact Availability rows, one audit, three unchanged baseline Shifts and one unchanged publication. Its exact paired QA schemas/listeners were cleaned. Backend product source was not changed; the latest full backend fresh disposable-PostgreSQL gate remains **29 files/223 tests** from the preceding parser fix, not a rerun in this continuation.

## 2026-10-21 full backend gate after joined-nickname parser fix

Fresh migrated local disposable PostgreSQL schema `codex_roster_backend_test_1792532966690_b6d0`; `RUN_DATABASE_TESTS=1 npx vitest run --maxWorkers=1` passed **29 test files / 223 tests**. The exact schema was removed afterward. This updates the previous section's historical 222-test backend result; frontend source did not change. BHS reference input was separately inspected read-only: direct name-code boundary had no preview, Tab boundary previewed seven dates, and Cancel closed without Submit. No BHS mutation was performed.

## 2026-10-21 unknown joined nickname mapping

Red parser regression returned `INVALID_ROW` for `Tea Nickname1AA2AA34567AA`, preventing the explicit employee mapping flow. After the bounded name-boundary change, focused `presetTimeSlotScript.test.ts` passed **17/17**, including both joined formats, explicit mapped canonical employee, known-name ambiguity and digit-bearing nickname refusal. Backend TypeScript no-emit and Python browser-script compilation passed. Current-source synthetic ADMIN Chromium against fresh paired migrated real PostgreSQL passed unknown-name chooser, mapped 14-row Preview, one Commit and guarded direct Prisma verification of 14 Availability rows, one audit and unchanged three Shifts/one publication. Exact QA schemas/listeners cleaned. A subsequent full backend 29/223 disposable-PostgreSQL run is recorded above; the prior 43/283 frontend full suite remains historical because frontend source did not change. No migration or Evaluate application change.

## 2026-10-21 proposed Script overlap guard

Red regression: Preview returned 3 CREATE/0 CONFLICT for two same-employee adjacent-day windows that overlapped by one actual hour plus an unrelated employee row. After the fix, focused parser/preview tests **27/27** passed; full backend Vitest on a fresh migrated disposable real PostgreSQL schema passed **29 files / 222 tests** with `RUN_DATABASE_TESTS=1`, including direct service rejection with unchanged row/audit counts. Backend TypeScript emit and Prisma Validate passed. Full frontend Vitest **43 files / 283 tests**, ESLint and TypeScript/Vite production build passed. Current-source synthetic STORE_EVALUATOR Chromium passed individual valid previews, joined 2-CONFLICT display, disabled Commit and direct guarded database zero-write check with no page errors. Exact temporary schemas/listeners cleaned. No migration or Evaluate application change; BHS data untouched.

## 2026-10-21 outside-grid pointer cancellation

The extended `qa-calendar-pointer-jitter-browser.py` compiled and passed 14 current-source Chromium gesture cases in paired disposable PostgreSQL: six blank clicks, six saved-card clicks and two blank drags released outside the grid. Zero Roster writes/page errors; authenticated draft/published Calendar JSON unchanged. Guarded direct Prisma readback retained three Shifts/version 1, DRAFT/PUBLISHED period version 1 and one publication. QA listeners/schemas cleaned. Product source did not change, so the most recent full frontend **43/283** and backend disposable PostgreSQL **29/219** suites were not rerun this continuation.

## 2026-10-21 joined Script to Day end-to-end

Python browser-script compilation and backend `tsc --noEmit` passed. Two fresh paired disposable PostgreSQL/current-source Chromium runs passed `qa-script-joined-commit-browser.py`; the final used a generated `STORE_EVALUATOR`, one joined-name import Commit, seven equivalent no-write previews, one Day drag-created Shift, reload/Edit, direct Prisma UTC/canonical-ID verification and unchanged published Calendar JSON. Zero page errors. Exact QA schemas and listeners cleaned. No product source/schema change this continuation; prior full frontend **43/283** with ESLint/build and backend disposable PostgreSQL **29/219** remain the most recent full-suite gates, not rerun claims.

## 2026-10-21 overnight Worklog time range

Focused Scheduled Shift data tests **13/13** passed, including Sydney, Adelaide and year-boundary formatting. Full frontend Vitest **43 files / 283 tests**, ESLint and TypeScript/Vite production build passed. Current-source isolated Chromium passed the overnight Day Worklog date assertion with zero Roster writes/page errors; guarded PostgreSQL retained exact UTC Shift instants and Shift/period version 1. Temporary QA schemas/listeners cleaned. Backend product/schema was unchanged; the latest full backend disposable PostgreSQL suite remains **29 files / 219 tests** from the preceding import change.

## 2026-10-21 Day Scheduled Shift card gate

After adding the explicit employee Worklog card and correcting narrow-screen clipping, full frontend Vitest passed **43 files / 282 tests**, ESLint passed and TypeScript/Vite production build passed. Current-source Chromium on paired disposable PostgreSQL passed desktop/narrow Worklog mouse and keyboard interactions with zero Roster writes/page errors. Guarded direct database check retained three Shifts, DRAFT/PUBLISHED versions 1 and one publication. Both exact schemas and 4010/4035/5177 listeners were cleaned. Backend product/schema and Evaluate Integration were unchanged; prior full backend real-PostgreSQL gate remains 29 files/219 tests.

## 2026-10-21 direct name-code parser gate

Two red tests first showed direct `Example Worker1234567AA` failed as `INVALID_ROW` and an ambiguous `Alex1AA2BB` boundary was unrecognized. After the parser change, focused `presetTimeSlotScript` passed 16/16, backend `tsc --noEmit` passed and full backend Vitest against a freshly migrated disposable real PostgreSQL schema passed **29 files / 219 tests**. The Staff dialog now explains the optional direct form while recommending BHS's Tab boundary; full frontend Vitest passed **43 files / 282 tests**, ESLint and TypeScript/Vite production build passed. Isolated Chromium passed one exact import, seven equivalent no-write previews, zero page errors and direct database verification. Python QA script parsed successfully. All temporary schemas and listeners were cleaned; no migration or Evaluate application change.

## 2026-10-21 backend production build gate

After stopping only the verified normal Windows Roster backend watcher/listener, `backend/npm run build` passed the full clean, Prisma Client v6.19.3 generation and TypeScript emit. `scripts/start-dev.ps1` restarted normal 4020 without migrate/seed, and 5176/4020 health stayed good. Freshly emitted `dist/server.js` then started in a foreground session on temporary 4035: read-only health returned database/Evaluate true; the verified listener was stopped and 4035 cleared. Prisma public migration status reported nine migrations current. `git diff --check` passed. No product source/schema change; the most recent full backend disposable PostgreSQL suite is 29 files/217 tests and frontend is 43 files/282 tests.

## 2026-10-21 500-person Day browser scale

Updated `qa-day-scale-load-browser.py` now checks page/view Shift counts, and `qa-day-employee-pages-browser.py` supports 50 or 500 employees. Both passed on fresh paired disposable PostgreSQL/current-source Chromium with 500 staff/5,000 Shifts: 50/50 pages, all 490 added staff, last-employee search, 20 cards and 20/1,000 status per page, zero Roster writes/page errors. Direct Prisma retained 5,000 benchmark Shifts/assignments and baseline versions 1; exact schemas/services cleaned. No product source changed, so the prior full frontend 43/282, ESLint/build and backend real-PostgreSQL 29/217 gates remain the full-suite evidence.

## 2026-10-21 keyboard Day browser acceptance

Fresh disposable current-source Chromium passed saved-card Enter/Edit, Escape/Close, keyboard footer Add/Cancel and held-refresh Enter guard, with zero Roster writes/page errors. Direct guarded PostgreSQL retained three Shifts, DRAFT/PUBLISHED version 1 and one publication. Both QA script syntax checks and `git diff --check` passed; exact schemas/listeners cleaned. No product source changed this continuation, so the last full frontend 43 files/282 tests, ESLint/build and backend real-PostgreSQL 29 files/217 tests remain the full-suite evidence.

## 2026-10-21 Day refresh card guard

Red then green current-source Chromium regression: a held same-date Calendar refresh no longer lets the old Day card open an Edit dialog; once loaded, the card opens normally. Zero Roster writes/page errors; guarded disposable PostgreSQL retained three Shifts, DRAFT/PUBLISHED versions 1 and one publication. Full frontend **43 files / 282 tests passed**, ESLint and TypeScript/Vite production build passed. Backend TypeScript no-emit and Python browser-script syntax passed. No backend product/schema change; the previous full backend real-PostgreSQL suite remains 29 files/217 tests.

## 2026-10-21 Day visible-date count correction

Focused `calendarEmployeeWindow` 8/8 passed, including overnight, exact-midnight and Sydney spring-DST local date boundaries. Full frontend Vitest **43 files / 282 tests passed**; ESLint, TypeScript/Vite production build, Python QA-script syntax and Node verifier syntax passed. Fresh paired disposable current-source Chromium/PostgreSQL passed five-page Day coverage and exact page/view Shift counts, last-employee search, zero Roster writes/page errors and unchanged 500 benchmark Shift/assignment rows plus baseline versions. Both temporary schemas/listeners cleaned. Backend product/schema unchanged; the previous turn's full backend real-PostgreSQL gate remains 29 files/217 tests.

## 2026-10-21 refreshed full local gate

Backend `RUN_DATABASE_TESTS=1` on freshly migrated disposable real PostgreSQL schema `codex_roster_backend_test_1792528041875_5817`: **29 files / 217 tests passed**. Prisma Validate passed; local public schema reports nine migrations current; backend `tsc --noEmit` passed. The exact temporary schema and state file were cleaned. Frontend full Vitest **43 files / 280 tests passed**, ESLint and TypeScript/Vite production build passed. Normal 5176 returned HTTP 200 and 4020 health reported database/Evaluate true. This checkpoint made no product source, migration or BHS changes. Backend `npm run build` wrapper was not rerun because it regenerates the Prisma engine held by the live Windows backend; TypeScript and Prisma were checked separately.

## 2026-10-21 Day scale browser evidence

No product code changed in this checkpoint. Fresh disposable current-source Chromium passed 50/100/500-employee Day load checks, a 500-employee canceled blank-grid drag and zero-write/zero-error assertions; guarded PostgreSQL confirmed 5,000 benchmark Shifts and unchanged baseline versions. Ready times were 902/912/1,453 ms in single local samples, first-page card count 20, and the 500-person drag had 362 frames at 16.7 ms median/p95. The latest full frontend gate remains **43 files / 280 tests**, ESLint and production build from the prior product-code checkpoint. Physical store-device and sustained performance remain unverified.

## 2026-10-21 overnight mini-calendar cue

Frontend Vitest **43 files / 280 tests passed**, ESLint exited 0 and TypeScript/Vite production build passed. The two added date-occupancy assertions cover exact midnight and Sydney spring DST. Current-source isolated Chromium/guarded PostgreSQL verified the October–November overnight continuation marker, start-day 4h attribution disclosure, zero writes and unchanged Shift/period versions. `npx tsx scripts/benchmark-scheduled-dots.ts` measured median 2.54/2.49/4.44 ms for 500/1,000/5,000 synthetic Shifts across a 42-day grid in one local process; this is not sustained browser FPS evidence. No backend product, schema or Evaluate change.

## 2026-10-21 Day gesture and store-scope follow-up

After binding Copy Day preview to the selected store, frontend Vitest **43 files / 278 tests passed**, ESLint exited 0 and TypeScript/Vite production build passed. Fresh isolated Chromium passed saved-card click-only Day/Week, blank-grid click/cancel, and Copy auto-preview/stale/503 recovery scripts. Guarded PostgreSQL verified unchanged three Shifts, two periods and one publication. Backend application/schema and Evaluate application/data were not changed.

## 2026-10-21 automatic Copy Day preview

Frontend Vitest **43 files / 278 tests passed**, ESLint exited 0 and TypeScript/Vite production build passed after the final date-input deduplication. Current-source isolated Chromium verified automatic preview, stale response rejection, HTTP 503 fail-closed recovery and Cancel with zero writes. Direct guarded PostgreSQL verified three unchanged Shifts, two periods, one publication and DRAFT version 1. No backend product source, Prisma migration or Evaluate application change.

## 2026-10-21 manual multi-date Availability implementation

- New pure time helper and dialog component regressions: 3 files/15 focused tests passed, including Sydney/Adelaide local-to-UTC, overnight, DST ambiguity, Cancel zero-write, existing-date disable, cross-month save and 409 retry guard.
- Full frontend: **43 files / 278 tests passed**; ESLint passed. Final post-change TypeScript/Vite production build passed. Backend product source/schema did not change.
- Fresh paired disposable real PostgreSQL/current-source Chromium: Cancel 0 writes; two canonical 09:00–22:00 dates saved in one request; competing same-date write returned 409 without overwrite; published JSON unchanged; browser errors 0. Direct guarded Prisma verification found three expected MANUAL rows, three Shifts and one publication. Exact temporary schemas/listeners cleaned. Real store evaluator/device acceptance is still open.

## 2026-10-21 current-source import/gesture replay

- Fresh paired disposable PostgreSQL + Chromium: `qa-script-joined-commit-browser.py` PASS, one Commit/seven exact canonical Availability rows/one audit, five equivalent no-write previews, three baseline Shifts and one publication retained, page errors 0.
- Same stack: `qa-timegrid-gesture-cancel-browser.py` PASS, 3 px click prefill, Escape and synthetic pointercancel cancellation, next click recovery, zero Shift mutation requests.
- This checkpoint only reran existing browser/verifier code and audited the existing formal Job filter; no product source/schema changed. Exact QA listeners 4010/4035/5177, both named schemas and state files were cleaned; normal 5176/4020 were healthy. The last full frontend/backend suites remain the dated results below, not a fresh full-suite claim. Real store evaluator/device and BHS Submit semantics remain unverified.

## 2026-10-21 fast Day/Week gesture regression

- `python scripts/qa-calendar-fast-gesture-browser.py`: passed in current-source Chromium with fresh paired disposable real PostgreSQL. 12 blank drags, 2 saved-card drag attempts, 0 Roster mutations, draft/published Calendar JSON unchanged, primary toolbar has no Copy/Batch controls.
- Product source/schema did not change in this checkpoint. Earlier full frontend gate remains 41 files/272 tests with ESLint/build passed; earlier backend real-PostgreSQL gate remains 29 files/217 tests. The browser script is the only code change here.
- Focused Availability Script parser regression `npx vitest run tests/presetTimeSlotScript.test.ts`: 1 file/14 tests passed, including `1234567AA` and joined/spaced `1AA2AA34567AA` formats. `python -m py_compile scripts/qa-calendar-fast-gesture-browser.py` passed. Disposable 4010/4035/5177 listeners, both named PostgreSQL schemas and their state files were cleaned; normal 5176 HTTP 200 and 4020 health reported database/Evaluate true.

## 2026-10-21 Month/Week/template follow-up

- `npx vitest run src/components/calendar/ShiftDialog.test.tsx`: 27/27. Role-free template leaves Job blank; role-bearing template selects its Job.
- `npm test -- --run`: 41/41 files, 272/272 frontend tests. `npm run lint` and `npm run build` (TypeScript/Vite): passed.
- Two fresh paired disposable PostgreSQL/browser runs passed: Month saved/reloaded and Week unsaved draft with explicit Job requirement; preset 120-minute break saved/reloaded through Day. Published Calendar remained unchanged in the Month/Week run. Exact QA listeners/schemas cleaned. No backend product source or migration changed in this checkpoint; prior full backend real-PostgreSQL gate remains 29 files/217 tests.

## 2026-10-21 Day default Job correction

Red focused test showed the old new-Shift dialog had the first role checked. After the fix, `ShiftDialog` 27/27 and full frontend 41 files/272 tests passed; ESLint, TypeScript/Vite production build and Python QA-script syntax check passed. Current-source Chromium with a synthetic STORE_EVALUATOR and fresh paired disposable PostgreSQL verified no Shift write on unselected Job, one persisted Shift after explicit selection, reload/Edit clocks and unchanged publication. Both isolated schemas/services were cleaned. Backend product source/schema did not change in this checkpoint; the latest prior full backend real-PostgreSQL result remains 29 files/217 tests.

## 2026-10-21 formal Job code guard

- Frontend: 41 files, 271 tests passed; ESLint and production build passed.
- Backend without database flag: 11 files, 165 tests passed, 18 files/52 integration tests skipped as configured; TypeScript passed.
- Backend with fresh disposable real PostgreSQL schema and `RUN_DATABASE_TESTS=1`: 29 files, 217 tests passed. Two prior name-only fixture expectations were revised to assert explicit code matching. A parallel lock test was repaired to count only the current store advisory lock rather than unrelated tests' waiters. Disposable test schema cleaned.
- Paired disposable browser/database proof: old same-name role rejected with HTTP 422; existing three Shifts and publication unchanged. BHS checks were read-only with Cancel. Real target-account acceptance remains pending.

## 2026-10-21 empty Job catalog guard

`ShiftDialog.test.tsx` **26/26** passed, including a new no-verified-role Save guard. Full frontend **41 files / 270 tests passed**; root ESLint, TypeScript/Vite production build and `git diff --check` passed (the last emitted only existing line-ending conversion notices). Synthetic STORE_EVALUATOR Chrome with fresh paired disposable real PostgreSQL showed the empty-catalog explanation and disabled Save on Day; Cancel left the target date at 0 Shifts and prior published date at 1. Exact QA services/schemas cleaned. Backend full suite was not rerun because this change is frontend-only; the latest previous backend full gate remains **28 files / 215 tests**. Real store account/device and BHS saved-duration behavior remain unverified.

The extended `qa-script-joined-commit-browser.py` also passed on a second fresh paired disposable stack: one Append, five equivalent Tab/space previews, seven persisted Availability rows, one import audit, three unchanged Shifts, one publication and zero browser errors. This is browser/API/PostgreSQL evidence for name-plus-code import; it did not require a product-code change or a new backend full-suite run.

## 2026-10-21 Day toolbar and local settings checkpoint

Final root `npm run lint` and the guarded read-only Hurstville verifier passed after correcting unused verifier variables.

Frontend `npm run build` passed (TypeScript and Vite); backend `npx tsc -p tsconfig.json --noEmit` passed; `git diff --check` found no whitespace errors. Local guarded Hurstville settings verifier passed with version 2/default break 0, 13 Shifts and 2 publications unchanged. Fresh paired disposable browser with synthetic STORE_EVALUATOR checked Day top navigation and click/drag draft clocks; Cancel left 0 Shifts on the test date. Exact disposable resources cleaned. No full unit-suite rerun was performed for this small UI/settings change; previous full frontend baseline was 41 files/269 tests. Normal frontend HTTP 200 and backend health were checked; real store account/device acceptance remains open.

## 2026-10-21 Day drag-create browser regression

Current-source `python scripts/qa-drag-create-browser.py` passed twice on fresh paired disposable Evaluate/Roster PostgreSQL. Final run used a synthetic STORE_EVALUATOR for Calendar browser/API: Day blank drag prefilled 10:00–11:30, one POST created one Shift, reload/edit preserved those clocks, API verified exact UTC and canonical employee, and the existing published Calendar JSON did not change. `python -m py_compile` passed for the amended QA script. No product source changed in this continuation, so the previous frontend full **41 files / 269 tests**, ESLint and production build remain the most recent product-code gate; they were not represented as a new run here. QA listeners/schemas cleaned, normal 5176/4020 healthy. Real store-account/device acceptance remains open.

## 2026-10-21 Preset Shift break choices

Frontend full suite after the final default change: **41 files / 269 tests passed**; ESLint passed; TypeScript/Vite production build passed. Focused `breakMinuteOptions`, ShiftDialog and TemplatesPage run: 3 files / 31 tests passed. Current-source browser plus disposable PostgreSQL verified BHS-aligned new-template defaults, template creation, Day application, one saved Shift, exact UTC timestamps and 120-minute break; see `scripts/qa-break-preset-browser.py` and [browser evidence](ROSTER_BROWSER_QA.md). This pass made no backend product, Prisma migration or Evaluate source change; backend full suite was not rerun because the change is frontend-only. QA listeners/schemas cleaned, normal frontend HTTP 200 and Roster database/Evaluate health true. No BHS data write. Real store-account/device gate remains open.

## 2026-10-21 full regression after BHS Day read-only check

Current-source frontend: **40 files / 265 tests passed**, ESLint passed, TypeScript/Vite production build passed. Backend: **28 files / 215 tests passed** with `RUN_DATABASE_TESTS=1` on freshly migrated disposable PostgreSQL schema `codex_roster_backend_test_1792518636434_5e76`; backend `tsc --noEmit`, Prisma Validate and read-only migration status passed (nine migrations current in local public). The exact test schema was cleaned. Normal frontend returned HTTP 200 and Roster health reported database and Evaluate both true. No product source, migration, normal-store data, Evaluate source or BHS data changed in this check. BHS Day Add/Edit evidence is unsaved; target real account and store-device acceptance remain open.

## 2026-10-21 published-name Day search regression

Red current-source isolated Chromium: published Day sidebar showed frozen `Regular Bob` but current Evaluate name `Renamed Bob` search returned 0 rows. Green after `filterScheduledEmployeesByName`: current and frozen names both found the same historical card before/after reload, with zero Roster writes/page errors and unchanged frozen assignment/publication names and Shift version. Focused summary tests **9/9**; full frontend **40 files/265 tests**, ESLint and production build passed. No backend product/schema change. Exact paired Evaluate/Roster schemas and QA listeners cleaned.

## 2026-10-21 Day overlap refresh regression

New guarded disposable browser/PostgreSQL regression passed: five overlapping Day cards reduced to one, and the surviving card grew from 33.3% to 99.8% of the Day column after the in-page Refresh without a full browser reload. This falsified a suspected stale `eventDidMount` layout bug for the tested transition. Existing current-source saved-card browser check also passed Day/Week: zero Shift writes, native drags, text selections and position changes; click still opened detail. New QA files: `scripts/qa-day-overlap-reflow-browser.py`, `backend/scripts/remove-day-overlap-browser.ts`. Both exact fixture schemas and QA listeners cleaned. This does not establish every overlap transition or real-device rendering.

## 2026-10-21 joined Script persisted acceptance

New current-source disposable Chromium/PostgreSQL acceptance passed: one `HandoverEmployee006<Tab>1AA2AA34567AA` Commit produced 7 SCRIPT Availability rows and 1 APPEND audit; two alternate joined/spaced previews each returned 0 new/7 unchanged with Commit disabled. Guarded DB verifier checked every date, UTC clock, source/status and the unchanged 3 Shifts/1 publication after reload. Exactly one Commit request, zero page errors. QA resources cleaned. Earlier same-turn frontend 40 files/264 tests, lint/build and backend parser 14/14 passed. This is generated ADMIN/local acceptance, not real store-account or BHS Submit evidence.

Backend production build: first attempt encountered Windows Prisma DLL `EPERM` while the normal 4020 watcher was running. After verifying and stopping only that Roster watcher/listener, `npm run build` completed (Prisma Client generated, TypeScript compiled). `scripts/start-dev.ps1` restarted the normal service and confirmed frontend 5176 plus backend 4020 health with database/Evaluate both true. The Prisma 7 config deprecation warning remains non-blocking.

## 2026-10-21 exact Script Preview and layout fix

Current backend parser **1 file / 14 tests passed**, including exact equality across the three BHS-observed Tab-separated expressions. Current-source paired disposable browser/PostgreSQL previewed each as seven AA 10:00–22:00 CREATE rows with zero conflicts, then cancelled; direct DB read found 0 Availability and 0 import audits. The screenshot exposed a tab/header overlap. After moving tabs into normal layout, fresh desktop and narrow Chrome verified positive tab-to-heading gaps, one-column narrow layout and no page overflow; browser errors 0. Frontend **40 files / 264 tests**, ESLint and production build passed. Second DB read stayed at 0 Availability/0 import audits and 3 Shifts/1 publication. Both sets of exact QA resources were cleaned. This does not substitute for a new full import Commit or real store evaluator account.

## 2026-10-21 joined Script Time-tab reference

Current-source backend `npx vitest run tests/presetTimeSlotScript.test.ts`: **1 file / 14 tests passed**. The strengthened regression compares exact canonical employee/date/UTC-time rows for BHS-observed Tab-separated `1234567AA`, `1AA2AA34567AA`, and `1AA 2AA 34567AA`. Signed-in BHS showed seven identical unsaved AA intervals for all three expressions; all were cancelled without Submit. This is reference preview evidence and parser-unit evidence only. No new PostgreSQL import or Molly UI Commit was run in this step; prior isolated browser/PostgreSQL results are recorded below.

## 2026-10-21 Day toolbar/footer placement

Frontend **40 files / 264 tests passed**, TypeScript/Vite production build passed, ESLint passed after completing the `load` callback's stable setter dependency. Current-source generated-admin Chrome showed the reduced Day header and functioning footer `排班操作` menu; Copy Day opened and Cancel returned to Day. No console errors. Direct paired disposable PostgreSQL remained 3 Shifts/3 assignments/1 publication; exact QA resources cleaned. No backend product code, Evaluate integration or migration change in this placement step. [Browser QA](ROSTER_BROWSER_QA.md).

## 2026-10-21 BHS Day visual evidence

Read-only Chrome DevTools screenshot capture succeeded for the signed-in BHS Day scene after the standard screenshot route timed out. It is a private 2320 × 1253 raster of a 3093 × 1670 CSS px viewport, excluded from Git because it contains real schedule data. Image review corroborates the previous Day overlap, text and sidebar DOM measurements in [BHS visual parity](BHS_VISUAL_PARITY.md). This adds reference evidence only: no new Molly automated test or BHS mutation, and no claim that saved BHS interactions or real-store pilot acceptance passed.

## 2026-10-21 Copy blocker-count wording

The duplicate Copy issue suffix was corrected from a Shift count to an issue-occurrence count. Full frontend **40 files / 264 tests passed**, ESLint and TypeScript/Vite production build passed. Current-source generated STORE_EVALUATOR Chrome in paired disposable PostgreSQL showed one `（2 项相同问题）` alert for 0/2 copyable historical-role Shifts, disabled Commit and a successful Cancel. [Screenshot](evidence/molly-copy-day-simplified-preview-2026-10-21.png). Direct PostgreSQL stayed 3 Shifts/3 assignments/1 publication; QA resources were cleaned. No backend, Evaluate or migration change.

## 2026-10-21 Day toolbar and Copy simplification

Frontend `npm test -- --run`: **40 files / 264 tests passed**. `npm run lint` and `npm run build` passed, with lint/build rerun after final Copy blocker grouping. Current-source Chrome confirmed the icon was recognized as `button "排班操作"` and Enter opened its menu. Isolated Copy Day preview showed **0/2** copyable for unsupported historical `QA Front` and disabled Commit; after the grouping change, a fresh browser run showed one clear reason with `（2 项相同问题）` and Commit still disabled. [Preview screenshot](evidence/molly-copy-day-simplified-preview-2026-10-21.png). Both previews were cancelled. Blank Day drag opened 14:00–15:30 Add/Cancel; saved grouped card click opened chooser/Cancel. Direct disposable PostgreSQL: **3 Shifts / 3 assignments / 1 publication** unchanged in both runs. No backend product code, migration, or Evaluate source change in this step.

## 2026-10-21 date-scoped Scheduled Shift Jobs

Added pure regressions for current-store active Evaluate Jobs held by scheduled employees and for explicit unchecks surviving date changes while new Jobs start checked. Focused scheduled-summary suite **8/8**; frontend full suite **40 files / 264 tests passed**; ESLint and `tsc -b && vite build` passed. One intermediate test failed because its synthetic Job display order was wrong; the fixture was corrected before the passing rerun. Current-source isolated Chrome verified date-scoped options, new-option default, retained old exclusion and complete 4 h employee totals; [screenshot](evidence/molly-day-date-scoped-job-selection-2026-10-21.png). Guarded PostgreSQL returned unchanged 3/3/1 rows and version 1/1. No product backend, Evaluate source or migration change. Backend full suite was not rerun for this frontend-only change.

## 2026-10-21 Scheduled Shift employee-Job filtering

Replaced the earlier Shift-role filter with active current-store Evaluate Job options and post-aggregation employee qualification filtering. Focused `scheduledShiftSummary.test.ts`: **7/7**. Full frontend: **40 files / 263 tests passed**; ESLint passed; `tsc -b && vite build` passed. An initial TypeScript build caught an incomplete synthetic assignment in the new test; the fixture was corrected and the production build then passed. Current-source disposable Chrome verified both Job selections, full retained 4 h totals, empty selection and historical-role Worklog; [screenshot](evidence/molly-day-formal-job-filter-2026-10-21.png). Guarded PostgreSQL verifier confirmed unchanged 3 Shifts/3 assignments/1 publication and unchanged period versions. No backend product or Evaluate source change, no migration. Backend full suite was not rerun for this frontend-only correction; prior backend results below remain historical.

After the final active-catalog ID reconciliation, the full 263-test frontend suite, ESLint and build passed again. A new isolated Chrome session repeated Service-only/Bob 4 h, Training-only/Alice 4 h, and all-selected/both rows; direct PostgreSQL again confirmed unchanged fixture rows and period versions. Both rounds of temporary resources were cleaned.

The subsequent employee formal-Job label display was verified in a third fresh isolated Chrome/paired PostgreSQL session. Frontend **40/40 files, 263/263 tests**, ESLint and production build passed after the display change; direct PostgreSQL again showed unchanged 3/3/1 rows and version 1/1. [Browser screenshot](evidence/molly-day-employee-formal-jobs-2026-10-21.png). Temporary resources were cleaned.

## 2026-10-21 Scheduled Shift month/year controls

Added direct month/year navigation and ISO week numbers to the existing side-panel date grid. The scheduled-summary test now asserts October 2026 week 40 and the 2020/2021 ISO year boundary. Current-source frontend **40 files / 262 tests**, ESLint and TypeScript/Vite production build passed. Paired disposable Chrome verified month/year jumps, retained selected-date totals, unchanged main Day, six week-number rows and narrow-screen no-overflow. Guarded direct PostgreSQL confirmed 3 Shifts/3 assignments/1 publication and unchanged DRAFT/PUBLISHED versions. No backend product, Prisma migration or Evaluate source change; temporary schemas/services were cleaned.

## 2026-10-21 Scheduled Shift formal-role catalog guard

At this earlier checkpoint, the sidebar's Job checkboxes came from the Calendar's Evaluate-verified formal-role catalog, matched to stored Shift role IDs. A historical draft role remained in Worklog with an explicit old-role label; published role names remained frozen snapshots. Two pure tests covered the verified-filter boundary and draft/published labels. Frontend **40 files / 262 tests**, ESLint and TypeScript/Vite production build passed. Disposable Chrome confirmed an unverified synthetic QA role did not appear as a checkbox while both historical employee rows remained visible. Guarded PostgreSQL verified 3 Shifts/3 assignments/1 publication and unchanged period versions. The later correction above replaces the Shift-role matching with employee formal-Job filtering.

## 2026-10-21 Scheduled Shift date-range correction

After BHS read-only observation disproved discrete date toggling, Molly's mini-calendar now selects a continuous inclusive range and handles both endpoints, earlier dates and single-day clear. Two new pure regression cases bring the frontend to **40 files / 260 tests passed**; ESLint and TypeScript/Vite production build passed. Current-source Chrome verified a three-day 8–10 October range, endpoint reset, a 24-day 10 October–2 November cross-month range, intermediate draft and published Shift summaries, and an unchanged main Day date. Guarded direct PostgreSQL confirmed 8 fixture Shifts, 5 comparison cards, 1 publication and unchanged period versions. No backend product, Prisma migration or Evaluate source change. The paired schemas and QA services were cleaned after verification.

## 2026-10-21 Day Scheduled Shift panel

After the independent side panel and cross-month selected-date fetch, frontend `npm test -- --reporter=dot` passed **40/40 files and 258/258 tests**; `npm run lint` and TypeScript/Vite production build passed. Two pure tests cover Monday-first six-week month dates, selected-date filtering, net hours after breaks and published assignment-name snapshots. Current-source browser verified date selection, cross-month persistence, search/role filter, Worklog, card Edit and blank-grid Add/Cancel. Guarded PostgreSQL `scripts/verify-bhs-day-card-browser.mjs` passed with 8 Shifts, 5 comparison cards, 1 publication and unchanged DRAFT/PUBLISHED versions. No product backend, Prisma migration or Evaluate source change in this panel step.

## 2026-10-21 current-geometry Day drag-create acceptance

No application source changed in this checkpoint. A new guarded disposable-schema verifier, `backend/scripts/verify-day-drag-create-current.ts`, executed successfully after current-source Chrome dragged a blank Day range, saved HandoverEmployee006 14:00–16:00, reloaded, clicked Edit and attempted a no-op drag on the saved card. Direct PostgreSQL found exactly one new Shift at 2026-10-09T03:00Z–05:00Z, canonical HandoverEmployee006, four total Shifts, DRAFT version 2 and unchanged PUBLISHED version 1/one publication. Browser console errors: 0. The QA tab, 4010/4035/5177 listeners and exact paired schemas were cleaned. The previous full frontend gate remains 39 files/256 tests, lint and build passed; those suites were not rerun for this verifier-only addition. No BHS or normal data change.

## 2026-10-21 five-card Day visual regression

Current-source frontend `npm test -- --run`: **39/39 files, 256/256 tests**. `npm run lint` and `npm run build`: passed. The new disposable `seed-bhs-day-card-browser.ts` ran; guarded PostgreSQL `verify-bhs-day-card-browser.mjs` confirmed 8 fixture Shifts, 5 comparison cards, one publication and unchanged period versions after browser click/drag/Edit/Cancel. No backend application/API/schema or Evaluate source change. Physical window resize and BHS screenshot remain unverified.

## 2026-10-21 Script Import to saved Day Shift

`E:\PY Study\Evaluate Molly\backend\scripts\seed-roster-day-formal-job.ts` successfully seeded only a guarded disposable Evaluate schema with `QA Front` and HandoverEmployee006/Cindy formal assignments. The first invocation failed before any transaction write because the fixture query used a nonexistent `isActive` Employee field; it was corrected to `status: Active` and rerun successfully. `npx tsc --noEmit` passed in both backends; their normal tsconfigs do not typecheck every one-off script, so the successful guarded `tsx` runs are direct execution evidence. Current-source Chrome performed 7-row name-first import Commit, 10:00–11:00 Day Shift Save, reload, Edit/Cancel, Week/Month viewing and rejected 09:00 draft. `backend/scripts/verify-day-script-shift-browser.ts` passed twice against the isolated Roster schema, confirming seven SCRIPT rows/one import audit, exactly one new Shift with canonical HandoverEmployee006 and correct UTC endpoints, three unchanged baseline Shifts and one publication. Chrome console errors: 0. Exact QA ports/schemas were cleaned; normal 5176/4020 are healthy. No Prisma migration or Evaluate product API change. The browser test is synthetic; real account and device acceptance remain open.

## 2026-10-21 Day availability and isolated import acceptance

Frontend `npm test -- --run`: **39 files/256 tests passed**. `npm run build` passed TypeScript and Vite production build. Targeted ESLint for `calendarAvailability.ts`, its tests, `ShiftDialog.tsx` and its test passed. Two new unit cases verify that Tuesday-only Availability does not contaminate a Monday shift and that a prior-day overnight window remains eligible; a new component regression asserts the actual employee card does not show the false warning. Current-source browser committed two name-first import rows in paired disposable PostgreSQL schemas; the guarded verifier found exactly two canonical rows/one audit and unchanged fixture Shift/publication counts. The Monday/Tuesday Day Add displays were checked and cancelled. Exact QA schemas/listeners were cleaned; normal 5176/4020 remained healthy. No migration or Evaluate source edit was required. Formal-position-free synthetic employees cannot prove a saved Day Shift workflow; real STORE_EVALUATOR/device acceptance remains open.

## 2026-10-21 guarded QA availability template deactivation

`backend: npx tsc --noEmit` passed with `backend/scripts/deactivate-legacy-qa-availability-templates.ts`. The script ran once against guarded local `molly_roster` public PostgreSQL, wrote a before-image JSON backup, and transactionally deactivated only the two exact QA availability templates. Post-operation database readback: 15 Shifts, 21 employee Availability rows, 4 publications, 0 Availability Script import audits; both template rows remain recoverable and inactive. Normal Chrome verified the stale QA Apply button disappeared and both joined/separated name-first script expressions produced identical seven-day previews, then Cancel. Fresh migrated disposable PostgreSQL `codex_roster_backend_test_1792506741686_5534` with `RUN_DATABASE_TESTS=1`: focused parser plus import integration **2 files/22 tests passed**, including atomic commit, conflict rollback and idempotency; exact schema cleaned. This is not a current-source browser committed-import or real evaluator acceptance result; no schema migration or Evaluate/BHS data change occurred.

## 2026-10-21 clean Shift Edit cancellation

Added a component regression for closing an unchanged Shift whose old role is absent from the current Evaluate-approved choices. `ShiftDialog.requestClose` now skips a false discard prompt when `hasUnsavedChanges` is false. Focused `ShiftDialog.test.tsx` **24/24**, full frontend Vitest **39 files/253 tests**, ESLint and production build passed. Normal Chrome verified unchanged Cancel closes directly and a changed role still prompts before discard; all test drafts were discarded. Backend TypeScript `--noEmit` passed for the guarded local-role script. The exact role deactivation had a JSON backup and direct PostgreSQL invariants: QA role inactive/version 2, 8 historical Shifts/15 assignments, 13 total Hurstville Shifts, 2 publications, 14 Availability and 0 import audits. No schema migration or Evaluate/BHS source/data change.

## 2026-10-21 local Hurstville reference presets

`backend: npx tsc --noEmit` passed after adding guarded audit/import scripts. The one-time local public-schema import verified exact AA/BB/CC code/time shortcut baseline, backed up the pre-change templates/shortcuts/counts, created three role-null Shift templates in one transaction, and read back 13 unchanged Shifts and 2 unchanged publications. Normal current-source Chrome verified all three Add-form clock/break prefills and Cancel with no Shift Save. Normal Staff Preview of `HandoverEmployee006 1AA2BB` resolved two correct next-week dates; Cancel and direct PostgreSQL comparison retained 14 Availability rows and 0 import audits. BHS reference selection was also cancelled. Targeted `git diff --check` passed. No product-source or migration change; broad frontend/backend suites were not rerun for this local configuration-only step (previous full suites remain dated above).

## 2026-10-21 Script Import name boundary

Red parser test reproduced a wrong canonical employee assignment for `HandoverEmployee006 1AA 2BB` when both HandoverEmployee006 and HandoverEmployee006 1AA exist. After the boundary guard, focused backend parser **14/14** and full backend **28 files/215 tests** passed with `RUN_DATABASE_TESTS=1` on freshly migrated disposable PostgreSQL `codex_roster_backend_test_1792503890132_dfca`. Backend TypeScript `--noEmit` and targeted diff check passed. Current-source isolated Chrome covered the blocking error, explicit Tab disambiguation for both employees and Cancel; guarded DB found zero Availability/import writes and unchanged original Shifts/publication. Exact schemas and QA services were cleaned. No frontend product source, Prisma migration or Evaluate source changed.

## 2026-10-21 Day spring-forward pointer regression

`npx vitest run src/lib/timeGridPointer.test.ts`: **1 file / 4 tests passed**. Added an observed BHS 2026-10-04 01:30–04:30 wall-clock drag case, asserting the correct Sydney UTC endpoints 2026-10-03T15:30Z–17:30Z (2 hours actual). Normal Molly and BHS browser draft observations are recorded in `ROSTER_BROWSER_QA.md`; both drafts were cancelled. No product source, migration or backend code changed at this checkpoint; prior full-suite results below remain the last full-suite run.

## 2026-10-21 overnight Script Import

Red parser tests first produced `INVALID_SHORTCUT` for `22:00–02:00`; a red preview test missed a next-day overlapping Shift. After the fix, focused parser/preview **22/22** passed, full backend **28 files/214 tests** passed with `RUN_DATABASE_TESTS=1` on freshly migrated disposable PostgreSQL `codex_roster_backend_test_1792502618811_35b5`, and backend TypeScript `--noEmit` passed. Frontend **39 files/252 tests**, ESLint and production build passed. Browser/API/DB evidence is in `ROSTER_BROWSER_QA.md`. Exact test schema and browser schemas were cleaned. No Prisma migration or Evaluate source change.

## 2026-10-21 Day layout and Copy-menu checkpoint

Frontend `npm test -- --run`: **39 files / 252 tests passed**. `npm run build` and `npm run lint` passed. Focused overlap regression covers transitive chain column reuse and a 22:00–02:00 overnight interval sharing the next day's columns. Current-source isolated Chrome verified 50-person Day paging, card widths, overnight layout, click Edit, blank drag Add, view switching and Copy chooser/Copy Day opening without Save; console errors: 0. Backend tests were not repeated because backend product source was unchanged. No migration or Evaluate source change.

## 2026-10-20 dense Day follow-up

Current-source browser: 50 scheduled staff/100 Day Shifts within a 500-additional-Shift disposable weekly fixture; first, next and last Day pages, search and click Edit passed. The edit was cancelled. Frontend `npm run build` and `npm run lint` passed; focused Vitest **2 files/15 tests** and full frontend Vitest **39 files/249 tests** passed. Backend tests were not repeated because backend code was unchanged. A transient Vite hot-reload missing import was fixed; the final fresh tab showed no console errors. No migration, BHS write or normal Molly write; temporary schemas and listeners cleaned.

## 2026-10-20 sparse Day follow-up

The distinct scheduled-employee paging guard has a focused regression. Full frontend Vitest passed **39 files/249 tests**; ESLint and production build passed. Live normal Chrome confirmed the unnecessary Day filter was removed while the existing Shift remained visible, with grid top moving from y≈368 to y≈232 at 2109×1139. No backend code, migration, BHS data or normal Molly data changed in this follow-up. Earlier 248-test counts below predate the new regression.

## 2026-10-20 directional Day drag fix

Frontend Vitest passed **39 files/248 tests**; production build and ESLint passed. Backend TypeScript no-emit, Python compile of the updated QA scripts, and `git diff --check` passed. Live CUA browser plus guarded PostgreSQL verified the saved upward 09:00–10:30 HandoverEmployee006 Shift; Day downward and Week upward preview/form regressions also passed. The updated `qa-upward-drag-create-browser.py` expectation was syntax checked but not separately run in this checkpoint. BHS reference Add was cancelled, and all disposable fixture resources were cleaned. Earlier 247-test and upward-gap entries below record the state before this change.

## 2026-10-20 copy action demotion

Frontend `npm run build` and `npm run lint` passed; Vitest passed **39 files/247 tests**. Live local Chrome Day showed `复制到下一周期` removed from the period summary and present under More. Its preview opened, reported the unmatched historical `验收岗`, disabled Commit and was cancelled. No data write was attempted. Day upward-drag mirror/form parity with observed BHS remains open.

The Day endpoint audit used guarded disposable schemas `codex_calendar_name_1792499076002_4501` and `codex_browser_acceptance_1792499065040` and temporary 4010/4035/5177 services. A held 10:30→09:00 browser gesture showed a four-slot 09:00–11:00 mirror and the same 09:00–11:00 Add form. Cancel closed it; all exact QA services, schemas and test tab were cleaned. No normal Molly or BHS data was modified.

## 2026-10-20 script name-mapping integrity

A red parser test reproduced a unique Evaluate name redirected by a client-supplied `employeeMappings` entry to a different active employee. `MAPPING_CONFLICT` now rejects that and also rejects ambiguous-name mappings outside the actual same-name candidates; unknown aliases retain explicit one-import mapping. Parser/route focused **90/90** passed. The first full backend run overlapped the second red-test/code edit and reported 209/210; the completed-code sequential rerun passed **28 files/210 tests** with real PostgreSQL in disposable `codex_roster_backend_test_1792498352723_8356`, then the schema was removed. Frontend picker limits known-name choices; full frontend **39 files/247 tests**, ESLint and build passed. Backend emitted TypeScript and Prisma validation passed. No migration, Evaluate source change, normal database write or BHS write. The direct-API misuse guard was not browser-tested because the regular picker does not offer that invalid action.

## 2026-10-20 name script and Calendar toolbar final gate

The old Molly New canonical-ID input described below was superseded by the user's name-first rule. Joined seven-day codes and concatenated groups passed focused parser/route tests and real browser/PostgreSQL append verification. After the Calendar toolbar simplification, full frontend passed **39 files/246 tests**, ESLint and production build; backend TypeScript no-emit and Prisma validate passed. Full backend with `RUN_DATABASE_TESTS=1` against freshly migrated disposable `codex_roster_backend_test_1792497898344_389c` passed **28 files/208 tests**, then the exact schema was removed. Live local Chrome opened More → Copy Day and cancelled. No normal database or BHS data was changed in this toolbar check.

## 2026-10-20 BHS SID-mode correction

BHS signed-in read-only observation showed New expects a staff SID; Molly New now uses exact Evaluate canonical employee IDs or explicit one-import SID mapping, keeping Time name resolution. Focused backend parser/routes **86/86**, focused frontend dialog/input **4/4**, full frontend **37 files/237 tests**, ESLint, frontend production build and backend TypeScript `--noEmit` passed. Full backend on guarded disposable PostgreSQL with `RUN_DATABASE_TESTS=1`: **27 files/205 tests passed, 0 skipped**; an initial run without the flag passed 155 and skipped 50 and is not counted as database verification. Fresh paired disposable browser/PostgreSQL passes are in `ROSTER_BROWSER_QA.md`; three test schemas and QA listeners were removed. No schema migration or Evaluate source change. BHS Submit and real store-account acceptance remain unverified.

An additional fresh paired browser/PostgreSQL run verified unknown BHS SID selection: warning and zero write before mapping, then one reviewed Commit to the selected Evaluate canonical employee. The New tab's Rules copy now says employee ID; its focused frontend test passed **2/2**. Both additional schemas/listeners were cleaned. All BHS reference interactions ended without Submit.

Final frontend rerun after that text/test edit: **38 files/244 tests**, ESLint and TypeScript/Vite production build all passed.

## 2026-10-20 script dialog measured height and New-tab append

Browser `qa-script-tabs-browser.py` passed at 3093×1670 after asserting panel **1300×847 px** against prior BHS **1300×846.8 px** measurement; textarea **353×504 px**. All three tabs, draft reset, shortcut version 1→2, Preview/Cancel and database zero-import guard passed. `qa-script-new-append-browser.py` then passed on the same disposable fixture: a New-tab Preview led to exactly one Commit and direct PostgreSQL verified one correct canonical employee Availability row, one audit, unchanged Shift/publication counts. The prior turn's current product-source frontend suite was **37 files/236 tests**, ESLint and build green; this turn's product change is CSS only. BHS New/Submit semantics and real store-account acceptance remain open.

## 2026-10-20 Staff store switch scope

Red frontend regression showed Staff calling second-store Availability with the previous store's employee ID. After the fix, focused Staff tests passed **9/9** and full frontend tests passed **36 files/235 tests**. ESLint completed with zero warnings and TypeScript/Vite production build passed. Current-source isolated Chromium made one second-store Availability GET for `browser-other-employee`, no previous-store employee GET, and no Roster write; screenshot and paired schema IDs are in `ROSTER_BROWSER_QA.md`. Exact QA listeners/schemas were cleaned. Backend product source was unchanged; the latest full isolated backend PostgreSQL result remains **203/203** from the preceding backend change and was not rerun for this frontend-only fix.


## 2026-10-20 exact script preview write set

Red isolated PostgreSQL regression proved same-count CREATE/UNCHANGED swaps were accepted by the old script Commit. After binding per-slot status and existing-row ID/version to the preview, focused route/integration tests passed **83/83**, full backend isolated PostgreSQL passed **27 files / 203 tests**, and a fresh-schema 7/7 integration rerun covered a same-status but replaced existing row. Full frontend passed **36 files / 234 tests**, ESLint and frontend production build passed, backend emitted TypeScript compile and Prisma validate passed. Fresh current-source Chromium returned 409/no write for the stale 1/1 preview, then re-previewed and committed the new 1/1 state; direct guarded PostgreSQL verified 2 rows, 1 audit and unchanged 3 Shifts/1 publication. A separate clean fixture reran two-employee Script Import, Cancel, rejection paths and Calendar propagation. Python browser scripts compiled. No backend migration or Evaluate source change. Temporary databases/listeners were cleaned.

## 2026-10-20 script shortcut load retry

Red isolated Chromium test: initial shortcut GET failure left no Retry button and displayed the reference defaults. After adding a failed-load guard and retry, `qa-script-shortcut-load-retry-browser.py` passed: the actual saved store shortcut appeared after retry, Preview/Cancel produced no shortcut or import write, and guarded PostgreSQL found no Availability/import audit change. Frontend full suite **36 files / 234 tests**, ESLint, TypeScript/Vite production build and Python compilation passed. Backend product source/schema were unchanged; the last isolated backend PostgreSQL full-suite result remains **202/202** from an earlier turn, not rerun here.

## 2026-10-20 sidebar order and current-source Calendar smoke

Changed Molly shared sidebar order to align the five destinations with the observed BHS order, retaining Templates as a Molly extension and preserving mobile quick-link order. Current-source isolated Chromium passed `qa-drag-create-browser.py` and direct guarded PostgreSQL `verify-drag-create` for one 10:00–11:30 HandoverEmployee006 Shift; clean-fixture `qa-sidebar-measured-browser.py` passed order, geometry, collapse, navigation, mobile width and zero-write checks. Frontend `npm test -- --run` passed **36 files / 234 tests**; `npm run lint`, `npm run build`, Python compile and `git diff --check` passed. No backend product code, migration or Evaluate source changed. The latest full isolated backend PostgreSQL **202/202** result remains from the preceding product-source change and was not rerun here.

## 2026-10-20 UNKNOWN template consistency

Red route regression: mixed UNKNOWN/timed template unexpectedly returned 201. After schema validation and a Staff guard for historical invalid templates, focused backend route and frontend helper tests passed. Full backend on disposable PostgreSQL `codex_roster_backend_test_1792491891066_a7d0`: **27 files / 202 tests**. Full frontend: **36 files / 234 tests**. ESLint, frontend TypeScript/Vite production build and backend emitted TypeScript compile passed. Isolated current-source Chromium/API confirmed two malformed template POSTs returned 400 with no template-list change and a synthetic legacy template did not change the Staff draft. Exact QA listeners and all schemas were cleaned. No migration or Evaluate source change.

## 2026-10-20 UNKNOWN Availability integrity

Red focused unit: contradictory UNKNOWN/day input unexpectedly resolved. After the service guard, focused unit and isolated PostgreSQL integration passed; full backend **27 files / 201 tests** passed on disposable schema `codex_roster_backend_test_1792491393794_21c1`. Backend TypeScript no-emit, emitting production compile, and Prisma validate passed. Current-source Chromium authenticated API tested three malformed writes: all returned 400 and the prior UNKNOWN row was identical after each. No frontend or Evaluate application source changed, no migration, and all isolated schemas/listeners were cleaned. Frontend 233/233 and lint/build remain the latest results for unchanged frontend source.

## 2026-10-20 generated store-evaluator import

Current-source browser/API/isolated PostgreSQL acceptance passed through `qa-evaluator-script-browser.py`: Preview/Cancel 0 writes, one Confirm 2 Availability rows and 1 audit, correct canonical IDs, Week Calendar availability visible, and two cross-store requests 403. The guarded DB verifier also checked original 3 Shifts and 1 publication. Python script compilation passed; exact test listeners and schemas were cleaned. No product source or migration changed, so the latest full product-source gates remain frontend 233/233, backend isolated PostgreSQL 199/199, frontend lint/build and backend TypeScript/Prisma validate. Real target evaluator credentials were unavailable and this synthetic role does not satisfy that acceptance gate.

## 2026-10-20 employee-row pointer behavior

`qa-employee-row-click-only-browser.py` passed in current-source Chromium with disposable paired PostgreSQL schemas: saved card drag produced no native drag, text selection, position change, dialog, Shift/period mutation or API write; card click and blank employee-date creation remained functional. The QA script compiles with `python -m py_compile`; only QA/documentation changed. The latest product-source gates remain frontend 233/233, backend isolated PostgreSQL 199/199, frontend lint/build, and backend TypeScript/Prisma validate. Exact test listeners and schemas were cleaned.

## 2026-10-20 saved-card pointer behavior

Current-source disposable Chromium `qa-full-day-saved-card-browser.py` passed twice in Day and Week: native browser dragstarts 0, text selections 0, card position unchanged, Shift mutation requests 0, authenticated source Shift reads unchanged and click-to-edit chooser functional. Only the QA script and documentation changed. The latest unchanged product-source gates remain frontend 233/233, backend isolated PostgreSQL 199/199, frontend lint/build, backend TypeScript/Prisma validate. Paired test schemas and exact listeners were cleaned.

## 2026-10-20 spring-forward Availability correction

Red frontend and real-PostgreSQL regressions showed a valid Sydney 23.5-hour next-day Availability rejected by a wall-clock comparison. After removing that comparison, focused frontend **13/13** and backend cross-day **7/7** passed; a 24.5-hour candidate still returned 400 without changing the saved row. Full backend: **26 files/199 tests** on a disposable PostgreSQL schema; full frontend: **36 files/233 tests**; ESLint, frontend production build, backend TypeScript no-emit and Prisma validate passed. Current-source Chromium Staff save/reload and guarded PostgreSQL read confirmed the exact UTC instants and unchanged synthetic Shift/publication counts. All three test schemas and temporary services were cleaned. No migration or Evaluate application change.

## 2026-10-20 script replay feedback

The two-window disposable Chromium regression first failed on the misleading second success toast, then passed after Staff used the backend `alreadyImported` flag. Database verifier: 2 SCRIPT Availability rows, **1** import audit, no extra Shift/publication changes. Full frontend **36 files/232 tests**, ESLint and TypeScript/Vite production build passed. No backend source/schema changed this turn; the latest backend isolated PostgreSQL **198/198** result remains from the prior parser change. Test services and paired schemas were cleaned.

## 2026-10-20 Calendar click jitter

Current-source isolated Chromium passed **12/12** Week/Day pointer-jitter click cases (1, 3 and 5 px, blank and saved cards), with correct blank 14:00–14:30 prefill, saved grouped chooser, Cancel and **zero Roster writes**. Only a new browser QA script and documentation changed, so the preceding full frontend **232/232**, ESLint and production build results still cover current product source; the preceding backend isolated PostgreSQL **198/198** result is unchanged. Both test schemas and exact listeners were cleaned.

## 2026-10-20 Week/Day grid geometry

An isolated 4536×2449 Chromium assertion reproduced a 66 px Week/Day grid-height deficit against earlier read-only BHS measurements. After changing the time-slot viewport offset, both views measured 2237 px surface height and 92.06 px/hour; their x/y/width differed from BHS by 1/0/2 px. Both large-viewport drags still prefilled 14:00–15:30. Twelve rapid drags and two saved-card no-drag checks passed separately at 2109×1139, with zero Roster writes. Full frontend **36 files/232 tests**, ESLint and TypeScript/Vite production build passed. Paired QA schemas and exact listeners were cleaned. Backend/Evaluate source and migrations were unchanged; most recent backend full isolated PostgreSQL run remains **198/198** from the preceding parser fix.

## 2026-10-20 Excel paste row limit

A red parser test showed that 100 populated employee rows followed by two empty paste lines were rejected as `TOO_MANY_LINES`. After counting only populated rows, focused parser tests passed **8/8** and the full backend suite passed **26 files/198 tests** on disposable PostgreSQL `codex_roster_backend_test_1792488026030_5582`. Backend TypeScript `--noEmit` and Prisma validate passed. Paired-schema Chromium Staff Preview accepted one valid row plus 101 trailing blank lines; Cancel made zero Availability/import writes. The same browser fixture passed 12 rapid Week/Day blank-grid drags and two saved-card no-drag checks with zero Roster writes. All temporary schemas and exact listeners were cleaned. Backend `npm run build` was not rerun because it regenerates Prisma while the normal Windows backend holds its engine; no schema or Evaluate code changed.

## 2026-10-20 Settings inactive role recovery

The new missing-reactivation test failed before implementation. Focused Settings tests then passed **13/13**, followed by full frontend **36 files/232 tests**, ESLint, TypeScript/Vite production build and edited-file `git diff --check`. Paired disposable Chromium/API verification created/deactivated/reactivated one synthetic role, confirmed persisted version 3 after reload, preserved ADMIN-only inactive inventory (STORE_EVALUATOR 403), and made zero Shift writes. Both QA schemas/listeners were cleaned. No backend or Evaluate source, schema migration, or normal data changed. Most recent backend full isolated PostgreSQL suite remains **197/197** from before this frontend-only change.

## 2026-10-20 Settings formal-job identity

A new same-name/different-ID Settings regression failed before the fix and passed after it. Focused frontend tests passed **2 files/11 tests**, then the full frontend suite passed **36 files/228 tests**. ESLint, TypeScript/Vite production build and an edited-file `git diff --check` passed. Isolated current-source Chromium confirmed the row actions using synthetic GET response additions with zero Roster writes; disposable schemas and listeners were cleaned. Backend code/schema and Evaluate code were not changed; the previous full backend **197/197** result predates this frontend-only fix. Live BHS Settings and real STORE_EVALUATOR acceptance remain unverified.

## 2026-10-20 measured sidebar and Month layout

After the AppShell/Month geometry change, full frontend tests passed **36 files/227 tests**, ESLint passed, and TypeScript/Vite production build passed. Current-source isolated Chromium measured the 320/60 px sidebar and Month outer rectangle against recorded same-viewport BHS values, operated collapsed desktop navigation and mobile drawer without Roster writes, and repeated **24** Week/Day blank drag selections with identical 14:00–15:30 drafts and zero writes. Paired synthetic PostgreSQL schemas and exact QA services were cleaned. Backend source/schema was unchanged during this layout continuation, so the previous isolated backend **197/197** result remains the most recent backend result. BHS session is now at login, and real STORE_EVALUATOR acceptance was not run.

## 2026-10-20 Availability Script reviewed-count guard

A disposable PostgreSQL red test first confirmed that a two-row CREATE Preview could Commit as one CREATE/one UNCHANGED after another administrator inserted an identical row. The transaction now returns 409 before any import write when current CREATE/UNCHANGED counts differ from the reviewed counts. A route regression binds those counts into the preview hash. Focused tests passed **89/89**; full backend suite passed **26 files/197 tests** on disposable PostgreSQL `codex_roster_backend_test_1792485328007_7436`. Full frontend suite passed **36 files/227 tests**, ESLint and TypeScript/Vite production build passed, and backend TypeScript production compile passed. Fresh paired-schema Chromium/API QA confirmed the 409 and unchanged import audit; all exact test schemas and listeners were cleaned. No schema migration, Evaluate code change, or normal-store data mutation. Backend `npm run build` (which runs Prisma generation) was not rerun during this continuation; the existing Prisma Client and updated TypeScript compiled successfully.

The final fresh-schema Chromium rerun used the Staff dialog itself for the changed-count Commit: it showed 409, preserved the script and disabled Confirm. Guarded PostgreSQL returned to the original two SCRIPT rows, one audit, three Shifts and one publication after version-matched removal of the synthetic competing row. Exact QA schemas/listeners were cleaned.

## 2026-10-20 shortcut/settings preview version guard

Red route tests first showed 200 for an old Availability Script preview after either shortcut version or store-settings version changed without changing the resolved time slots. After the fix, route and preview tests passed **82/82**; backend TypeScript passed. Full backend suite against freshly migrated disposable PostgreSQL `codex_roster_backend_test_1792484863165_fda7` passed **26 files/196 tests**. Frontend full suite passed **36 files/227 tests**, ESLint passed, and TypeScript/Vite production build passed. Current-source Chromium with paired disposable Evaluate/Roster schemas verified 409, stale preview clearance and shortcut reconfirmation; guarded PostgreSQL counts stayed at two Availability rows, one import audit, three Shifts and one publication. All exact schemas and QA listeners were cleaned; no migration or real data change. Backend `npm run build` was not rerun after this source-only change; backend TypeScript `--noEmit` passed, and the prior Prisma generation/build remains a previous-turn result.

## 2026-10-20 script preview Workforce Revision

New route regression first failed: a stable canonical script still committed with HTTP 200 after Evaluate `workforceRevision` changed between preview and commit. After separating the reviewed `previewHash` from the stable import `sourceHash`, the stale revision returns 409 before Roster writes. A legacy 1.3 explicit-alias rename regression also passes. Focused backend routes/preview **2 files/79 tests**, backend TypeScript no-emit, and full backend **26 files/193 tests** with `RUN_DATABASE_TESTS=1` against fresh disposable PostgreSQL schema `codex_roster_backend_test_1792483768062_346f` passed. Backend production build initially failed at Prisma Client generation with the verified normal 4020 watcher holding `query_engine-windows.dll.node`; only that process chain was stopped, the build then passed, and normal services restarted healthy. Fresh paired disposable PostgreSQL/Chromium imported two employees and then returned 409 after an unrelated synthetic Evaluate rename changed the workforce revision; direct DB readback stayed at two SCRIPT rows/one audit and unchanged Shifts/publication. All disposable schemas/services were cleaned. No frontend source or migration changed; frontend full suite was not rerun this turn.

## 2026-10-20 repeated-hour Shift target Availability

A new `ShiftDialog` regression checked copy to Sydney 4 April 2027: target Availability only in the first repeated hour blocked the second-hour source Shift; target Availability in the second hour allowed an outgoing payload with exact second-hour UTC start/end. Focused `ShiftDialog` suite passed **23/23** after changing the test's expected error string to the existing specific coverage message. Final full frontend suite passed **36 files/227 tests**; ESLint and TypeScript/Vite production build passed. Fresh isolated PostgreSQL/Chromium Week Add verified a first-to-second occurrence gap is flagged and Save rejected with **zero Shift writes**, while selecting both second occurrences restores eligibility. One initial browser attempt was blocked by a missing QA formal Job and was rerun successfully after adding the Job only to the disposable Evaluate schema. No application source, backend source or migration changed; no backend full suite was rerun this turn. QA services and exact paired schemas were cleaned.

## 2026-10-20 separate repeated-hour Availability badges

The new `calendarAvailabilityByCell` regression first failed: two distinct Sydney repeated-hour rows both rendered `02:15–02:45`. After the fix, focused frontend tests passed **2 files/17 tests**. The first full run had **225/226** passing because an existing retry test asserted that the badge existed immediately after its prior error disappeared. That assertion now waits for the badge itself; final full run passed **36 files/226 tests**. ESLint and the TypeScript/Vite production build passed. Fresh isolated PostgreSQL and Chromium verified the two offset-bearing employee-row badges after reload, two persisted synthetic Availability rows and zero Shift mutation requests; the prior crossing-offset browser path also passed. No backend source or migration changed. The paired test schemas/services were cleaned.

## 2026-10-20 script import Calendar propagation

Extended `qa-multi-employee-script-browser.py` passed Python compile and a fresh isolated Chromium/PostgreSQL run. After importing two employees in one audit, Week employee rows displayed HandoverEmployee006's 10:00–22:00 Availability; Day Shift Add enabled HandoverEmployee006 at 10:00 and disabled HandoverEmployee006 at 09:00. Both dialogs were cancelled, zero Shift writes occurred, and direct database verification kept two Availability rows, one audit, three Shifts and one publication. No product code changed, so no frontend/backend full suite was rerun in this turn; latest full backend result remains 191/191 from the prior application change. The exact QA schemas/services were cleaned.

## 2026-10-20 multi-employee script browser QA

New QA artifacts: `scripts/qa-multi-employee-script-browser.py`, `backend/scripts/verify-multi-employee-script-browser.ts`, and `scripts/stop-disposable-roster-browser-qa.ps1`. Backend TypeScript no-emit and Python compile passed. In isolated Chromium/PostgreSQL, two-person preview/cancel caused zero Availability/audit writes; explicit commit created two canonical rows and one audit; a later mixed valid/invalid batch disabled Submit and caused no new write. The safe stop script was smoke tested against three live disposable listeners and stopped only those PIDs while normal services and Docker stayed healthy. An initial broad manual process-tree cleanup temporarily terminated Docker Desktop; it was restarted, the existing database containers recovered, and the first test schemas were cleaned. No product code/migration changed in this turn, so the prior **191/191** backend result applies to unchanged application code but was not rerun here. BHS and real-account gates remain open.

## 2026-10-20 locked script-import configuration versions

An isolated PostgreSQL red test changed the per-store shortcut configuration after the values used to parse a pending import; the old service unexpectedly committed one Availability row instead of returning 409. The commit service now checks the route-read shortcut and store-settings versions after taking the store advisory lock. The regression checks both stale shortcut and stale settings cases, with zero target Availability/audit writes, and a route test verifies the versions are forwarded. Focused **2 files/75 tests passed**; full backend **26 files/191 tests passed** with `RUN_DATABASE_TESTS=1` on disposable `codex_roster_backend_test_1792480990692_79a3`. TypeScript no-emit and full backend production build passed. The exact test schema was removed. This is a within-Roster version check; no cross-database atomic transaction with Evaluate is claimed.

## 2026-10-20 script import prior-day and transaction regression

Red real-PostgreSQL case: importing 8/9 October Availability failed with `EMPLOYEE_UNAVAILABLE` because an unrelated 7 October Shift was included by the previous-day query. Preview and commit now limit that previous-day case to actual interval overlap; same-day coverage checks remain. Focused **2 files/13 tests passed** after the fix, including preview overlap/non-overlap, concurrent duplicate submit (one import ID and one audit), and an isolated PostgreSQL constraint that forces the later audit insert to fail and confirms zero Availability rows for that attempted batch. The subsequent **full backend suite passed 26 files/189 tests** with `RUN_DATABASE_TESTS=1` on `codex_roster_backend_test_1792480317962_2141`; TypeScript no-emit, Prisma validate and full backend production build passed. The test schema was dropped. First build attempt failed with the Windows Prisma DLL lock from the verified 4020 source watcher; controlled stop/build/restart passed and 4020 health returned database/Evaluate true. No frontend application change or new migration in this turn.

## 2026-10-20 scoped Staff script action

Frontend focused `presetScriptInput` 2/2; full frontend **36 files/225 tests**, ESLint, TypeScript and production build passed after the Staff/dialog changes. Browser/PostgreSQL evidence: HandoverEmployee006 and Cindy each saved one scoped `1AA` import, reload then preview reported UNCHANGED, and direct guarded database verification found two canonical Availability rows, two import audits, three fixture Shifts, one publication and unchanged shortcut version 1. First test run exposed a hidden required confirmation inside collapsed details; the UI was changed to open the shortcut panel by default, and the follow-up browser flow passed. No backend application, migration, normal employee or normal Shift data changed. Target real evaluator and exact BHS single-person dialog parity remain unverified.

## 2026-10-20 legacy template visibility and preservation

Current-source frontend focused `calendarLoad` 9/9, full frontend **35 files/223 tests**, ESLint and production build (TypeScript included) passed. In fresh paired disposable Evaluate/Roster PostgreSQL, generated-ADMIN Chromium opened Calendar Add: active time-only `Time only` was visible; inactive time-only `验收早班` was absent. Cancel sent zero Roster mutation requests; authenticated API readback retained both rows with their active flags. Normal Hurstville database was separately audited before/after a guarded deactivation of its exact old QA preset: version 1→2, active true→false, Shift count 13→13. The original template row was backed up in `docs/evidence/hurstville-legacy-qa-template-before-2026-10-20.json`. No role or Shift records were edited. Exact QA services/schemas were cleaned. Normal browser account acceptance and BHS live gesture testing remain open.

## 2026-10-20 drag repeatability and QA origin isolation

Fresh paired disposable PostgreSQL schemas and source-backed Chromium: `qa-week-day-drag-repeat-browser.py` passed **24/24** 2109×1139 blank-grid gestures (12 Week, 12 Day), all prefilled 14:00–15:30 and cancelled with zero Roster mutation requests. `qa-interactive-browser-host-isolation.py` passed: synthetic QA login served on localhost loaded Calendar, set the session cookie for `localhost`, and preserved an existing `127.0.0.1` cookie marker. These checks did not run the full frontend/backend suite or real STORE_EVALUATOR acceptance. Exact temporary 4010/4035/5177 services and two generated schemas were cleaned. Normal 4000/4020/5176 remained listening; 4020 health was 200 with database/Evaluate true. `git diff --check` returned no whitespace errors; Windows line-ending notices appeared.

## 2026-10-20 dense Month CSS and browser gate

The dense Month browser scenario used a real isolated PostgreSQL schema with 50 employees and 500 added Shifts, then directly verified the unchanged 503/503 Shift/assignment counts and one publication after cancelling the last-card edit. Browser observed desktop and 640 px popover scrolling. Production frontend build passed after the CSS popover fix (2249 modules). The latest full frontend suite remains **35 files/223 tests** and ESLint passed immediately before this CSS-only edit; neither was rerun afterward. Backend integration tests were not rerun. All temporary QA resources were cleaned.

## 2026-10-20 Week/Day viewport-scaling follow-up

After the desktop time-grid slot-height change, the final frontend run passed **35 files/223 tests**, ESLint passed, and the production frontend build passed (`tsc -b`, 2249 Vite modules). Browser Week and Day drag prefills passed after layout settling as recorded in `docs/ROSTER_BROWSER_QA.md`. Backend and PostgreSQL integration suites were not rerun for this CSS/frontend change; BHS gesture parity and real STORE_EVALUATOR acceptance remain unverified.

## 2026-10-20 Month Calendar presentation follow-up

After Month view row-count, height, density and card presentation edits, the frontend full suite passed **35 files/223 tests**; ESLint and production build (`tsc -b && vite build`, 2249 modules) passed. The first full run had 222/223 passing because the old Month card test required a visible employee name; that test now asserts the BHS-observed visible role/time/break and employee names in the accessible label/title, and the full rerun passed. Browser-only regression is detailed in `docs/ROSTER_BROWSER_QA.md`; no backend, PostgreSQL integration, migration or real-account test was rerun in this follow-up, so prior results must not be treated as post-change coverage of those areas.

## 2026-10-20 Staff script measured-layout follow-up

After the focused dialog/CSS and clear action change, frontend `npm run build` passed (2249 modules), `npm run lint` passed, and `npm test` passed **35 files/223 tests**. `git -c core.safecrlf=false diff --check` passed. An isolated current-source Chrome session verified preview → clear → disabled Submit → Cancel, and guarded disposable PostgreSQL readback confirmed zero SCRIPT Availability/import-audit writes. Same-viewport geometry and narrow-screen measurements are recorded in `docs/BHS_VISUAL_PARITY.md` and `docs/ROSTER_BROWSER_QA.md`. Backend application code/schema were unchanged in this follow-up; the earlier 185/185 backend result belongs to the previous parser/API change, not a rerun here.

## 2026-10-20 explicit script nickname mapping

Parser regressions cover unknown/ambiguous nickname reporting, explicit canonical choice, duplicate normalized mappings, missing/transferred IDs and inactive staff. Route regressions cover current Evaluate resolution and transfer between preview and commit. Focused backend parser/route suite passed **74/74**; full backend suite against the prepared, migrated disposable real PostgreSQL schema passed **26 files/185 tests**. Frontend full suite passed **35 files/223 tests**, TypeScript, production build (2249 modules) and ESLint passed; backend TypeScript no-emit and emit passed. Fresh isolated Chrome/DB acceptance persisted exactly one canonical `browser-HandoverEmployee006` Availability row and one import audit from synthetic `BHS Alias<TAB>1AA`; replay showed UNCHANGED and Cancel left the counts unchanged. No normal Roster/Evaluate data was modified.

## 2026-10-20 per-store script shortcuts

Additive Prisma migration `20261020163000_store_availability_script_shortcuts` applied after a verified normal-Roster backup. The full backend suite on a disposable real PostgreSQL schema passed **26 files/181 tests**, including store isolation, validation, optimistic version conflict, route authorization and server-side shortcut selection. Backend production build (clean, Prisma generate, TypeScript) and frontend production build (2249 modules) passed; frontend ESLint passed. A fresh paired disposable Chrome/PostgreSQL run verified unconfigured gating, version 1 save, two-row commit and audit, Staff/Calendar visibility, edit-to-version-2 preview invalidation, and a resulting conflict with no extra write. Guarded final readback: 2 `SCRIPT` rows, 1 audit row. Real store evaluator and BHS Submit acceptance are still open.

## 2026-10-20 assigned-Shift script preview follow-up

Added pure preview tests for uncovered and covered assigned Shifts, an authenticated route regression for `canCommit=false`, and a real-PostgreSQL service readback test. The first isolated full backend run was 178 pass/1 fail because the new test role used a color value disallowed by the existing database check constraint; this was a fixture error. Corrected run: **26 files/179 tests passed**, backend TypeScript passed and full backend production build passed. Exact disposable test schema was cleaned and normal 4020 health restored. Browser QA has not yet exercised this particular assigned-Shift warning; it has exercised existing Availability conflict as recorded below.

## 2026-10-20 preset script import

On a disposable real PostgreSQL schema, the full backend suite passed 26 files/175 tests before the subsequent replay-drift guard; focused parser, preview, route and transactional import tests passed 74/74 after that guard. Prisma validate and backend TypeScript passed. Frontend lint and the latest production build passed (2249 modules). Browser QA on independent 5178/4040/4010 with paired disposable databases verified preview/cancel made no writes, explicit two-row import created one audit, replay preview displayed two UNCHANGED rows, and overlapping same-day import displayed CONFLICT with submit disabled. Guarded PostgreSQL readback after the conflict/cancel remained two `SCRIPT` rows and one audit. Exact BHS Submit semantics, Calendar propagation, store evaluator identity and full visual parity remain unverified.

## 2026-10-17 published role snapshot grouping

Red unit case merged three same-time published Shifts with different frozen names/colors into one Calendar group. The new display-name/color group key passed the focused 18/18 and full frontend 35 files/222 tests, ESLint and production build. Paired disposable Chromium showed two distinct Month cards and correct published details; direct PostgreSQL kept two Shift and publication snapshots unchanged. No backend app/schema/Evaluate change, and all QA resources were cleaned.

## 2026-10-17 mouse double-click Save

Paired disposable PostgreSQL/current-source Chromium exercised the actual double-click Save path. One create request and one persisted Shift were found after reload; DRAFT advanced once while the published history remained unchanged. No application code changed; this closes a browser acceptance gap in the no-duplicate-Shift requirement. An initial fixture lacked the target employee's Availability, so the picker correctly blocked selection; the guarded fixture was repaired and rerun. Exact temporary services and schemas were cleaned.

## 2026-10-17 draft role deactivation

Additional race tests covered both advisory-lock orders. Creation first committed the Shift and rejected deactivation with 409; deactivation first committed and rejected Shift creation with 422 `INACTIVE_SHIFT_ROLE`. Focused backend 7/7 and full backend 23 files/163 tests passed on real disposable PostgreSQL; the schema was cleaned. An initial test fixture tried 09:00 after another case changed opening to 10:00 and failed before lock contention; the corrected 10:00 case passed. No product change was needed for this follow-up.

Red real-PostgreSQL test confirmed deactivation of a role with a draft Shift incorrectly succeeded. After the transaction guard, focused backend 5/5 and full backend 23 files/161 tests passed on a disposable schema; its full production build passed. Frontend Settings test 8/8, full 35 files/221 tests, ESLint, TypeScript and production build passed. Disposable Chromium plus authenticated API verified disabled UI, 409 response, unchanged Shift/role and zero page writes. Exact temporary resources cleaned; normal 5176/4020 health passed.

## 2026-10-17 drag text-selection acceptance

The browser regression also now asserts that the Day/Week live selection mirror reads `14:00 - 15:30` before release and matches the Add dialog after release. It passed again on a fresh paired disposable fixture, with zero writes.

Current-source Chromium on paired disposable databases passed Day and Week 14:00–15:30 blank-grid drags with empty browser text selection during and after each gesture, correct unsaved draft prefills and zero Roster writes on Cancel. No product code changed; exact temporary services/schemas were cleaned. Latest full frontend 220/220 and backend real-PostgreSQL 160/160 plus builds remain applicable.

## 2026-10-17 atomic role create and activation

The complete post-change backend production build also passed; the restarted source server and frontend responded 200 with database/Evaluate healthy.

Real-PostgreSQL regression first failed because `createRole` inserted a new code-matched role after a legacy role had acquired the same formal job. After moving creation under the store lock with an in-transaction mapping check, focused DB file passed 4/4, route file passed 62/62, backend TypeScript passed, and full backend passed 23 files/160 tests with `RUN_DATABASE_TESTS=1` on a migrated disposable PostgreSQL schema. That exact schema was cleaned.

## 2026-10-17 concurrent role activation

Post-change full backend production build passed after a controlled stop of the exact Roster watcher; a newly identified source listener on 4020 passed database/Evaluate health while frontend 5176 stayed 200.

The new route regression failed red with HTTP 200 on duplicate reactivation, then passed with 409. Current route suite 62/62, full backend real-PostgreSQL suite 23 files/159 tests, and backend TypeScript no-emit passed. The new database test runs two role activations concurrently for one formal job and verifies one success, one 409, one active row/version 2 and one inactive row/version 1. The exact test schema was cleaned. Paired disposable Chromium/API readback also passed and its schemas/services were cleaned.

## 2026-10-17 post-guard backend production build

The complete backend build wrapper passed after stopping only the verified normal Roster source watcher that held Prisma's Windows DLL. It regenerated Prisma Client v6.19.3 and compiled `dist`; the restarted source listener on 4020 returned health 200 with database/Evaluate true, and frontend 5176 returned 200. Local read-only Prisma migration status found seven applied migrations. This follows current full frontend 220/220 and full real-PostgreSQL backend 156/156 tests.

## 2026-10-17 duplicate formal-job association

Follow-up full frontend run passed 35 files/220 tests after the focused gate. Full backend passed 23 files/156 tests with `RUN_DATABASE_TESTS=1` on a separate migrated disposable PostgreSQL schema; that exact schema was cleaned after completion.

New route regression first reproduced HTTP 201 for a second store role mapped to an already used Evaluate formal job; after the guard, it returned 409. Focused route suite passed 60/60, Settings component suite 7/7, backend TypeScript no-emit, frontend ESLint and production TypeScript/Vite build passed. Disposable PostgreSQL/current-source Chromium confirmed the disabled Settings button, direct 409, zero browser Roster writes and unchanged role rows. This focused gate does not replace the preceding full 155/155 real-PostgreSQL backend and 219/219 frontend gates for earlier code.

## 2026-10-17 backend complete build gate

After full backend real-PostgreSQL 155/155 tests and TypeScript compilation, the full `npm run build` wrapper was rerun. Its first Prisma generate attempt failed with Windows `EPERM` because the confirmed normal 4020 `tsx` server held the DLL. Stopping only that Roster watcher/server allowed `clean -> prisma generate -> tsc` to pass. Normal backend was restarted from source; health 200 reported database/Evaluate true, and frontend 5176 stayed 200. Read-only Prisma migration status found 7 migrations applied. No normal database write or Evaluate code change.

## 2026-10-17 exact formal-position cue

Frontend focused ShiftDialog and verified-role matcher tests passed 2 files/24 tests; full frontend passed 35 files/219 tests, TypeScript/production Vite build and ESLint passed. Tests cover the exact Evaluate job ID mapping despite duplicate job names, a skill-qualified employee lacking the selected formal assignment, and a formally assigned employee. Disposable Chromium/PostgreSQL verified the two candidate cues and zero-write Cancel. No backend/Evaluate source or schema change.

## 2026-10-17 employee-row current-source browser regression

Fresh paired disposable PostgreSQL/current-source Chromium passed saved-card drag with zero Roster mutation requests or database/version change, saved-card click Edit, blank employee/date click Add with the correct preselected employee, and no-write Cancel. `qa-employee-row-click-only-browser.py` compiled and completed; exact QA services and schemas were removed. Product code and normal data were unchanged. Prior full frontend 218/218 and backend real-PostgreSQL 155/155 gates remain current for the preceding source edits.

## 2026-10-17 copied employee snapshot regression

Backend route tests 59/59 passed, asserting Copy Day/Week/Repeat receive current Evaluate score, Tier and round provenance. Focused real-PostgreSQL Copy Day/Week integration 12/12 passed; full backend suite on a fresh migrated disposable PostgreSQL schema passed 23 files/155 tests, then 155/155 again after the current-role-color correction. Frontend full suite passed 35 files/218 tests; ESLint, TypeScript and production Vite build passed. Backend TypeScript no-emit and emitted compilation plus Prisma validate passed after the final edit; the backend `npm run build` wrapper was not rerun because its Prisma generation would contend with the running normal Windows engine. Current-source paired disposable Chromium Copy Day saved 2 shifts, reloaded grouped Month UI and API confirmed current employee names with source/publication stability. Both disposable schemas and QA services were cleaned. No migration or Evaluate application edit.

## 2026-10-17 current two-evaluator Edit conflict

Fresh paired disposable PostgreSQL/current-source Chromium passed independent generated evaluator Edit 200/409, retained unsaved stale form text, disabled stale Save, authoritative reread of B's committed note, exactly one Shift version increment, unchanged UTC time/canonical assignment and older publication. QA-only Python script compiled; application code unchanged. The prior Resize browser case is superseded by the user's saved-card click-only interaction requirement.

## 2026-10-17 legacy repair/publish browser loop

Disposable current-source Chromium/PostgreSQL passed one legacy DRAFT Shift's warning, disabled Save, no-write Cancel, explicit formal-role save HTTP 200, version increment with exact time/employee preservation, reload, Publish HTTP 200 and new formal-name publication snapshot. The older published period and publication were unchanged. QA script compiled; no application or schema change in this checkpoint. Prior frontend full 218/218 and backend real-PostgreSQL 155/155 remain latest full test gates.

## 2026-10-17 legacy-role current-source browser gate

Paired disposable PostgreSQL/current-source Chromium passed two-Shift legacy Settings inventory, official catalog exclusion, Calendar navigation, disabled legacy Edit Save, and Publish HTTP 422 `UNVERIFIED_SHIFT_ROLE`. Direct authenticated API reads confirmed source Shifts, DRAFT version and older publication unchanged; browser issued zero Roster mutations. This is a browser/API regression of existing product behavior, with no product code or migration change. Prior frontend 218/218, backend isolated PostgreSQL 155/155 and builds remain the latest full test gates.

## 2026-10-17 Adelaide DST UI evidence

Disposable paired PostgreSQL/current-source Chromium passed spring invalid/valid clicks and drag, fall repeated 02:30 click and cross-offset drag in `Australia/Adelaide`; offset labels and actual durations matched expectations. Browser canceled all drafts and sent zero Roster mutation requests. This adds half-hour-offset browser coverage; it does not change the prior 218/218 frontend test or build result.

## 2026-10-17 fall-back browser regression

Disposable source-backed Chromium/PostgreSQL passed first-to-second 02:30 save/reload, exact Day/Week saved-card alignment and one-hour visual height, Week click-to-Edit occurrence rehydration, and Day/Week downward plus Week upward 02:00–03:30 drag prefill with 2 h 30 m elapsed. Canceled drags sent zero Roster writes. New Python QA script compiled and `git diff --check` found no whitespace errors. No product code change in this checkpoint; the prior frontend full 218/218 tests and build remain applicable.

## 2026-10-17 DST pointer mapping and save

Full frontend 35/35 files and 218/218 tests passed, including visible-slot pointer and fall-back click-end tests. TypeScript, focused ESLint and production build passed. Disposable Chromium/PostgreSQL red/green verified spring missing times rejected, valid clicked times matching labels, a 05:00–06:00 drag saved/reloaded at UTC 18:00–19:00Z with one canonical HandoverEmployee006 assignment, and fall-back 02:30 first-to-second saved/reloaded as one hour. Normal full-day and saved-card no-drag browser regressions passed. No backend/Evaluate source or migration change. Live BHS and real evaluator gates remain open.

## 2026-10-17 Week 500-person browser scale

Disposable paired PostgreSQL/current-source Chromium: 500 Evaluate employees, 5,000 Roster Shifts; Week response exact 5,000, first employee page 60 rows, employee 0499 searchable, 1,566 ms navigation-to-ready, 47 ms search, 26.4 MiB JS heap. QA test was updated to enable employee-row mode explicitly after an initial locator failure caused by the current default view. No product code changed in this scale run.

## 2026-10-17 DST grid safety verification (earlier guard superseded)

Disposable Chromium/PostgreSQL red/green reproduced Sydney spring-forward 02:30 displaying a wrong 01:30–03:00 draft and then verified the guarded Day grid (seven nearby clicks, drag, explanatory feedback, form alternative, zero writes). Normal-day full-grid click/outside-hours regression passed. Frontend 34/34 files, 214/214 tests; TypeScript no-emit, focused ESLint and production build passed. Backend/schema/Evaluate code was unchanged in this checkpoint; latest full backend isolated PostgreSQL result remains 23/23 files, 155/155 tests. Live BHS and real evaluator acceptance remain unverified.

## 2026-10-17 full-day grid and complete database gate

Backend initial Vitest without `RUN_DATABASE_TESTS=1` passed 119 and skipped 36 integration tests; it is not counted as the full gate. After enabling the flag on a freshly migrated disposable PostgreSQL schema, **23 files/155 tests passed**. Prisma schema validate, seven-migration status and backend TypeScript no-emit passed. Frontend full Vitest **34 files/213 tests**, ESLint and TypeScript/Vite production build passed after the full-day Day/Week change. Disposable Chromium passed full-day slot extent, store-hour click guard, cancellation, Week cross-day guard, Month/upward saved UTC/employee/one-row checks, PUBLISHED locks and saved-card click-only with zero drag writes. Python compiled the new/updated QA scripts. Exact schemas/services cleaned.

## 2026-10-17 live gesture and Month QA sweep

Four current-source Chromium scenarios passed against disposable real PostgreSQL: slight-move click/Escape/PointerCancel with zero Shift writes; upward drag-create saved 10:00–11:30 and exact UTC/employee/one-new-row direct API assertions; Week multi-day rejection plus valid same-day control; Month blank create saved 09:00–10:00 with exact UTC/employee/one-row assertions, edit/date navigation and PUBLISHED Month/Day/Week create locks. Published Calendar API data stayed unchanged. Python compiled all four QA scripts. No product source changed in this sweep, so the latest full frontend 213/213, ESLint/build and backend isolated PostgreSQL 155/155 remain the application gates. Exact temporary schemas/services cleaned.

## 2026-10-17 Calendar Refresh/template coherence

Red browser gate proved explicit Refresh did not refetch templates after independent loading. Green current-source Chromium/PostgreSQL observed the additional GET, retained Calendar content, zero Roster writes and unchanged database-backed Calendar response. Focused `calendarLoad.test.ts` 9/9, ESLint, Python QA compile and frontend TypeScript/Vite build passed. Prior full frontend 213/213 and backend isolated real-PostgreSQL 155/155 remain latest full gates.

## 2026-10-17 Calendar template isolation gate

Red regression confirmed a hung auxiliary template request prevented `loadCalendarSnapshot` from returning. After independent template fetch, full frontend Vitest passed 34 files/213 tests, ESLint and TypeScript/Vite production build passed. Fresh disposable Chromium/PostgreSQL passed pending-template, injected-503 and Retry checks with Calendar usable, zero Roster writes and unchanged calendar API data. Saved-card and blank-grid drag regression also passed. No backend application/schema/Evaluate change; latest full isolated real-PostgreSQL backend suite remains 155/155.

## 2026-10-17 Settings first-load isolation

Red component test showed a never-resolving draft-role inventory prevented the primary Settings from rendering. After splitting the read, frontend full Vitest passed 34 files/212 tests, ESLint passed and TypeScript/Vite production build passed. Fresh disposable PostgreSQL/Chromium passed held-inventory and injected-503 Retry cases with unsaved 07:30 retained, zero Roster writes and unchanged persisted Settings. No backend application/schema/Evaluate change; latest isolated real-PostgreSQL backend full suite remains 155/155.

## 2026-10-17 isolated Settings retry gate

Red component regression confirmed full-page inventory Retry discarded an unsaved opening-time edit. After isolating the retry, focused Settings tests and full frontend 34 files/211 tests passed, including a late old-store retry result. ESLint, TypeScript/production build, Python QA compile and diff check passed. Fresh disposable Chromium injected an inventory 503, retried successfully, retained unsaved 07:30, made zero Roster writes and left persisted Settings unchanged. Backend application unchanged; latest full isolated real-PostgreSQL backend suite remains 155/155.

## 2026-10-17 employee-row drag removal

Current frontend full suite passed 34 files/209 tests, ESLint, TypeScript and production build. Eleven active employee-row component cases cover click-only cards, blank-cell Add, Availability, former employee display, overnight/DST, stable rows and 100/300/500-person bounds. Eleven obsolete positive-drag component cases were removed because they asserted a behavior the user forbids. Fresh disposable Chromium/PostgreSQL passed saved Day/employee-row card drag with zero writes, blank Day/Week 14:00–15:30 creation, employee-row Cindy prefill, Cancel and unchanged Shift/period versions. Backend application unchanged; latest isolated full backend run remains 155/155.

## 2026-10-17 draft role inventory gate

Backend real-PostgreSQL full suite: 23 files/155 tests passed on an isolated schema; the new inventory test checked DRAFT-only counts, inactive legacy roles, store isolation and unchanged PUBLISHED records. Frontend full suite: 34 files/220 tests passed, including the Settings error isolation and review-panel links. ESLint, backend TypeScript, Prisma validate, frontend production build, Python QA compile and diff check passed. Paired disposable Chromium twice verified the Settings inventory, Calendar link, zero roster write requests and unchanged Shift/period/publication API data. No migration or normal data change.

## 2026-10-17 saved-card/blank-grid browser recheck

`python scripts/qa-saved-card-blank-drag-browser.py` passed against fresh paired disposable PostgreSQL schemas and current-source Chromium: Day saved card and employee-row saved card each had zero Shift mutation requests and remained click-to-edit; Day/Week blank drag selected 14:00–15:30; Cancel wrote nothing; Shift and period versions stayed unchanged after reload. The QA schemas and services were cleaned. Normal frontend returned HTTP 200 and Roster health reported database/Evaluate true. The latest full frontend/backend suites are recorded below; this recheck did not rerun them because product code was unchanged.

## 2026-10-17 dirty Copy/Repeat transition guard

Red component regression showed unsaved Edit notes were silently lost on Repeat. After the guard, focused Copy/Repeat tests passed, including a clean one-click Copy and explicit confirmations for dirty Copy and Repeat. Full frontend Vitest 33 files/216 tests and TypeScript/Vite build passed; Python QA compiled. Fresh paired disposable PostgreSQL/Chromium passed dirty Copy/Repeat, saved-value Copy, Cancel and zero roster writes with unchanged period/publication. Backend application unchanged; latest full backend real-PostgreSQL suite remains 153/153.

## 2026-10-17 Edit Cancel parity and regression

Red component test proved Edit Cancel invoked close immediately. After the guarded confirmation change, the focused test and full frontend Vitest 33 files/215 tests passed; focused coverage also kept Tab focus on the two confirmation actions. ESLint, Python QA compilation and TypeScript/Vite production build passed. Fresh disposable Chromium/PostgreSQL passed Edit Cancel/Continue/Escape/Discard, immediate Add Cancel, zero roster writes and unchanged snapshots. The prior concurrent deletion browser test passed with explicit discard confirmation. No backend application change; latest backend real-PostgreSQL suite remains 153/153.

## 2026-10-17 stale editor after external deletion

Fresh paired disposable PostgreSQL/Chromium passed `scripts/qa-deleted-shift-editor-browser.py`: Save 404 and Delete 404 after two separate external deletions; stale controls disabled, unsaved note retained until close, Calendar refreshed, no browser extra write, publication unchanged. Frontend Vitest 33 files/214 tests, ESLint, Python compile and TypeScript/Vite production build passed. Backend application unchanged; latest full real-PostgreSQL backend suite remains 153/153.

## 2026-10-17 grouped draft identity browser gate

Fresh paired disposable PostgreSQL/Chromium passed `scripts/qa-grouped-draft-name-browser.py`: current Evaluate name reached grouped DRAFT card/chooser/Edit, published card/detail retained the frozen old name, zero Roster writes, and unchanged draft/publication API records. Product code and schema were unchanged. Latest full frontend suite remains 214/214; latest full backend real-PostgreSQL suite remains 153/153.

## 2026-10-17 concurrent formal-role retirement

Red disposable Chromium/PostgreSQL reproduced batch HTTP 422 after Evaluate retired the selected job, followed by an incorrectly enabled stale action. After Calendar reload on 422, the fresh complete browser run passed: stale role disabled, previous 409 role/update and delete batches atomic, retry 200, historical publication unchanged. Frontend Vitest 33 files/214 tests and TypeScript/Vite build passed; Python QA compile passed. No backend application change.

## 2026-10-17 current-store batch role guard

Fresh paired disposable PostgreSQL/Chromium rerun passed `scripts/qa-legacy-role-batch-concurrency-browser.py`: after Evaluate retired the selected formal job, Calendar refresh disabled Batch Update; stale role update and stale delete each returned 409 with no partial mutation; role retry returned 200; published history was unchanged. Frontend Vitest 33 files/214 tests, ESLint, Python QA compile and TypeScript/Vite production build passed. Backend application and Evaluate were unchanged; the latest complete backend PostgreSQL gate remains 153/153.

## 2026-10-17 stale batch role and delete

`python scripts/qa-legacy-role-batch-concurrency-browser.py` passed against fresh paired disposable PostgreSQL schemas and Chromium: stale batch role update HTTP 409, zero partial writes, UI selection cleared and reloaded, retry HTTP 200, stale batch delete HTTP 409, zero partial deletes, published history unchanged. Frontend Vitest: 33 files/214 tests passed. ESLint, TypeScript/Vite production build, Python compile and `git diff --check` passed. Backend application and Evaluate were unchanged; latest full backend PostgreSQL suite remains 153/153 from the prior checkpoint.

## 2026-10-17 legacy-role repair gate

Red `ShiftDialog` test reproduced clickable Save on an unverified legacy role; after the UI gate, focused 19/19 passed and full frontend 33 files/214 tests passed. ESLint, TypeScript, production build, Python QA compile and scoped diff check passed. Fresh disposable PostgreSQL/Chromium verified warning/disabled Save, official role selection, Cancel zero writes, one successful versioned repair, unchanged time/assignment, new official-role publication snapshot and unchanged earlier publication. Backend application/tests were unchanged; latest full backend real-PostgreSQL gate remains 153/153. QA schemas/services cleaned.

## 2026-10-17 cross-view browser regression

Enhanced the existing browser QA script with page-error/API-5xx collection and Month DRAFT saved-card drag assertion. Two fresh disposable Chromium contexts backed by paired PostgreSQL schemas passed Month/Week/Day focus/reload, store scope, invalid URL normalization and unauthorized-store exclusion: 11 Calendar reads, zero roster writes, zero page errors, zero API 5xx. The Month saved card did not move or write. No application source or schema changed in this checkpoint; the prior frontend 213/213 and backend 153/153 complete suites remain the latest full gates. Temporary resources were cleaned.

## 2026-10-17 gesture and deep-link regression

Fresh current-source Chromium and paired disposable PostgreSQL passed `scripts/qa-saved-card-blank-drag-browser.py`: protected Day/date login context retained, saved card drag zero Shift writes and unchanged versions, saved card click opened Edit, Day/Week blank drag prefilled 14:00–15:30, Cancel zero persistence. Frontend full suite 33 files/213 tests, ESLint, TypeScript and production build passed; Python QA script compiled and scoped `git diff --check` passed. Backend code/tests and Evaluate were unchanged; latest full backend real-PostgreSQL gate remains 153/153. Temporary schemas/listeners were cleaned.

## 2026-10-17 Copy Week pending-submit guard

Changed `src/pages/CalendarPage.tsx` to disable preview-dialog Cancel/Escape while a Copy Week commit is in flight. Fresh disposable PostgreSQL/Chromium held the POST and verified the dialog stayed visible, one 201 returned and exactly one target Shift persisted after reload. Frontend full suite 33 files/213 tests, ESLint, TypeScript and production build passed. Python QA scripts compiled; scoped `git diff --check` passed. Backend application/tests and Evaluate were unchanged in this follow-up; the latest full backend gate remains 153/153.

## 2026-10-17 concurrent Copy preview browser regression

Fresh paired disposable PostgreSQL plus Chromium passed `scripts/qa-copy-preview-concurrency-browser.py`: stale Day 409/zero target, Day re-preview 201/two targets; stale Week 409/zero target, Week re-preview 201/one target after reload; original publication retained. QA schemas/services were cleaned. No application code, migration or Evaluate change in this checkpoint. The prior full backend 153/153 and frontend 213/213 gates remain the most recent full automated suites; they were not rerun for this browser-script-only addition.

## 2026-10-17 replay and target-conflict gate

Red service test: retiring the role after a saved client-ID create caused exact replay to fail before ledger lookup. Fixed replay order; focused route/service 61/61 passed, including store authorization before replay and bypass of current Evaluate fetch only for an owned exact request. Full backend 22 files/153 tests passed on disposable PostgreSQL with 30-second test timeout. Frontend `ShiftDialog` refresh regression passed; full 33 files/213 tests, ESLint and production build passed. Backend TypeScript/Prisma production build passed after stopping and restarting the known 4020 Prisma DLL holder. Paired Chromium verified conflict-disabled Save, stable retry, retired-Evaluate-job replay and committed malformed-201 recovery. Normal 4020/5176 health/current source verified; QA schemas/listeners cleaned. No additional migration or Evaluate app/database change.

## 2026-10-17 durable create request gate

Prisma validate, backend build and additive migration deployment passed. On disposable real PostgreSQL, focused atomic-create 3/3 covers concurrent same-ID calls, exact replay, changed content/account rejection and deleted-Shift replay rejection. Full backend 22 files/152 tests passed with `--testTimeout 30000`. An earlier full run simultaneous with frontend tests/lint/build had seven default 5-second timeouts, no assertion failures; its result is not treated as a pass. Frontend 33 files/212 tests, ESLint and TypeScript/Vite production build passed. Disposable Chromium covered committed malformed 201, other-actor identical content plus uncommitted 500, stable-ID retry and duplicate API replay. Local public-schema migration status is current; paired QA schemas were cleaned. Evaluate app/database unchanged.

## 2026-10-17 uncertain Shift Save attribution gate (superseded preflight design)

A red `mutationReconciliation` test reproduced the preexisting identical-Shift false match; the fixed helper passed 3/3. Complete frontend passed 33 files/212 tests, ESLint and TypeScript/Vite build. Guarded paired PostgreSQL/Chromium verified other-actor identical Shift plus uncommitted 500 keeps Copy open and refreshes conflict, preflight GET failure sends zero POSTs, and a genuinely committed 201 with broken JSON still recovers. Backend application unchanged; prior complete real-PostgreSQL gate remains 151/151. No migration or Evaluate application change. The preflight-to-write concurrent attribution race remains without a durable operation ID.

## 2026-10-17 published Copy target-navigation gate

Frontend 33 files/211 tests, ESLint and TypeScript/Vite production build passed. Ordinary Copy and committed-201/unreadable-JSON Chromium scripts both passed against guarded paired PostgreSQL, including target URL/card, ordinary reload, single POST for uncertain recovery, unchanged source/publication and exact cleanup. Backend application was unchanged; its prior full real-PostgreSQL gate remains 151/151. No migration or Evaluate application change.

## 2026-10-17 published source Copy Shift gate

Frontend 33 files/211 tests, ESLint and TypeScript/Vite production build passed. A fresh guarded paired-PostgreSQL Chromium run verified PUBLISHED source Copy cancel causes no write, Save creates one new DRAFT target after current formal-role and Availability checks, DRAFT source Copy defaults to the next day, and the PUBLISHED source/API publication list remain unchanged. Exact QA listeners and schemas were cleaned. Backend application was unchanged; prior complete backend real-PostgreSQL gate remains 151/151. No migration or Evaluate application edit.

## 2026-10-17 batch publication boundary gate

Frontend 33 files/211 tests, ESLint and TypeScript/Vite production build passed. A red-green current-source Chromium run against disposable paired PostgreSQL proved Batch mode now rejects PUBLISHED card selection, permits two DRAFT Shifts in a grouped card and prunes those IDs on a view change, with zero Shift writes and unchanged Calendar API rows. Temporary listeners and schemas were cleaned. Backend application was unchanged; its prior real-PostgreSQL gate remains 151/151. No migration or Evaluate application change.

## 2026-10-17 retired published role warning gate

Frontend 33 files/211 tests, ESLint and TypeScript/Vite production build passed. Fresh guarded paired-PostgreSQL Chromium confirmed a PUBLISHED Shift with no current Evaluate job retained its saved role label in Month/Week/Day, without a draft-only `待核对` warning, and opened read-only detail with zero writes. Shift API data matched before/after. Temporary services and schemas were cleaned. No migration or backend/Evaluate application edit.

## 2026-10-17 published role display gate

Focused `calendarGrouping` tests: 17/17 passed, including a new DRAFT/current versus PUBLISHED/snapshot name-and-color regression. Complete frontend: 33 files/211 tests passed; ESLint and TypeScript/Vite production build passed. Disposable Chromium/API confirmed current formal role name on DRAFT and stored role name on PUBLISHED Day card, detail and Week employee row, with zero writes and unchanged Shift API records. Both QA schemas/listeners were cleaned. No migration or Evaluate/backend application change; the prior backend real-PostgreSQL gate remains 151/151.

## 2026-10-16 published Shift detail gate

Frontend 33 files/210 tests, ESLint and TypeScript/Vite production build passed. Guarded current-source Chromium clicked the same PUBLISHED Shift in Month, Week and Day and verified read-only details, zero Shift writes and unchanged API record. The paired temporary database schemas and listeners were cleaned. Backend application and Evaluate application were unchanged in this checkpoint; the latest backend disposable-PostgreSQL gate remains 151/151. No migration.

## 2026-10-16 saved-card gesture gate

Frontend 33 files/210 tests passed; TypeScript/Vite production build and ESLint passed. Disposable current-source Chromium verified no Shift mutation or database change from dragging an existing card, click-to-edit after that drag, and blank-grid 14:00–15:30 time selection into an unsaved Add dialog. Both temporary database schemas and QA listeners were cleaned. Backend application code was unchanged in this checkpoint; its prior complete disposable-PostgreSQL gate remains 151/151. No migration or Evaluate application change.

## 2026-10-16 legacy-role mutation gate

Focused backend route/service tests: 94/94 passed. Complete backend suite: 22 files/151 tests passed with `RUN_DATABASE_TESTS=1` against a fresh migrated disposable PostgreSQL schema; the exact schema was cleaned. Backend TypeScript and production build with Prisma generation passed. Isolated current-source API/Chromium results are in `ROSTER_BROWSER_QA.md`. No migration or Evaluate application edit. Normal 4020 was restarted and 5176 remained available.

## 2026-10-16 backend formal-role alias gate

Backend route tests: 56/56 passed. Complete backend suite: 22 files/148 tests passed with `RUN_DATABASE_TESTS=1` against a freshly migrated, guarded local PostgreSQL schema; the schema was removed. Backend TypeScript and production build with Prisma generation passed after stopping only the known live 4020 backend process tree. Normal backend was restarted through `scripts/start-dev.ps1` and reported healthy database/Evaluate dependencies. Frontend application code was not changed in this checkpoint; its prior full gate remains 33 files/210 tests, lint and production build. Browser/API evidence is in `ROSTER_BROWSER_QA.md`. No migration or Evaluate application code change.

## 2026-10-16 Staff/Templates formal-job gate

Full frontend suite: 33 files/210 tests passed, including Staff role filtering, legacy template repair, Calendar exclusion of unusable templates and saved legacy card labelling. TypeScript, ESLint and Vite production build passed. Paired disposable PostgreSQL/Chromium browser evidence is recorded in `ROSTER_BROWSER_QA.md`. Temporary schemas and listeners were cleaned; normal 5176 HTTP 200 and 4020 health (`database=true`, `evaluateMolly=true`) passed. No backend application, migration or Evaluate application change in this checkpoint.

## 2026-10-16 frontend formal-job match priority

The duplicate-name/code-priority regression passed. Full frontend gate: 33 files/205 tests, TypeScript, ESLint and Vite production build passed. The normal frontend returned HTTP 200; backend health had database and Evaluate both true. No backend code, migration or Evaluate code changed in this checkpoint. BHS screen capture failed, so no direct reference-system comparison was recorded.

## 2026-10-16 publication formal-job gate

Backend full 22 files/146 tests passed on a fresh disposable real PostgreSQL schema; TypeScript and production build passed. The publication-history integration test now freezes two distinct verified formal job names on successive publications and confirms the live Shift snapshot and first publication remain unchanged. Current-source paired disposable Chromium clicked Publish, got HTTP 200, and manager publication detail contained two `Official QA Front` role snapshots while source Shifts still held `QA Front`. Frontend's latest applicable full gate is 33 files/204 tests, ESLint and production build from the preceding Calendar display change. All temporary schemas/services were cleaned and the normal backend restarted. Direct BHS and target real-account gates remain unverified.

## 2026-10-16 current formal-job snapshot gate

Frontend full 33 files/204 tests, ESLint and TypeScript/Vite production build passed. Backend full 22 files/146 tests against a fresh disposable real PostgreSQL schema, TypeScript and production build passed; its test schema was cleaned. The copy integration tests now assert Copy Day, Copy Week and Repeat use the current formal name in the target Shift snapshot while preserving source snapshots. The batch-role integration test asserts the formal name is persisted. Isolated current-source Chromium plus direct Roster API confirmed a two-Shift Copy Day stored `Official QA Front` on 10 October, left 9 October source snapshots `QA Front`, and rendered the current formal name in Day View. Paired disposable Evaluate/Roster schemas and temporary services were cleaned. No migration or Evaluate application change. Direct BHS and target real-account acceptance remain open.

## 2026-10-16 latest gate after corrected drag and formal-job validation

Frontend: 33 files / 203 tests passed; ESLint and TypeScript/Vite production build passed. Backend: 22 files / 146 tests passed with `RUN_DATABASE_TESTS=1` against a fresh disposable real PostgreSQL schema; backend TypeScript and production build including Prisma Client generation passed. The test schema was cleaned. No migration was introduced. Browser scripts `scripts/qa-bhs-drag-semantics-browser.py` and `scripts/qa-formal-jobs-browser.py` passed on paired disposable Evaluate/Roster PostgreSQL schemas: saved-card drag made zero Shift requests, opened no dialog and made no database change; blank drag opened a 14:00–15:30 Add draft; an active legacy `验收岗` database role was absent from Settings while Evaluate's `qa-front` was shown. Direct API rejected fake role creation, legacy Shift creation and legacy role update with 422; formal Shift creation persisted its role snapshot. Real PostgreSQL tests confirmed Copy Day/Week/Repeat preview and commits reject unverified roles without target writes. The isolated paired schemas were cleaned. Normal 5176 returned 200 and 4020 health returned `database=true,evaluateMolly=true` after restart. Direct BHS and real account acceptance remain unverified.

## 2026-10-16 corrected interaction and job catalog checkpoint

Focused frontend `verifiedShiftRoles`/Calendar load: 8/8 passed. Focused Settings/EmployeeLaneBoard: 23/23 passed after the tests were aligned with click-only default behavior; historical opt-in board drag tests remain as component coverage. Focused backend Evaluate client/routes: 59/59 passed. Frontend and backend TypeScript passed. Frontend ESLint passed with one existing Calendar hook dependency warning. Disposable Chromium/real PostgreSQL verified saved-block drag produces no write and blank-grid selection opens Add (details in `ROSTER_BROWSER_QA.md`). The backend production build command could not regenerate Prisma while a live Windows backend held `query_engine-windows.dll.node` (`EPERM`); plain backend `tsc` passed. Full suite, lint after latest edits, production builds and cleanup remain to run.

## 2026-10-16 legacy publication timezone hardening

Frontend: 32 files / 199 tests passed, ESLint passed, TypeScript and production build passed. Backend: 22 files / 139 tests passed with `RUN_DATABASE_TESTS=1` against a disposable PostgreSQL schema; `tsc --noEmit` and production build with Prisma generation passed. `backend/tests/rosterRoutes.test.ts` covers frozen and legacy timezone exports; `src/pages/ExportPage.test.tsx` covers legacy dialog warning/UTC. Chromium browser and direct PostgreSQL evidence are recorded in `docs/ROSTER_BROWSER_QA.md`. One initial full frontend run failed because a new async test's default one-second element wait expired under parallel load; the wait was set to 10 seconds and the full suite passed. No unexplained remaining regression.

## 2026-10-16 cross-month overnight browser acceptance

Fresh disposable Evaluate/Roster PostgreSQL and Chromium verified the same night-store Shift across Day (one continuation), Week (two dated segments), Month (one card), edit opening and reload. Direct DB read confirmed exact UTC endpoints and no write or publication. The initial default-hours fixture failed visually and was corrected in the isolated data; application code and automated test counts are unchanged. QA resources were cleaned. Latest full gates remain frontend 198/198 with lint/build and backend 138/138 real-PostgreSQL with build from the previous checkpoints.

## 2026-10-16 uncertain publication state

Frontend 32/32 files and 198/198 tests, ESLint and production build passed after scoped period-status reconciliation. Fresh disposable Chromium hid committed HTTP 200 responses for Reopen and Publish; the browser made two scoped period reads, showed the correct current state after each, and retained PUBLISHED after reload. Direct PostgreSQL found one Shift and publication revisions 1 and 3, with period version 3. Temporary QA services and schemas were cleaned. Backend application code was unchanged; the latest backend real-PostgreSQL 138/138 and production build remain the prior checkpoint.

## 2026-10-16 uncertain Delete reconciliation

Added store-scoped Shift lookup route/service tests and a stale-dialog Delete regression. Focused backend routes/service tests passed 82/82 before the full run. Full frontend 32/32 files, 198/198 tests, ESLint and production build passed. Full backend 22/22 files, 138/138 tests on fresh migrated disposable PostgreSQL passed; backend TypeScript and production build passed after releasing the known Windows Prisma DLL lock. Chromium and direct PostgreSQL verified both committed-delete response loss and concurrent-move response loss. Exact test and browser schemas were cleaned; normal services were restarted and healthy. No migration or Evaluate application change.

## 2026-10-16 store-scope write authorization

Added `rosterRoutes.test.ts` coverage for cross-store Publish, Reopen, single Shift Delete and Batch Delete: each returned 403 before Evaluate integration or Roster service dispatch. Focused routes passed 47/47; backend TypeScript and diff check passed. The complete backend suite passed 22/22 files and 136/136 tests with `RUN_DATABASE_TESTS=1` on a freshly migrated guarded local PostgreSQL schema. Exact schema cleanup succeeded. Normal 5176 returned HTTP 200; 4020 health reported both database and Evaluate true. No browser scenario was repeated for this route-only regression.

## 2026-10-16 backend PostgreSQL and migration gate

`backend/scripts/disposable-database-test.ts prepare` created an empty local schema and deployed six migrations. With `RUN_DATABASE_TESTS=1`, `npm test -- --maxWorkers=1 --testTimeout=20000` passed 22/22 files and 135/135 tests against real PostgreSQL. `npm run prisma:validate` passed; migration status showed six applied in the disposable schema and, read-only, in normal `public`. The exact disposable schema was then cleaned. Backend production build was not rerun in this checkpoint; application backend code did not change.

## 2026-10-16 Repeat preview rejection and Publish transfer

Frontend 32/32 files and 197/197 tests, including a Repeat dialog failed-commit regression; ESLint; TypeScript/Vite production build; backend TypeScript no-emit; diff check passed. Chromium verified Repeat preview invalidation after 422 `ARCHIVED_EMPLOYEE` and Publish rejection with DRAFT retention. Guarded PostgreSQL verified no target Shift, period or publication mutation. No migration or Evaluate app change.

## 2026-10-16 rejected Copy Day/Week preview invalidation

Frontend 32/32 files and 196/196 tests; ESLint; TypeScript/Vite production build; backend TypeScript no-emit; diff check passed. Two-tab Chromium verified copyable previews followed by 422 `ARCHIVED_EMPLOYEE` on both commits, stale-preview invalidation and fresh blocked previews. Guarded PostgreSQL found no target Shift or period and unchanged published history. No migration or Evaluate application change.

## 2026-10-16 stale-workforce drag recovery

Frontend 32/32 files, 196/196 tests; ESLint; TypeScript/Vite production build; backend TypeScript no-emit; diff check passed. Fresh Chromium verified rejected Week-row and Day TimeGrid drags after Evaluate transfer, UI rollback, workforce refresh and former-row feedback. Guarded PostgreSQL verified no Shift, period or publication mutation. No migration or Evaluate app change.

## 2026-10-16 mid-dialog employee transfer recovery

Frontend 32/32 files and 196/196 tests, ESLint, TypeScript/Vite production build, backend TypeScript no-emit and `git diff --check` passed. Fresh Chromium verified PATCH 400 then PATCH 200 while retaining unsaved note; guarded PostgreSQL verified single versioned assignment repair and unchanged published history. No migration or backend/Evaluate application change.

## 2026-10-16 former employee assignment repair

Frontend 32/32 files and 196/196 tests; ESLint; TypeScript and Vite production build; backend TypeScript no-emit passed. Component regression covers blocked stale Save and replacement. Chromium and guarded direct PostgreSQL verified one versioned edit with no duplicate Shift or publication mutation. No migration or backend application change.

## 2026-10-16 formal-position employee filter

New unit and component regressions verify Evaluate formal position IDs are independent of Shift Role skill codes and that the picker renders only the selected formal-position holders. Full frontend: 32/32 files, 195/195 tests; ESLint and TypeScript/Vite production build passed. Backend TypeScript no-emit and diff check passed. Fresh disposable Chromium saved through the filter, and separate direct Evaluate/Roster PostgreSQL verifiers confirmed ownership, canonical ID, version and immutable publication. No migration, Evaluate application or Roster backend application change; latest unchanged backend real-PostgreSQL suite remains 135/135.

## 2026-10-16 fall-back click-create acceptance

Fresh generated-ADMIN Chromium passed `qa-fallback-click-create-browser.py` including prefill, one Save and reload. Guarded real PostgreSQL passed `verify-fallback-selection-cancel.ts --clicked` with exact UTC and unchanged publication. No application source or migration changed since the 193/193 frontend tests, ESLint, TypeScript/Vite production build and latest 135/135 isolated backend real-PostgreSQL gate. Backend TypeScript no-emit and diff check passed after extending the verifier.

## 2026-10-15 fall-back selection feedback

2026-10-16 saved-action follow-up: fresh generated-ADMIN Chromium passed `qa-fallback-drag-selection-browser.py --save-second`; guarded real PostgreSQL passed `verify-fallback-selection-cancel.ts --saved` with exact UTC and one new Shift, no duplicate, unchanged published history. Only QA script branches changed after the 193/193 frontend, lint, build and backend TypeScript gates; no application code changed in this follow-up.

New regressions cover offset-aware CreateSelection mirror, Shift dialog elapsed-duration warning and exact hour/minute formatting. Full frontend: 32/32 files and 193/193 tests, ESLint and TypeScript/Vite production build passed; backend TypeScript no-emit passed. In a current-source disposable browser, a visually one-hour 02:00–03:00 drag displayed actual two hours and both UTC offsets, then changed to one hour after selecting the second 02:00. Guarded PostgreSQL confirmed Cancel left Shift and publication counts/versions unchanged. No backend application/schema/migration/Evaluate change.

## 2026-10-15 cross-date DST move

Two `calendarMoveInstants` regressions check fall-back and spring-forward elapsed duration. Full frontend: 32/32 files and 190/190 tests, ESLint and TypeScript/Vite production build passed; backend TypeScript no-emit passed. Current-source Chromium reproduced the old zero-write rejection then completed one saved Week-column move; guarded PostgreSQL verified exact UTC, versions, assignment, count and immutable publication. No backend application/schema/migration/Evaluate change; the latest unchanged backend real-PostgreSQL suite remains 135/135.

## 2026-10-15 repeated-hour Shift card label

New `dateTime` regressions cover a Sydney first-to-second 02:30 range, an overnight end date and a normal same-day range. Focused test files: 3/3 and 16/16 tests. Full frontend: 32/32 files and 188/188 tests, ESLint and TypeScript/Vite production build passed. `git -c core.safecrlf=false diff --check` passed after trimming an extra blank line. The current-source disposable Chromium card rendered `02:30 UTC+11–02:30 UTC+10`; no backend application, schema, migration or Evaluate change followed the prior isolated real-PostgreSQL backend 135/135 gate.

## 2026-10-13 store/range isolation

One new regression verifies that a Calendar response is displayed only for its own store and complete visible range; foreign-store and partial-range responses return no current data. Final frontend suite passed 25 files/134 tests; TypeScript/Vite production build, ESLint and `git diff --check` passed. A generated-ADMIN Chrome pass reproduced the prior stale cross-store display under a failed target API, then verified immediate hiding, preserved week position, healthy two-store round trip and no old summary after date navigation. No Roster/Evaluate database mutation was performed in this UI pass. The backend code was unchanged, so the prior database-enabled 106-test gate remains latest. QA schemas/account/services were cleaned and normal health returned true.

## 2026-10-13 atomic Calendar refresh

Four new loader tests verify that a complete snapshot waits for the summary, summary failure rejects without returning a partial snapshot, and old date-range requests are discarded before or during summary retrieval. Final frontend suite passed 25 files/133 tests; TypeScript/Vite build, ESLint and diff check passed. In a 500-employee real-browser fixture, a saved deletion settled with matching 4,999 board/summary counts and version 2, and survived reload; guarded PostgreSQL verification agreed. The browser did not simulate summary failure, so that branch has automated test evidence only. Backend source was unchanged since its prior 106-test database-enabled gate. Both disposable schemas/account and temporary services were cleaned; normal dependency health remained true.

## 2026-10-13 Calendar full-period reuse

Added two coverage tests for a complete period with prior-period carryover and a partial Day response. Final frontend suite: 24 Vitest files/129 tests passed; TypeScript/Vite build, ESLint and `git diff --check` passed. Real Chrome observed one populated-Week Calendar GET, versus two Calendar GETs for Day's partial-range plus full-period warning data. `OPTIONS` preflights were excluded from GET counts. Backend source was unchanged, so the prior database-enabled 106-test result remains the latest backend gate. Disposable QA schemas/account and services were removed; normal Roster dependencies remained healthy.

## 2026-10-13 final-source follow-up

Frontend: 24 Vitest files/127 tests passed; TypeScript and Vite production build passed; ESLint and `git diff --check` passed. The backend source was unchanged since its preceding 17-file/106-test database-enabled pass, so that suite was not repeated. The final source has no temporary React Profiler. A guarded PostgreSQL assertion for the successful HandoverEmployee006-to-Cindy transfer passed before fixture cleanup: DRAFT version 3, 4,999 shifts, 4,999 assignments and one Cindy assignment on the original Shift ID. The two exact disposable schemas and generated login were removed. Normal Roster health reported database and Evaluate available; frontend returned HTTP 200.

Current dirty working tree baseline: frontend ESLint passed; frontend Vitest 22 files / 113 tests passed; backend `RUN_DATABASE_TESTS=1` Vitest 15 files / 99 tests passed against local PostgreSQL; Prisma schema valid and four migrations current. Roster health showed both database and Evaluate available; frontend returned HTTP 200.

After the empty-cell click fix: frontend ESLint, 113/113 Vitest tests and production TypeScript/Vite build passed. Backend TypeScript `--noEmit` passed. The change is frontend-only and was directly checked in Chrome for Day, Week, Month and drag selection.

The normal 4020 backend was later stopped by its verified PID, built successfully with Prisma Client generation and TypeScript emit, and restarted through `scripts/start-dev.ps1` from current `src/server.ts`. Health reported both dependencies true and `Cache-Control: no-store, private`; the pre-rebuild dist was backed up under `.deployment-local/runtime-backups/`. Target CI, HTTPS and a real store evaluator session are outstanding.

An isolated follow-up ran current Roster source on temporary 4035/5177 with a clean Evaluate candidate on 4010. The generated `STORE_EVALUATOR` browser acceptance covered create, edit, move, both resizes, invalid drag rollback, employee transfer, Copy Shift/Day/Week, publish/reopen/republish and stale two-tab save. Database reads confirmed exact UTC times, assignment IDs, versions and immutable publication digests. The fixtures and temporary services were cleaned. This is local candidate evidence, not a target deployment or real account acceptance.

Performance follow-up: `scripts/benchmark-calendar.ts` ran deterministic 50/100/500 employee five-day fixtures with 500/1,000/5,000 unique shifts. At 500 employees the grouping median fell from 168.02 to 136.40 ms after caching sort timestamps; overlap layout measured 68.01 to 72.76 ms across runs. Focused Calendar grouping/overlap tests passed 20/20. These are local Node CPU timings, not browser frame-time results.

Real Chrome scale check used separate disposable Evaluate and Roster PostgreSQL schemas and current frontend/backend source on 5177/4035, with Evaluate on 4010. The week view rendered 501 cards at 50 employees, 1,001 at 100, and 5,001 at 500 (one pre-existing fixture card at each scale). At 100, the page reached 1,001 cards and `aria-busy=false` about 3.1 seconds after reload. At 500, the same check took 23.9 seconds; during that interval two browser DOM queries exceeded their 3-second CDP deadline. Once settled, the page showed all 5,001 cards and no horizontal document overflow at a 2,110-pixel viewport. This is a reproducible large-week rendering bottleneck, so 500-person weekly use is not yet accepted. The measurements include local API, React and FullCalendar work; no frame-rate claim or browser heap-leak claim is made. Temporary services, schemas and generated credentials were removed; normal 4000/4020/5176 remained listening.

Capacity fix and second isolated Chrome pass: `CalendarPage` now pages rendered employees at 25/100/10 for Month/Week/Day when the workforce exceeds that view's threshold. The 500-person Week loaded 1,000 cards on its first employee page and reached `aria-busy=false` in 5.835 seconds on one timed reload, versus 23.902 seconds for the unbounded 5,001-card week. Next page showed employees 101–200 with 1,000 cards. Searching `Benchmark 0499` showed 10 week cards; opening one reached the correct edit dialog. Day switched to 10 employees/20 cards and searching employee 0499 showed two cards. Month switched to 25 employees/250 cards and showed the visible-range notice. The original unbounded Day/Month switches caused browser-control timeouts during this check; limiting those views and updating React state before FullCalendar view changes resolved the repeat browser check. No shift mutation was made in this capacity pass. Frontend 23 files/115 tests, lint and production build passed. The current Month/Day/Week design remains an employee-filtered view at large scale; no drag frame-rate or full-scale multi-user acceptance claim is made. Both isolated schemas, generated account and 4010/4035/5177 services were cleaned.

Visual capacity follow-up supersedes the 100-employee dense-week default above. A real Chrome screenshot showed that 50 employees/501 Week cards became unreadable narrow lines despite acceptable loading. After measuring peak simultaneous shifts, dense Week/Day time grids now show one employee while Week automatically opens the readable employee-row board. In a new 500-employee isolated fixture, one reload settled with 60 initial board rows, 10 time-grid cards and `aria-busy=false` in 1.737 seconds. Searching employee 0499 in the board, clicking its name and opening a shift edit all worked. From that exact employee view, empty-cell click opened 13:00–13:30 with employee 0499 selected; drag-create opened 13:00–14:30 with the same selection. Both dialogs were canceled. A direct isolated PostgreSQL read found 5,002 draft shifts and one published shift, matching the fixture baseline. App-origin console errors/warnings were zero. Frontend 23 files/118 tests, lint, production build and `git diff --check` passed. The isolated schemas/accounts/services were removed. These synthetic shifts intentionally overlap within employees, so the dataset is a rendering stress fixture, not valid scheduling acceptance; drag frame timing, real large-store workloads and target deployment still require separate evidence.

Publication integrity follow-up: unit tests cover missing Availability, overlapping legacy assignments, and cross-store conflict. A new PostgreSQL integration test directly removed Availability and inserted overlapping same-store and cross-store shifts after creation; all publish attempts failed before status/version/publication writes, and publication succeeded after repair. Final backend database-enabled suite passed 16 files/103 tests in a migrated disposable schema; backend `tsc --noEmit` and `git diff --check` passed. A separate guarded valid-data service benchmark wrote 500 employees' 5,000 non-overlapping shifts plus 2,500 covering Availability windows; with final employee locks and cross-store recheck, Roster publication took 1,283 ms and contained all 5,000 shifts. The benchmark did not populate Evaluate and is not a full-stack performance result. The separate browser publication rejection is recorded in `ROSTER_BROWSER_QA.md`. No migration was added.

Valid large-store full-stack follow-up: a separate fixture seeded 500 canonical Evaluate employee IDs plus 5,000 conflict-free Roster shifts and 2,500 covering Availability windows. Chrome showed the 500-person DRAFT week, searched employee 0499, saved one 10:00–13:00 edit and retained it after reload. Direct PostgreSQL read confirmed UTC timestamps, canonical ID, version 3 and 5,000 shifts. Native time input events were then handled explicitly; a browser fill updated preview and saved, with a new DOM regression. Frontend final gate: 23 files/119 tests, ESLint, TypeScript and production build passed. The prior backend 16 files/103 database tests remained green after the frontend-only change. The fixture and services were cleaned; no drag FPS or deployed acceptance claim is made.

Employee-row pointer follow-up: the bounded board moved from native HTML drag events to Pointer Events after the isolated Chrome gesture failed to activate its native drop path. The updated component handles a six-pixel threshold, capture, destination hit test, Escape/pointer-cancel, and click suppression. Focused board tests passed 6/6, including small movement versus click, cancellation, published-shift refusal and 100/300/500-person row bounds. In Chrome with 500 valid Evaluate employees and 5,000 non-overlapping Roster shifts, an occupied cross-row drop returned an overlap error without changing the draft; after deleting the conflicting target shift, the same Shift ID moved to the other employee and back, with reload and direct PostgreSQL checks of ID, UTC time, assignment and versions. Frontend final gate: 23 files/120 tests, lint, TypeScript and production build passed; `git diff --check` passed. This is end-to-end interaction evidence, not measured drag frame rate. Isolated schemas and services were removed.

Former-employee follow-up: focused EmployeeLaneBoard tests now pass 8/8, covering a visible repair row for a missing draft assignee, disabled drop targeting for that row, outward drag to an active employee, and historical labeling for a published-only row. Full frontend gate passed 23 files/122 tests, ESLint, TypeScript, production build and diff check. In isolated Chrome, the transferred employee's draft was visible on the board, pointer transfer to an active available employee persisted after reload, and direct PostgreSQL reads confirmed the immutable published snapshot still contained the original canonical ID. This frontend-only change added no migration or Evaluate application change; the two fixture schemas and temporary services were removed.

Employee-row destination feedback follow-up: a pointer regression checks the red overlap target and accessible reason. Focused EmployeeLaneBoard suite passed 9/9; full frontend Vitest passed 23 files/123 tests. TypeScript `--noEmit`, ESLint, Vite production build and `git diff --check` passed. The latest edit changed only frontend code; backend database suite was not repeated after this edit (the preceding isolated PostgreSQL suite passed 103/103). Live-browser invalid drop and rollback were verified in the prior 500-person run; this new hover color has component evidence only.

Overnight boundary follow-up: a new PostgreSQL assertion first failed because a 23:00–02:00 shift starting before the requested day was absent. After the read-path fix, the cross-day integration test passed for both next-day and next-week queries, and the backend database-enabled suite passed 16 files/103 tests. Frontend passed 24 files/125 tests, ESLint, TypeScript and production build. Backend TypeScript emitted successfully into an isolated local build directory; Prisma validate and migration status showed the existing four migrations current. An isolated real-browser pass verified Week/Day continuation display, employee-row chip, original draft dialog and current published summary; direct DB read showed no mutation. The browser fixture inserted an overnight record directly for rendering, so browser create validation for that fixture was not claimed. Temporary services and schemas were removed.

Copy Week capacity follow-up: a 500-employee/5,000-shift disposable PostgreSQL fixture showed a successful preview at 37,668 ms before optimization. Bulk target reads reduced a single run to 11,295 ms; cached local-time conversion reduced a single run to 266 ms, all with 5,000 ready shifts and zero issues. Initial execution rolled back at Prisma's 5-second interactive transaction timeout (`P2028`) with no target period. Batch insertion inside one bounded transaction then copied all 5,000 shifts/assignments in 1,761 ms; direct counts confirmed source and target totals and one unchanged source publication. A new PostgreSQL regression checks unassigned-source rejection; another verifies copied role, break, notes, employee/score snapshots and Sydney DST wall-clock time. Final backend database-enabled suite: 17 files/105 tests; TypeScript no-emit and isolated production emit passed. Isolated browser checked small Copy Week preview, Cancel with zero writes, Save, reload, UTC times and source publication integrity. All fixture schemas and temporary services were removed. Timings are individual local service/database samples, not full-stack browser percentiles.

Copy Day capacity follow-up: 1,000 source-day shifts across 500 employees previewed in 4,879 ms before optimization and execution rolled back with `P2028` after 5,037 ms. Bulk Availability/conflict reads plus cached wall-clock conversion gave one 99 ms preview; atomic 500-row writes saved all 1,000 shifts/assignments in 753 ms. Repeat Shift over 42 targets previewed/saved in 496/705 ms without a service change. Isolated browser found and fixed a native date-input state mismatch in Copy Day; subsequent preview 2/2, Save, reload and PostgreSQL identity/time checks passed. Backend database-enabled suite: 17 files/105 tests; backend TypeScript emit, root ESLint, frontend 24 files/125 tests, production build and diff check passed. Both schemas and temporary services were cleaned. All timings are individual local samples.

The adjacent Repeat Shift date field had the same `change`-only event pattern, so it now also responds to `input`. A focused DOM event regression passed 2/2 and the subsequent full frontend suite passed 24 files/126 tests, ESLint and production build. The earlier browser Copy Day check remains the only live browser date-input exercise in this follow-up; Repeat Shift's date-input fix has component test evidence.

The Staff Availability period date also now responds to native `input`, with its workforce-refresh test exercising that event. A new PostgreSQL Copy Day regression saves 501 distinct employee assignments across the 500-row batch boundary and verifies each target ID is represented once. Focused Copy Day integration passed 5/5; full database-enabled backend suite passed 17 files/106 tests and backend TypeScript no-emit passed. Staff and Repeat native-date changes have component evidence; the Copy Day native-date change has real-browser evidence.

Dense board render follow-up: a fresh isolated 500-employee/5,000-shift/2,500-Availability browser fixture reproduced 147–163 ms React commits during invalid cross-row target changes with 600 visible cards. Memoized employee rows and visible-only time formatting reduced one repeat gesture's active commits to 4.8–6.9 ms; post-drop refresh remained 70–110 ms. These are individual Profiler samples, not FPS percentiles. A five-interval frame probe was too short and a longer browser gesture timed out, so sustained pacing remains unverified. The final source passed focused EmployeeLaneBoard 10/10, full frontend 24 files/126 tests, TypeScript, ESLint, production build and diff check. Browser invalid drop left DRAFT version 1; direct PostgreSQL verification found all 5,000 shifts/assignments and the original HandoverEmployee006 assignment. Temporary probes and fixture environments were removed.

Post-drop follow-up: failed employee-row movement was confirmed to skip a data reload; the remaining board cost came from transient `saving` and callback identity changes. Stable ref-backed handlers and board-level `inert`/`aria-busy` removed those row updates while still blocking interactions. A new component regression verifies saving-state lock and latest callback use. A fresh 600-card isolated Chrome gesture measured 3.8–7.2 ms React commits across hover and rejection, with DRAFT version 1 and 5,000 shifts/assignments unchanged in PostgreSQL. Focused board 11/11, full frontend 24 files/127 tests, TypeScript, ESLint, production build and diff check passed. Profiler, services, schemas and account were cleaned. This does not establish sustained FPS or successful-drop reload performance.

## 2026-10-14 employee-board refresh optimization

Added a row regression covering unchanged DOM identity after cloned data, changed shift time, removed shift and newest workforce object on employee selection. Frontend Vitest passed 25 files/135 tests; TypeScript/Vite production build and ESLint passed. `git diff --check` found no whitespace errors (Git reported only LF/CRLF notices). Backend source did not change in this checkpoint; prior real-PostgreSQL 106-test pass remains latest. Real Chrome saved-delete and cross-row drag were verified after reload against isolated direct PostgreSQL reads. Temporary performance logging is absent from final source.

## 2026-10-14 failed-refresh interaction gate

Current Calendar requests now invalidate the prior visible snapshot on failure, clear pending batch selections/copy previews, and keep writes unavailable until a complete snapshot loads. An editor preserves unsaved input with an explicit unavailable-data message and a usable Cancel button. A new ShiftDialog test covers note retention, disabled Save and recovery. Full frontend Vitest passed 25 files/136 tests; TypeScript/Vite build, ESLint and diff check passed. Isolated real Chrome reproduced the stale pre-fix view and verified failed-refresh hiding plus Retry recovery. No backend source change; previous database-enabled 106-test backend gate remains latest.

## 2026-10-14 backend revision/export gate

New route regressions cover a changed Evaluate 1.4 workforce revision after one page (503) and store-local Adelaide overnight times in CSV and print. Full backend database-enabled Vitest passed 17 files/108 tests against local PostgreSQL. Prisma schema validation and migration status passed (four migrations current); full backend production build regenerated Prisma Client and compiled TypeScript after stopping the exact 4020 watcher. Root ESLint and diff check passed. Paired real Evaluate HTTP acceptance with a disposable schema verified 101-person multi-page and one-person single-page revision checks. Normal 4020 current-source health returned database/evaluateMolly true and frontend 5176 returned 200 after restart. Temporary Evaluate schema/account and service were cleaned. The prior frontend 136-test gate remains latest because frontend source was unchanged in this checkpoint.

## 2026-10-14 immutable timezone export gate

A new PostgreSQL publication-history assertion verifies that revision #1 freezes Adelaide timezone and revision #2 freezes Sydney after an isolated direct fixture settings change. Historical CSV and print route assertions prefer the frozen Adelaide timezone over current Sydney settings. Full backend database-enabled Vitest passed 17 files/109 tests; TypeScript check and production build passed. Root ESLint and diff check passed. Current-source normal 4020 and frontend 5176 restarted/healthy; no temporary QA schema or ports remain. Earlier frontend 136-test gate remains latest; frontend source did not change.

## 2026-10-14 ExportPage browser gate

Frontend changes passed Vitest 25 files/136 tests, TypeScript/Vite production build and ESLint. Isolated real browser verified frozen Adelaide 08:30–12:30 in historical detail and actual print despite current Sydney settings; configured API links pointed to 4035; store switching removed old state. Backend's latest full real-PostgreSQL gate remains 17 files/109 tests from the preceding snapshot change. No backend source or migration changed in this pass.

## 2026-10-14 archive selection gate

A new ExportPage component suite tests preceding-year published revision retrieval and immediate clearing of a previous period's revision while the next publication request remains pending. Focused tests passed 2/2; full frontend Vitest passed 26 files/138 tests, TypeScript/Vite production build and ESLint passed. Isolated real browser retrieved a disposable 2025 published revision and verified year/period switches immediately removed stale links. The previous full backend real-PostgreSQL gate remains 17 files/109 tests because backend source did not change. No migration or Evaluate application edit.

## 2026-10-14 Copy Shift date/Availability gate

A new ShiftDialog regression verifies that changing a copy to Sydney's nonexistent 2026-10-04 02:30 wall time retains entered notes, displays an error and disables Save. Full frontend Vitest passed 26 files/139 tests; TypeScript/Vite production build and ESLint passed. Real browser plus guarded PostgreSQL verified target-date Availability replacement, unavailable-source rejection, one successful HandoverEmployee006 copy, refresh persistence, and save blocking/recovery during target Availability API outage. Backend source did not change; prior full real-PostgreSQL backend gate remains 17 files/109 tests. No migration or Evaluate application edit.

## 2026-10-15 Copy Shift recovery gate

The ShiftDialog test now asserts that its target Availability Retry callback is callable while unsaved form input remains intact. Full frontend Vitest passed 26 files/139 tests; production TypeScript/Vite build and ESLint passed. Isolated browser verified Sydney's 2026-10-04 02:30 DST-gap error and disabled Save, then verified Retry after a real temporary 4035 outage restored eligible target staff without changing the date or note. Guarded PostgreSQL after Cancel retained DRAFT version 1 and two shifts. Backend source did not change; the prior full backend PostgreSQL gate remains 17 files/109 tests.

## 2026-10-15 Dialog context retry gate

A shared scoped employee-plus-Availability loader now supports Retry in New Shift, Edit Shift and Copy Shift. The existing ShiftDialog retained-input/disabled-Save regression exercises the renamed context callback. Frontend Vitest 26 files/139 tests, TypeScript/Vite production build, full ESLint and git diff check passed. Isolated Chrome completed edit and create outage/recovery/cancel paths; direct PostgreSQL remained at DRAFT version 1 and three source shifts. Backend PostgreSQL 109/109 is the latest prior full suite; no backend code or migration changed in this checkpoint. The normal 4020 health and 5176 HTTP checks passed after cleanup.

## 2026-10-15 Diagonal employee-row transaction gate

New `laneReposition.integration.test.ts` uses real PostgreSQL to require all-or-nothing date-plus-assignment movement: unavailable and overlapping target attempts preserve source assignment/period version; the valid move keeps the Shift ID, changes only one assignment and date/time, and a stale retry returns 409. The route test verifies a current Evaluate target snapshot and rejects an employee outside the authorized store. The board pointer test verifies the diagonal destination. Backend database-enabled suite passed 18 files/111 tests on a serial rerun; its initial parallel run had one existing Copy Day 5-second timeout. Frontend suite passed 26 files/140 tests; build and full ESLint passed. Prisma validate, four-migration status and backend production build passed after releasing a known Node REPL Prisma DLL holder. Isolated Chrome and direct PostgreSQL verified one valid drag and one unavailable rollback. No migration or Evaluate application change.

## 2026-10-15 Employee-row creation gate

The board component regression covers blank-cell click, focusable '+' button, unchanged shift-card edit behavior, published-date create refusal and a synthetic click after pointer drop that must not open a draft. Frontend full suite passed 26 files/142 tests, production build and ESLint. Guarded Playwright Chromium saved a HandoverEmployee006 10 October 09:00–10:00 row draft, reloaded it, opened/canceled a Cindy 11 October blank-cell draft, and found no create button on the published week. Direct isolated PostgreSQL verified exactly one new shift, DRAFT version 2, four total shifts, source assignment unchanged and published version 1. This browser run preceded a small '+' sizing and click-suppression hardening patch; the final code passed the full component/build/lint gates. Backend real-PostgreSQL suite remains 111/111 from the preceding diagonal-drag checkpoint; no backend source or migration changed afterward.
## 2026-10-15 Month blank-cell interaction gate

Frontend Vitest passed 26 files/142 tests, TypeScript/Vite production build and full ESLint passed after the Month click change. Playwright Chromium and direct disposable PostgreSQL checks passed the save/reload/edit/date-number/published-lock flow recorded in browser QA. Backend source and schema were unchanged in this checkpoint; the previous real PostgreSQL backend gate remains 18 files/111 tests and production build. Normal 4020 health reported database/evaluateMolly true and 5176 returned HTTP 200 after disposable QA cleanup.

Published create follow-up: the shared `openDraft` now refuses PUBLISHED dates across Month/Week/Day, drag selection and toolbar. Two isolated Chromium scripts passed; the second asserted the visible lock message after Month/Day/Week click and toolbar action, plus no Day drag dialog. Database inspection stayed at four shifts, DRAFT version 2 and PUBLISHED version 1. The frontend gates were rerun after this UI change; backend source and migrations remained unchanged.

## 2026-10-15 Drag frame sampling

Playwright Chromium measured requestAnimationFrame intervals during a canceled Week employee-row drag on isolated 50/100/500-person, 500/1,000/5,000-benchmark-shift datasets. Median and p95 were 16.7 ms at all three stages, with zero intervals above 33.3 ms across 296/344/352 samples. No Shift mutation request was sent. A guarded real PostgreSQL read after the 500-person stage confirmed 5,000 shifts and assignments and unchanged fixture versions. The browser uses the board's default 60 visible employees at the 500-person stage; this is a local short-gesture measurement, not production hardware or multi-minute FPS acceptance. No application code or schema changed in this checkpoint.

## 2026-10-15 Known-invalid row drop gate

The focused `EmployeeLaneBoard` suite passed 15/15 including a regression requiring an overlapping drop to produce no `onMove` call and a visible reason, while a following valid drag still delegates. Isolated Playwright Chromium saw the red ring, visible overlap message and zero Shift mutation requests. Direct guarded PostgreSQL confirmed Bob and HandoverEmployee006 assignments, four shifts and original period versions. Frontend full Vitest passed 26 files/142 tests; TypeScript/Vite production build, ESLint and diff check passed after the change. Backend and Evaluate source and Prisma schema were unchanged.

## 2026-10-15 Overnight template and toolbar gate

The ShiftDialog component regression verifies that an overnight template sets Next Day and a later daytime template clears it. Full frontend Vitest passed 26 files/143 tests; TypeScript/Vite production build, ESLint and diff check passed. Isolated Chromium verified toolbar store opening-time prefill, template next-day prefill, save/reload and next-day Calendar continuation. Guarded PostgreSQL verified the exact UTC start/end, one Cindy assignment and unchanged published period. Backend/Evaluate source and migrations did not change; the previous real PostgreSQL backend suite remains 18 files/111 tests.
## 2026-10-15 overnight Availability gate

Frontend Vitest passed 26 files/145 tests; backend passed 18 files/112 tests with `RUN_DATABASE_TESTS=1` against disposable real PostgreSQL. The new database regression verifies cross-day overlap rejection leaves existing rows intact and adjacent intervals succeed. Frontend TypeScript/Vite build, backend Prisma generation/TypeScript production build, ESLint and Prisma Validate passed. The initial backend build hit a known Windows Prisma DLL lock; stopping the exact Roster processes, rebuilding and restarting with `scripts/start-dev.ps1` resolved it. No migration or Evaluate code change.

Final server follow-up: after adding the API maximum interval invariant and repeated-hour DST guard, backend TypeScript, all 18 files/113 real-PostgreSQL tests and the complete Prisma generation/production build passed again in a fresh disposable schema. Database cases checked multi-day, overlong next-day and Sydney fallback-clock reversals leave no rows. The exact test schema was cleaned and normal development readiness restored.

## 2026-10-15 Staff employee-scope gate

Three new Staff regressions cover failed employee-switch reads, an overnight operating-hours preset and a previous employee's late Save response. The first and last reproduced unsafe state before the fix. Final frontend Vitest passed 26 files/148 tests; TypeScript/Vite production build, ESLint and diff check passed. The browser and PostgreSQL evidence are in `ROSTER_BROWSER_QA.md`. Backend source was unchanged; the previous full real-PostgreSQL 113-test suite and backend production build remain the latest backend gate.

## 2026-10-15 cross-midnight coverage gate
Isolated PostgreSQL: backend 18 files/114 tests with RUN_DATABASE_TESTS=1, including previous-day Availability create, Copy Day preview/commit, publication and atomic deletion rejection. Frontend 26 files/148 tests; Calendar snapshot verifies D-1..D+1 Availability fetch. Frontend build/ESLint, backend TypeScript no-emit, Prisma validate, four-migration status and backend production build passed. An initial concurrent backend suite exceeded two existing 5-second test deadlines; the serial rerun passed. Disposable Chromium save/reload plus guarded PostgreSQL verified Cindy's early Shift. No schema or Evaluate application change.
## 2026-10-15 final overnight-store gate
After changing 18:00-03:00 operating-hours validation and night-store time-grid bounds, isolated backend PostgreSQL passed 18 files/114 tests; frontend passed 26 files/148 tests. Frontend production build/ESLint, backend TypeScript and backend production build passed. Chromium saved/reloaded a previous-day-Availability-covered 00:00-02:00 Shift and verified Day/Week visibility and Edit prefill after the fix. A separate direct fixture tested 22:00-02:00 split display in both dated Day views. Earlier in this continuation Prisma validation and isolated four-migration status passed. No migration or Evaluate change.
## 2026-10-15 split Resize final gate
CSS changes enlarged and inset FullCalendar top/bottom time-grid resizers. Disposable Chromium reproduced the old end-handle pointer miss and whole-Shift move, then verified top and bottom split-overnight Resize with reload; guarded PostgreSQL matched final UTC endpoints and unchanged employee/publication. Frontend full gate after the CSS change: 26 files/148 tests, production build and ESLint passed. Backend source remained unchanged since its isolated PostgreSQL 18 files/114 tests and production build.
## 2026-10-15 split Move browser gate
No app source changed. Paired disposable Chromium accepted one-hour Move of an overnight continuation and reloaded the saved 23:00-03:00 Shift. It then rejected 00:00-04:00 with HTTP 400 / OUTSIDE_OPERATING_HOURS and handled an intercepted 503 with authoritative reload. Direct PostgreSQL verified unchanged Shift ID, employee, UTC endpoints, Shift version 2, DRAFT version 3 and PUBLISHED version/publication after failures. The most recent code-change gates remain frontend 26 files/148 tests, backend isolated PostgreSQL 18 files/114 tests, both production builds and ESLint.

## 2026-10-15 unset-settings date guard
Red-green isolated PostgreSQL regression: before the fix, a Sydney-local 9 October Shift committed under roster date 8 October without store settings. After the fix, mismatched local date and >24-hour duration return INVALID_CROSS_DAY, zero Shift rows persist, and the correct-date Shift saves. Focused 5/5; full backend 18 files/115 tests; TypeScript no-emit and production emit pass; Prisma schema valid and four migrations applied in the disposable schema. The test fixture's second UTC store now explicitly saves its timezone. Normal 4020 health database/evaluateMolly=true and 5176 HTTP 200. Exact disposable schema removed. No fresh browser gesture covered the invalid-date API-only input; earlier valid Calendar browser scenarios remain the UI evidence. Frontend source was not changed in this checkpoint.

## 2026-10-15 inactive-role copy regression
Red PostgreSQL preview: Copy Day reported zero issues after its source role was deactivated. Green regression covers Copy Day and Copy Week preview/commit refusal with no target Shift/period, plus a two-source-shift Repeat test proving sourceShiftId selects only the chosen Shift. Full isolated backend: 18 files/116 tests; backend TypeScript no-emit and production emit passed. Paired disposable Chromium Copy Day preview/forced-execute gave 200 issue and HTTP 422 respectively; direct DB versions and target count stayed unchanged. Exact schemas and temporary ports were cleaned. No migration or Evaluate/frontend source change.

## 2026-10-15 role/settings concurrency
New PostgreSQL integration file holds the per-store advisory lock while a Shift create waits. Direct role deactivation then produces INACTIVE_SHIFT_ROLE after lock release; changing openingTime produces OUTSIDE_OPERATING_HOURS. Both leave Shift count zero and period version unchanged. updateRole was observed waiting for the same lock before deactivating. Full isolated backend 19 files/118 tests, backend TypeScript no-emit and production emit passed. Exact disposable schema removed. No frontend change or new browser gesture; earlier Copy Day inactive-role Chromium evidence still applies to the previous code path. Publication behavior with an already inactive source role remains a separate unresolved policy question.

## 2026-10-15 stale lane recovery
Real Chromium red-green: after an external authenticated update changed Bob's Shift to QA Changed/version 2, a stale employee-row drag to Cindy returned 409. Before the fix, the board retained QA Front; after the fix, it reloaded QA Changed on Bob and no Cindy card. Direct isolated PostgreSQL verified Shift ID and employee unchanged by the failed drag, Shift/DRAFT version 2. Frontend full 26 files/148 tests, ESLint and production build passed. Backend source unchanged from the 19-file/118-test isolated PostgreSQL gate. Exact paired schemas and temporary services cleaned.

## 2026-10-15 employee-row edge scrolling
Real Chromium reproduced absent vertical auto-scroll (scrollTop 719 to 719), then verified down 719 to 1627 and up 719 to 0 with Escape and zero writes. A fresh isolated browser pass reached an initially offscreen HandoverEmployee006 row, saved one Bob-to-HandoverEmployee006 assignment and reloaded it; PostgreSQL confirmed same Shift ID, version 2, HandoverEmployee006 sole assignee, DRAFT version 2 and unchanged publication. Frontend 26 files/148 tests, full ESLint and production build passed after the final code refactor. The temporary paired schemas and services were removed. Backend app code unchanged from its 19-file/118-test PostgreSQL gate.

## 2026-10-15 horizontal row-scroll gate

Real 600x700 Chromium reproduced no leftward scroll at 433, then passed left 433 to 0 and right 0 to 462 with Escape and no writes. Browser committed one cross-date drag and a fresh login displayed the saved card. Guarded disposable PostgreSQL verified original Shift ID/version 2, Bob assignment, UTC 2026-10-04T22:00Z to 2026-10-05T02:00Z, source DRAFT version 2 and unchanged PUBLISHED version 1, three Shifts and one publication. Frontend full 26 files/148 tests, ESLint and production build passed. Backend app source unchanged from its 19-file/118-test PostgreSQL gate. Exact temporary paired schemas and services were cleaned.

## 2026-10-15 row-drag pointer ownership

A new EmployeeLaneBoard regression failed before the fix because pointer 2 committed a destination while pointer 1 was still down; after the ownership guard the focused file passed 16/16 and the full frontend suite passed 26 files/149 tests. ESLint and production build passed. Disposable Chromium real mouse plus injected second pointer down/move/cancel/up sent no early Shift request, then the owner saved one cross-row PATCH and reload retained it. Guarded PostgreSQL confirmed Shift/DRAFT version 2, HandoverEmployee006 sole assignee, PUBLISHED version 1, three Shifts and one publication. Temporary paired schemas/services were cleaned. Backend app source unchanged from its 19-file/118-test PostgreSQL gate.

## 2026-10-15 narrow touch gate

Touch-enabled 390x844 Chromium opened Bob's existing Shift Edit and a HandoverEmployee006 date-prefilled Create dialog by tap, canceled both, swiped a Shift card to scroll horizontally 492 to 549 without mutation, and tapped HandoverEmployee006's name to focus the time-grid filter. Browser geometry red-green showed '+' 32x32 to 44x44px and employee selector 41x20 to 44x44px. Guarded PostgreSQL retained source Shift/DRAFT/PUBLISHED versions 1 and three Shifts/one publication. Frontend 26 files/149 tests, ESLint and production build passed. No backend/Evaluate app or migration change; exact temporary paired schemas and services were cleaned.

## 2026-10-15 inactive-role reposition gate

Red isolated PostgreSQL assertion: `repositionShift` saved a date-plus-employee move after the source role was deactivated. Green: the same call returns 422 / INACTIVE_SHIFT_ROLE with Shift/assignment/period unchanged; reactivation and rename permit a single move with updated role snapshots. Full backend 19 files/118 tests, TypeScript no-emit and production emit passed. Generated-ADMIN Chromium observed one refused 422 PATCH, source retained after reload and direct DB source/DRAFT versions 1, zero target Shifts and unchanged publication. Exact temporary schemas/services were cleaned. Frontend app source unchanged; its latest full gate remains 149/149, ESLint and production build.

## 2026-10-15 Batch Update Availability and role gate

Red isolated PostgreSQL result: after direct removal of a Shift's Availability, `batchUpdate` returned `{ updated: 1 }` and changed it. Green integration assertions now verify unavailable and inactive-source-role refusals with unchanged Shift/period versions, plus successful note and role updates after Availability restoration. Full backend 19 files/118 tests and TypeScript no-emit/production emit passed. Generated-ADMIN Chromium selected a two-Shift group, attempted batch role change and received 422 / EMPLOYEE_UNAVAILABLE for Bob; reload and guarded DB showed both source Shift versions 1, DRAFT/PUBLISHED versions 1, three Shifts and one publication. Exact temporary schemas/services cleaned. No frontend app or Evaluate code change.
## 2026-10-15 Publish current-settings gate

Red PostgreSQL test published a three-hour Shift after minimum duration rose to four hours. Green integration tests reject both too-short and out-of-hours Shifts with no publication or DRAFT version change, then publish after valid settings return. Full isolated backend 19 files/118 tests; TypeScript no-emit and production emit passed. Generated-ADMIN Chromium received HTTP 400 / MIN_SHIFT_DURATION, then HTTP 200 after fixture repair; both outcomes survived reload and matched guarded PostgreSQL. No frontend source edit, migration or Evaluate application edit. Temporary Evaluate Prisma Client was regenerated after an initial stale-client login failure.
## 2026-10-15 Batch Update current-settings gate

Isolated PostgreSQL red test saved a batch note on a five-hour Shift after the minimum became six hours. Green tests reject MIN_SHIFT_DURATION and OUTSIDE_OPERATING_HOURS with unchanged Shift/period versions, then accept normal note/role updates after settings repair. Full backend 19 files/118 tests; TypeScript no-emit and production emit passed. Generated-ADMIN Chromium grouped two Shifts, received HTTP 400 / MIN_SHIFT_DURATION on Batch Update, retained the group after reload, and guarded PostgreSQL confirmed both Shift and period/publication versions unchanged. No frontend app edit, migration or Evaluate application edit.
## 2026-10-15 Shift/period compound FK and source gate

Red disposable PostgreSQL: a foreign-store Shift under a local period was published into the local snapshot. Green service tests reject that source for Publish and Copy Week; Copy Week preview reports SHIFT_PERIOD_MISMATCH and a date-outside-period source is also rejected. Migration validation on the dirty fixture failed at the exact foreign key and rolled back. Clean disposable migration status 5/5; direct cross-store insert rejected with P2003. Local public read-only audit before/after migration: 14 Shifts, zero wrong-store/outside-period, FK false then true. Checked custom-format pg_dump backup retained in `%TEMP%`. After regeneration, backend isolated PostgreSQL full gate 19 files/118 tests, TypeScript no-emit and production emit passed; frontend 26 files/149 tests, ESLint and production build passed. Generated-ADMIN Chromium confirmed Copy Week preview/forced commit and Publish refusal with reload/direct DB. No Evaluate application change.
Post-migration browser follow-up: current five-migration disposable schema with a same-store, out-of-period-date source Shift passed the same Copy Week preview/commit and Publish rejection/reload checks. Guarded PostgreSQL found no target period or publication and unchanged source/published versions. The historical cross-store browser pass used the four-migration fixture; current migrated DB rejects that insert at the FK.
## 2026-10-15 Copy Day/Repeat malformed source

Red PostgreSQL regression: Copy Day preview returned canCopy=true for a Shift dated inside one period but linked to another. Green: Copy Day and Repeat previews return SHIFT_PERIOD_MISMATCH, commits return 409, and no target periods or Shift changes occur. Full isolated backend 19 files/119 tests plus TypeScript no-emit and production emit passed. Generated-ADMIN Chromium checked Copy Day UI disabled Save, forced Copy Day/Repeat 409, reload and guarded direct PostgreSQL zero writes. No frontend application change, migration or Evaluate application change.

## 2026-10-15 Day drag-create persistence

Generated-ADMIN Chromium: Day 10 October drag 10:00-11:30, HandoverEmployee006 save, reload pass. Guarded PostgreSQL: exactly one Shift under the draft period, one HandoverEmployee006 assignment, UTC 2026-10-09T23:00:00Z to 2026-10-10T00:30:00Z. Added browser script and isolated DB verifier. No application code change in this check; latest backend full gate remains 19 files/119 tests, TypeScript no-emit and production build pass.

## 2026-10-15 Resize rejection browser check

Top and bottom Day Resize each sent exactly one PATCH, received an intercepted 503, reverted visually and remained original after reload. Direct isolated PostgreSQL check: one Shift version 1, DRAFT version 2, PUBLISHED version 1, unchanged HandoverEmployee006 assignment and 10:00-11:30 Sydney time. QA script and guarded verifier passed; no application source change this continuation. Latest full backend gate remains 19 files/119 tests and TypeScript/build pass from the prior source change.

## 2026-10-15 Time-grid optimistic concurrency browser check

A separate authenticated Batch Update advanced one Shift to version 2 while the Day browser retained version 1. Bottom Resize returned 409; the browser displayed the unchanged time and concurrent note after automatic reload. Guarded PostgreSQL checked Shift version 2, DRAFT version 3, PUBLISHED version 1 and no duplicate. No application source change in this check; latest full backend gate remains 19 files/119 tests.

## 2026-10-15 Two-session evaluator concurrency

Two generated STORE_EVALUATOR browser sessions: B Edit saved HTTP 200; A stale bottom Resize returned 409, reverted and loaded B's note. Direct isolated PostgreSQL: one Shift version 2, DRAFT version 3, PUBLISHED version 1 with original HandoverEmployee006 assignment and time. No application source change; latest full backend gate remains 19 files/119 tests with TypeScript/build pass.

## 2026-10-15 Empty Copy Week preview

Red isolated PostgreSQL regression: empty source preview had canCopy=true while commit returned 422. Green: preview has NO_SOURCE_SHIFTS/canCopy=false and commit still rejects with no target period. Full isolated backend 19 files/120 tests, TypeScript no-emit and production emit passed. Generated-ADMIN Chromium showed the blocking preview and disabled Copy; direct PostgreSQL found no target write. No migration or Evaluate application edit.

## 2026-10-15 Misdated Shift Batch Update

Red isolated PostgreSQL regression showed Batch Update returning {updated:1} for a Shift outside its linked period. Green: HTTP 409 / SHIFT_PERIOD_MISMATCH and unchanged Shift/period versions/note. Focused 7/7; full isolated backend 19 files/120 tests; TypeScript no-emit and production emit passed. Generated-ADMIN Chromium Batch role change received 409 and guarded PostgreSQL showed no write. No migration or Evaluate application edit.

## 2026-10-15 Upward drag-create browser check

Fresh isolated Chromium upward Day drag selected 10:00-11:30, saved HandoverEmployee006 and retained the card after reload. Direct PostgreSQL verifier confirmed exactly one Shift, correct Sydney DST UTC range, canonical assignment and period versions. QA tooling only; backend full gate remains 19 files/120 tests and TypeScript/build pass from the last source change.

## 2026-10-15 Time-grid Escape cancellation

Red Chromium: Escape during a held Day selection still opened Add on pointer release. Green: Escape immediately removed the selection preview and prevented Add; a synthetic pointer-cancel also prevented Add, and a 3px click plus subsequent click still worked. Zero Shift mutation requests; direct PostgreSQL draft/published versions unchanged. Frontend 26 files/149 tests, ESLint and production build passed. No backend application change in this check.

## 2026-10-15 Calendar selection bounds and click minimum

Browser red-green: Week cross-column drag spanning 6-8 October originally opened an inaccurate next-day draft; now blocked, valid same-day selection retained. A 30-minute slot with 60-minute store minimum originally prefilled 30 minutes on click; now prefills 60 minutes and saves/reloads. Guarded PostgreSQL verified one HandoverEmployee006 Shift, correct Sydney DST UTC range and period versions. Frontend 27 files/152 tests, lint and production build passed. No backend application or Evaluate change.
## 2026-10-15 closing-edge click creation

Browser red-green: a 21:30 click at a 22:00 closing time with a 60-minute minimum originally opened an unsavable 21:30–22:30 draft; now it shows an error and no dialog. A 21:00 click still prefills 21:00–22:00. Guarded PostgreSQL proved zero Shift/period/publication writes. Calendar selection unit tests cover normal and overnight operating-hour limits. Frontend 27 files/154 tests, ESLint and production build passed; `git diff --check` returned no whitespace error. No backend or Evaluate application change.
## 2026-10-15 overnight store creation hours

Chromium red-green proved a non-business-hours drag previously opened an unsavable Add draft; the fixed path gives an error without a dialog. Valid evening and early-morning drags still prefill correctly. Direct isolated PostgreSQL proved zero draft/publication writes. Frontend 27 files/154 tests, ESLint and production build passed; backend TypeScript no-emit passed for the QA fixture command. No migration or Evaluate application change.
## 2026-10-15 shared date creation and settings minimum

Browser red-green and guarded PostgreSQL verified slot-aligned 90-minute Month/toolbar defaults for a 65-minute minimum, one saved/reloaded canonical HandoverEmployee006 Shift and unchanged publication. Impossible 900-minute minimum against 780-minute store hours blocked Month/toolbar defaults; Settings Save returned HTTP 400 and preserved the prior settings/version. Service regressions first failed for normal and overnight hours, then passed. Frontend 27 files/154 tests, ESLint and production build passed. Backend `RUN_DATABASE_TESTS=1` against an isolated migrated PostgreSQL schema: 19 files/122 tests passed; production build passed after stopping the exact Prisma DLL holder and restarting normal Roster. No migration or Evaluate app change.
## 2026-10-15 repeated fall-back clock

Focused component and store-time tests first failed on the second 02:30 occurrence, then passed after the dialog preserved the selected UTC occurrence. Isolated Chromium created/reloaded and note-edited the one-hour repeated-clock Shift; guarded PostgreSQL verified exact UTC start/end, version increment and stable publication. Frontend 27 files/155 tests, ESLint and production build passed; focused Adelaide fallback test 3/3 passed afterward. Backend fixture TypeScript no-emit passed. No migration or Evaluate app change.

## 2026-10-15 repeated-hour Copy Day regression

Red-green `zonedCopy` and ShiftDialog regressions cover occurrence-preserving copy and invalid ordinary-day target. New real-PostgreSQL Copy Day integration case verifies preview/commit UTC instants and all-or-nothing rejection. Full frontend: 27 files/156 tests passed, ESLint passed, production build passed. Full backend against migrated disposable PostgreSQL: 19 files/125 tests passed with `--testTimeout=20000`; Prisma validate and production build passed. First backend run in parallel with frontend build/lint/tests had two 5-second integration-test timeouts; isolated rerun passed all tests. Browser and guarded PostgreSQL results recorded in `ROSTER_BROWSER_QA.md`. No migration or Evaluate application change.
## 2026-10-15 repeated-hour Copy Shift browser follow-up

Standalone generated-ADMIN Chromium and guarded disposable PostgreSQL covered invalid normal-date refusal, preservation of the second 02:30 when changing to another fall-back date, Save, reload and exact persisted UTC interval/employee. Backend fixture TypeScript no-emit and Git diff check passed. Previous full frontend 156/156 and backend real-PostgreSQL 125/125 suites remain the most recent full test gates; this follow-up changed only test fixture/browser evidence, not application source.
## 2026-10-15 nonexistent-date regression

Red route/helper tests proved 2026-02-30 reached Calendar and passed `dateString`. After strict calendar-date validation, focused 46/46 passed. Full backend against a migrated disposable PostgreSQL schema: 20 files/128 tests passed with 20-second timeout; TypeScript no-emit and production build passed. New Copy Day database test rejects 2037-11-31 without creating a period or Shift. Chromium API and direct DB evidence are in `ROSTER_BROWSER_QA.md`. No frontend, Prisma schema or Evaluate app change.
## 2026-10-15 malformed period length regression

Red disposable PostgreSQL test: a one-day WEEK with a valid Shift produced `canCopy=true`. After length validation at preview, copy commit and publish, focused Copy Week 3/3 passed. Full backend on an isolated migrated PostgreSQL schema: 20 files/129 tests passed with 20-second timeout; production build passed. Chromium Copy preview/forced commit/Publish and direct DB checks are recorded in `ROSTER_BROWSER_QA.md`. No frontend, schema migration or Evaluate application change.
## 2026-10-15 configured week boundary

New database regression in `atomicCreate.integration.test.ts` rejects wrong-week auto-create without any period/Shift write. `laneReposition.integration.test.ts` rejects a cross-period move whose target week starts on the wrong weekday and preserves the source Shift/period versions. Focused 3/3; full backend 20 files/130 tests with `RUN_DATABASE_TESTS=1` on a migrated isolated PostgreSQL schema, 20-second timeout; backend production build passed. Authenticated Chromium API and direct database checks are in `ROSTER_BROWSER_QA.md`. `git diff --check` passed. No frontend application change or migration.

## 2026-10-15 Copy Day/Repeat period-shape regression

Red isolated PostgreSQL test showed a malformed one-day WEEK source produced Copy Day `canCopy=true`. After the shared preview guard, `copyPeriod.integration.test.ts` also verifies malformed target handling for Copy Day and Repeat Shift, HTTP-style service conflicts and no partial writes. Focused Copy Day/Copy Week 12/12; full backend 20 files/130 tests against migrated isolated PostgreSQL with 20-second timeout; backend production build passed. Authenticated Chromium and direct database evidence are in `ROSTER_BROWSER_QA.md`. No frontend application or Evaluate change.

## 2026-10-15 malformed-period destination writes

A red disposable PostgreSQL regression showed `createShift` successfully wrote into a one-day WEEK. `copyPeriod.integration.test.ts` now checks rejection in explicit create, auto-period create, Edit and reposition, plus a successful move out of the malformed source into a valid period. Focused 3/3 and full backend 20 files/130 tests with `RUN_DATABASE_TESTS=1` on a migrated isolated PostgreSQL schema; production build passed. Authenticated Chromium and direct database verification are recorded in `ROSTER_BROWSER_QA.md`. No frontend application change or schema migration.

## 2026-10-15 Batch Update malformed-period atomicity

Red isolated PostgreSQL regression: a note-only Batch Update succeeded against a one-day WEEK. After the shape guard, one damaged Shift and a mixed valid/damaged two-Shift batch reject without touching the healthy Shift or its period version. The unit mock was updated to include cycle type. Focused 3/3; full backend 20 files/130 tests against migrated isolated PostgreSQL with 20-second timeout; backend production build passed. Authenticated Chromium and direct DB evidence are in `ROSTER_BROWSER_QA.md`. No schema migration.

## 2026-10-15 Calendar recheck and touch scroll

Frontend full 27 files/156 tests, ESLint and production build passed after `src/styles.css` and `EmployeeLaneBoard.tsx` scroll-padding changes. Fresh generated-identity Chromium and guarded PostgreSQL covered Day drag create/reload, two-evaluator stale Resize recovery, 390px and 320px employee-row touch alternatives, and 600px horizontal drag auto-scroll/cancel. The first 390px touch run failed because sticky navigation intercepted Create; the repaired run passed. No backend source changed in this checkpoint; the preceding full backend gate remains 130/130 real-PostgreSQL tests and production build. Exact isolated schemas and services cleaned.

## 2026-10-15 overnight pointer chain recheck

Current-source generated-ADMIN Chromium on paired disposable schemas verified early-morning creation, overnight creation, successful move, invalid move rollback, bottom Resize and top Resize, with reload and direct PostgreSQL version/time/assignment checks after move and after both resizes. Guarded verifiers now support the combined Cindy plus HandoverEmployee006 sequence and exact Shift/DRAFT version counts. No application code changed; the previous frontend 156/156, ESLint, production build and backend 130/130 real-PostgreSQL tests/build remain the latest full application gates. Exact temporary data and services were cleaned.

## 2026-10-15 current-source cross-row and copy recheck

Paired disposable Roster/Evaluate PostgreSQL schemas, generated ADMIN, current-source API/Vite and Chromium: employee-row auto-scroll/drop passed (one PATCH 200; canonical HandoverEmployee006 assignment persisted after reload). Copy Day preview 2/2, commit 201 and reload passed; direct PostgreSQL confirmed two distinct target Shifts for HandoverEmployee006 and Training Alice. Copy Previous Week preview correctly blocked a published target (`TARGET_PERIOD_CONFLICT`). Guarded DB readings confirmed Shift/DRAFT version increments and stable PUBLISHED version/publication. New verifier: `scripts/qa-copy-day-after-cross-row-browser.py`. Its first HTTP 200 expectation was a test error because the API correctly returned 201; no application failure or duplicate copy occurred. No app source changed; prior full frontend 156/156, lint/build and backend 130/130 real-PG/build remain the latest full-suite results.

## 2026-10-15 Copy Week target boundary

New red-green assertion in `backend/tests/copyPeriod.integration.test.ts`: Tuesday target after a Monday-configured source must preview `INVALID_TIME_RANGE`, commit 400 and create no target period. Initial real-PostgreSQL run failed as expected because only an Availability issue appeared; after the service fix the focused file passed 3/3 and full backend passed 20 files/130 tests on an isolated migrated schema. Backend TypeScript no-emit, Prisma validate and production build passed. Current-source Chromium authenticated API and guarded PostgreSQL verified the same rejection and immutable prior publication. No frontend source changed; its preceding 156/156 tests, lint and build remain the latest frontend gate.

### Explicit period create follow-up

The same isolated integration test first failed because `createPeriod` resolved with a Tuesday WEEK. After adding the shared configured-weekday guard inside the transaction, full backend 20 files/130 real-PostgreSQL tests and production build passed. Expanded authenticated Chromium/API and guarded PostgreSQL confirmed HTTP 400 and no write. No frontend source or migration changed.

## 2026-10-15 default weekday regression

Red real-PostgreSQL assertion proved a store with no saved Settings accepted Tuesday direct period creation. The shared weekday predicate now defaults to Monday, matching frontend and Prisma. Full backend 20 files/130 tests against a migrated disposable schema and production build passed. Generated-ADMIN Chromium/API and direct database verification confirmed HTTP 400 and no write. Frontend app code did not change; the prior frontend 156/156, lint and build remain the latest frontend gate.

## 2026-10-15 FORTNIGHT cycle gates

Backend: 21 files/131 tests against an isolated migrated PostgreSQL schema with `RUN_DATABASE_TESTS=1`; TypeScript no-emit, Prisma validate, Prisma migration status and production build passed. `fortnightCycle.integration.test.ts` verifies explicit 14-day anchor, missing/misaligned anchor refusal, incompatible re-anchor refusal, Calendar auto-create, Copy Day, Repeat, cross-cycle reposition, publication snapshot immutability and Copy Period. Frontend: 27 files/157 tests, ESLint, TypeScript and production build passed; `dateTime.test.ts` covers before/after anchor and Sydney DST calendar ranges. A first test run failed only during test fixture cleanup because the child publication needed deletion before its period; this was fixed, then full tests passed. First Lint run found an unused legacy helper; removal yielded a clean final Lint. Current-source Chromium and direct database evidence are in `ROSTER_BROWSER_QA.md`. Local public database received only additive migration after a verified pg_dump backup.

## 2026-10-15 final FORTNIGHT boundary recheck

After the full-suite and Chromium acceptance above, corrected a corrupted Chinese configuration message in the frontend cycle helper and added real-date checks for its anchor/target input. Focused dateTime.test.ts 4/4 and the final frontend TypeScript/production build passed. Local public Roster migration status remained current; live 4020 health reported database and Evaluate true, and 5176 returned HTTP 200.

## 2026-10-15 exact previous-cycle source

calendarPeriod.test.ts added a mixed WEEK/FORTNIGHT source regression. Focused 4/4 and full frontend 27 files/158 tests passed; ESLint and TypeScript/Vite production build passed. Current-source Chromium and guarded PostgreSQL results are recorded in ROSTER_BROWSER_QA.md. Backend source and migration were unchanged in this checkpoint; prior backend 131/131 real-PostgreSQL suite remains the last full backend gate.

## 2026-10-15 cross-fortnight Month drag

Current-source generated-ADMIN Chromium returned HTTP 200 from the reposition PATCH. A first post-reload locator failed because the app returned to October Week View; a separate login navigated to November Month and found the moved card. The corrected full script then passed on a second fresh paired fixture. Guarded direct PostgreSQL verified Shift version 2, source/target FORTNIGHT versions 3/2, sole canonical HandoverEmployee006 assignment, exact UTC four-hour interval and unchanged publication. No application source or migration changed in this checkpoint. The prior frontend 158/158 and backend 131/131 automated gates remain the latest full gates.

## 2026-10-15 Calendar URL context

Added calendarLocation.test.ts for supported views, real dates and query updates. Frontend 28 files/160 tests, ESLint and TypeScript/Vite production build passed. Fresh Chromium covered Month, Week, Day and authorized Store refresh, invalid URL fallback, local generated STORE_EVALUATOR scope and zero mutations. Guarded PostgreSQL confirmed unchanged fixture. No backend source/migration changed; the latest backend full gate remains 21 files/131 real-PostgreSQL tests from the prior FORTNIGHT checkpoint.

## 2026-10-15 cross-store simultaneous create

Added backend/tests/crossStoreConcurrency.integration.test.ts. Focused 1/1 and full backend 22 files/132 tests passed against an explicitly disposable migrated PostgreSQL schema with RUN_DATABASE_TESTS=1. Backend TypeScript no-emit and Prisma Validate passed. The test asserts one success, one 409 CROSS_STORE_CONFLICT, and exactly one committed Shift/assignment/period with no losing-store partial write. No browser assertion is claimed for this service-level race; the existing route and browser gates remain separate. The exact test schema was cleaned.

## 2026-10-15 Week row/publication audit

A synthetic published-target test initially passed, but its DRAFT/PUBLISHED same-week overlap cannot occur under normal period constraints. That test and the speculative code change were removed. The current frontend remains at the prior 28 files/160 tests; ESLint and production build passed during the audit. Live 4020 health database/Evaluate true and frontend 5176 HTTP 200. No new browser or PostgreSQL acceptance is claimed.

Follow-up: final frontend full suite 28 files/160 tests passed. A real disposable Chromium invalid-row-drop script initially failed because the target was above the viewport; after a script-only scroll and coordinate guard, it passed twice. Direct guarded PostgreSQL verified four Shifts, one Bob source assignment and one HandoverEmployee006 conflict assignment, Shift versions 1, DRAFT version 1 and PUBLISHED version 1 unchanged. No application-code regression was found.

## 2026-10-15 same-week overnight employee-row continuation

EmployeeLaneBoard focused 18/18, full frontend 28 files/162 tests, ESLint and TypeScript/Vite production build passed. Component cases cover same-week continuation, no second draggable shift and an exact-midnight end. Fresh disposable Chromium saved the 22:00–02:00 HandoverEmployee006 Shift, displayed original and continuation in Week rows, clicked through to the original Edit, attempted a continuation drag with zero mutations and reloaded. Direct guarded PostgreSQL confirmed one matching canonical HandoverEmployee006 assignment, Shift version 1, DRAFT version 2 and unchanged PUBLISHED version 1/one publication. Backend/Evaluate code and schema were unchanged.

## 2026-10-15 continuation calculation recheck

The board's continuation index now caches seven store-local midnight instants instead of converting every Shift end to local parts. New Adelaide spring-DST component case passed; employee-row focused 19/19 and full frontend 28 files/163 tests, ESLint and production build passed. Fresh current-source Chromium and guarded PostgreSQL repeated the overnight save/next-day display/click/zero-write drag path. No FPS or target hardware performance claim is made.

## 2026-10-15 current-source 500-person browser scale

Staged isolated Chromium fixture: 500/1,000/5,000 Shifts for 50/100/500 employees. Canceled drag rAF samples 366/355/363, p95 16.8/16.7/16.7 ms, zero frames above 33.3 ms and zero Shift writes. One 500-person board load took 1,327 ms; high-index employee search 30 ms; 60 rows initially rendered; CDP observed 26.5 MiB JS heap. Direct guarded PostgreSQL verified 5,000 Shift/assignment rows and unchanged source and period versions. No product code changed in this scale checkpoint; physical-device and sustained-use results remain unverified.

## 2026-10-15 malformed successful mutation response

Added apiClient regressions for malformed HTTP 200 JSON after PATCH and GET. Focused 7/7; full frontend 28 files/165 tests, ESLint and TypeScript/Vite production build passed. Fresh Chromium forwarded one real Shift create (201 committed), returned invalid JSON only to the browser, then observed authoritative reconciliation without a duplicate and persistence after reload. Guarded PostgreSQL found one new HandoverEmployee006 Shift, DRAFT version 2 and unchanged publication. No backend/Evaluate or migration change.
## 2026-10-15 uncertain Copy and Batch response

Full frontend suite: 28 files/165 tests passed. TypeScript/Vite production build passed. Paired disposable Chromium exercised committed malformed-success Copy Day (201), Copy Period (201) and Batch Delete (200); guarded PostgreSQL verified exact Shift counts, period versions and unchanged prior publication before/after Delete. Backend and Evaluate application code, tests and schema were unchanged.
## 2026-10-15 uncertain Repeat Shift response

Fresh disposable Chromium forwarded one committed Repeat POST (201), supplied unreadable JSON only to the browser, and verified closure of the old dialog plus reload. Guarded PostgreSQL found one repeated Shift, four total, DRAFT version 2 and unchanged publication. Frontend full 28 files/165 tests, ESLint and production build were rerun after the UI change.
## 2026-10-15 uncertain single Shift Delete

Generated-ADMIN Chromium tested committed HTTP 204 with a lost browser response, then authoritative ID reconciliation and reload. Guarded PostgreSQL found exactly one deleted Shift, the adjacent Shift retained and prior publication unchanged. Frontend 28 files/165 tests, ESLint and production build were rerun after the UI fix.

## 2026-10-15 current-source backend PostgreSQL gate

Current backend 22 files/132 tests passed with `RUN_DATABASE_TESTS=1` against a guarded disposable local PostgreSQL schema. Prisma validate and six-migration status passed; backend TypeScript and production build including Prisma generate passed. Only the verified 4020 watcher/process was stopped for the Windows DLL lock, then `scripts/start-dev.ps1` restored the normal backend. New 4020 health reported database/Evaluate true; 5176 returned 200. The disposable schema was cleaned. This is current local evidence, not target deployment or real evaluator acceptance.
## 2026-10-15 Month focused-period regression

New unit cases cover Month focus selecting its exact period and an unscheduled focus yielding no period action. Focused 11/11; full frontend 28 files/167 tests passed and TypeScript/Vite production build passed. Disposable Chromium reproduced the wrong DRAFT summary and URL before repair, then verified the correct PUBLISHED summary, Copy source/target, empty focus, existing Month/Week/Day URL reload, draft drag PATCH 200 and published-card lock. Guarded PostgreSQL confirmed exact Shift and period versions with unchanged publication. ESLint was running at the document checkpoint.

The final ESLint pass completed successfully. Temporary browser services and both schemas were cleaned.
## 2026-10-15 Month Reopen and Export browser acceptance

Current-source isolated Chromium passed one focused-period Reopen mutation and a separate historical Export view after reload. Guarded PostgreSQL confirmed only the intended period advanced to DRAFT version 2, the other period stayed version 1, all three Shifts stayed version 1 and the original PUBLISHED snapshot stayed at publication version 1. No application code changed in this continuation; the prior full frontend 167/167 and backend real-PostgreSQL 132/132, lint and builds remain the current application gates.

## 2026-10-15 inactive-role republish gate

A new real-PostgreSQL red test resolved to a second publication before the fix; it now passes. The existing publication-history test was aligned with the stricter rule and still proves historical snapshot stability. Full backend: 22/22 files, 133/133 tests on a guarded disposable local PostgreSQL schema with `RUN_DATABASE_TESTS=1`; backend TypeScript and production build including Prisma generation passed. Current-source Chromium passed the rejected republish and historical snapshot check. After stopping only verified Roster backend listeners for the Windows Prisma DLL, the normal 4020 service was restarted from source; health returned `database=true,evaluateMolly=true` and frontend 5176 returned HTTP 200. Exact QA schemas/services were cleaned.

## 2026-10-15 Availability failure isolation gate

Red `calendarLoad` tests showed the unused Availability fetch was called and a 503 rejected the whole Calendar snapshot. After removing that dependency, focused 7/7 and full frontend 28/28 files, 168/168 tests passed; ESLint and production build passed. Current-source Chromium verified Calendar availability under injected 503, ShiftDialog save blocking and successful Retry. Guarded PostgreSQL verified zero data change. Backend source and schema were unchanged in this checkpoint; the latest backend real-PostgreSQL gate remains 133/133 from the preceding republish fix.

## 2026-10-15 Week Availability row gate

Focused pure-projection/component tests passed 23/23, covering midnight/DST clipping, recorded versus unknown status, independent read failure/Retry and marker click. Full frontend passed 29/29 files and 172/172 tests, ESLint and production build. Current-source isolated Chromium verified 503 isolation, Retry, cross-midnight markers, marker Add/Cancel and reload; guarded PostgreSQL verified only intended Availability test rows and unchanged Shift/period/publication state. Backend source was unchanged; latest backend isolated real-PostgreSQL suite remains 133/133.

## 2026-10-15 500-person Availability overlay performance

No application code changed in this continuation. Current-source generated-ADMIN Chromium on isolated paired schemas loaded 500 employees/5,000 Shifts/2,500 Availability rows, rendered 60 initial rows/300 badges, searched employee 0499 and canceled a multi-second pointer drag with zero Shift requests. The second local load was 2,178 ms; three-request API medians were Calendar 511 ms and Availability 96 ms; 364 drag rAF intervals had p95 16.7 ms and zero over 33.3 ms. Guarded PostgreSQL confirmed unchanged versions/counts and canonical assignment. The latest unchanged frontend full gate remains 172/172, ESLint/build; backend real-PostgreSQL 133/133. Physical store-device and sustained-load validation remain open.

## 2026-10-15 fall-back Availability integrity gate

Red frontend projection test reproduced `02:30–02:30` for two distinct Sydney instants; offset-aware labels now pass. Red isolated PostgreSQL test proved a 25-hour fall-back Availability row passed the old wall-clock-only bound; the transaction now rejects it. Focused frontend 24/24 and backend cross-day 5/5 passed; full frontend 29/29 files, 173/173 tests, ESLint/build and backend real-PostgreSQL 22/22 files, 133/133 tests, TypeScript/build passed. Current-source Chromium verified both HTTP 400 refusals, a valid offset-changing save, marker click/Cancel and reload; guarded DB found no Shift/publication mutation. Normal Roster backend restarted from current source and health reported database/Evaluate true.

## 2026-10-15 Staff fallback occurrence gate

Red `src/lib/availability.test.ts` exposed lost occurrence and missed 25-hour draft validation; fixed tests 12/12. Updated real-PostgreSQL cross-day test 5/5 confirms exact first-to-second repeated-clock save and 25-hour refusal. Full frontend 29 files/175 tests, ESLint, TypeScript/production build; backend isolated PostgreSQL 22 files/133 tests and Prisma generation/TypeScript/production build passed. A first full backend run concurrent with browser activity timed out once on Copy Day's 500-row test at 5 seconds; the focused Copy Day 9/9 and subsequent serial full 133/133 passed. Generated-ADMIN Chromium Staff save/reload and direct PostgreSQL exact row/count checks passed. Normal 4020 restarted from source, health database/Evaluate true, frontend 5176 HTTP 200. No migration or Evaluate change.

Follow-up browser negative-path expansion passed on fresh paired disposable schemas: nonportable template attempt showed refusal and sent no POST; 25-hour next-day draft disabled Save and sent no Availability PUT. Direct PostgreSQL retained one exact hour, three Shifts and one publication. The updated Week badge browser script passed the still-invalid 25-hour API request and label/reload checks. Only QA script assertions and documentation changed; the preceding application test/build gate remains current.

## 2026-10-15 Availability stale-write gate

Red isolated PostgreSQL test proved that two editors reading an empty date could silently overwrite one another. The store-locked transaction now rejects a stale `expectedRows` snapshot before delete/insert; focused backend route and cross-day tests passed 52/52. Frontend Staff regression confirms 409 retains the draft, blocks repeat Save and unlocks only after explicit reload. Full frontend 29 files/176 tests, full backend real-PostgreSQL 22 files/135 tests, ESLint and both production builds passed. Two independent browser contexts produced an actual 409 and correct winner reload; direct PostgreSQL confirmed one winning row, original Shifts and publication. Normal 4020 health database/Evaluate true and 5176 HTTP 200 after restart. No migration or Evaluate change.

## 2026-10-15 Staff delayed-response gate

Added a frontend regression for save -> employee switch -> return to the same employee -> late save success. Full frontend 29 files/177 tests, ESLint and production build passed. Generated-ADMIN Chromium held a committed Availability PUT response, loaded a newer same-employee row and released the old response: the 10:00 value remained visible and survived reload. Direct disposable PostgreSQL confirmed one newer row, three unchanged Shifts and one publication. The backend application, schema and Evaluate code did not change after the preceding 135/135 real-PostgreSQL gate.

## 2026-10-15 Copy Day preview freshness gate

Red browser run showed a stale Copy Day preview after the target date changed during the request. Corrected current-source Chromium discarded that response and accepted a new preview for the displayed 9 -> 11 October dates. Direct PostgreSQL retained three Shifts, two periods, one publication and no target-day writes. Full frontend 29 files/177 tests, ESLint, TypeScript/production build and diff check passed. Backend application code was unchanged; latest isolated real-PostgreSQL suite remains 135/135.

## 2026-10-15 Repeat Shift preview freshness gate

Red frontend component test reproduced an obsolete preview after the repeat end date changed during the request; the corrected 3/3 focused tests passed. Current-source Chromium discarded the held old response, required a fresh preview for target dates 10/16/17 October and emitted zero Repeat mutation requests. Direct disposable PostgreSQL retained three Shifts, two periods, one publication and source version 1. Full frontend 29 files/178 tests, ESLint, production build and diff check passed. Backend application code was unchanged; latest real-PostgreSQL suite remains 135/135.

## 2026-10-15 Settings store scope and timezone matrix

Red-green `src/pages/SettingsPage.test.tsx` checks late cross-store read and save responses. Full frontend: 30 files, 180 tests passed; ESLint and production TypeScript/Vite build passed. Current-source generated-ADMIN browser run in fresh paired disposable schemas passed `scripts/qa-settings-cross-store-load-browser.py`; guarded PostgreSQL verifier `backend/scripts/verify-settings-cross-store.ts` found only store B's intended version 2 edit and unchanged Shifts/publication. `scripts/audit-australia-timezone-parity.ts` compared frontend Luxon and backend Intl conversion for 2,880 quarter-hour cases across Sydney, Melbourne and Adelaide on normal and DST dates: agreement in all cases, 24 nonexistent local clocks. No backend code or migration changed after the latest 135/135 isolated real-PostgreSQL backend gate.

## 2026-10-15 Templates store scope

`src/pages/TemplatesPage.test.tsx` passed two regressions for late A/B reads and a late A mutation response after switching to B. Full frontend 31 files/182 tests, ESLint and production build passed. Fresh paired disposable browser/DB acceptance passed `scripts/qa-templates-cross-store-load-browser.py` and `backend/scripts/verify-templates-cross-store.ts`: only B's version changed, with original Shift/publication counts intact. Backend application code unchanged; latest isolated backend real-PostgreSQL suite remains 135/135.

## 2026-10-15 Copy Shift target Calendar preflight

Full frontend suite 31 files/182 tests, ESLint and production build passed after the target Calendar change. Isolated Chromium `qa-copy-shift-target-context-browser.py` passed published-target and 503/retry zero-write paths, with guarded PostgreSQL baseline intact. In a separate fresh paired fixture `qa-copy-shift-target-positive-browser.py` passed Copy Shift to another employee/date and reload; direct `verify-copy-shift-target-context.ts` found one exact new Shift, unchanged published period/publication. The final current-source rerun passed 31 files/182 tests, ESLint, production build and diff check. Backend application/schema/Evaluate code unchanged; latest isolated real-PostgreSQL backend suite remains 135/135.

## 2026-10-15 offscreen Copy Shift conflict evidence

Guarded `seed-copy-target-conflict-browser.mjs` prepared a fresh paired disposable fixture; generated-ADMIN Chromium conflict/reassignment browser script passed, and direct PostgreSQL `verify-copy-shift-target-conflict.ts` passed with exactly two target Shifts, DRAFT version 2, unchanged source/PUBLISHED versions and one publication. No application code changed since the prior full frontend 31/182, ESLint and production build gate; no new backend/migration/Evaluate change. Both exact schemas and temporary listeners were cleaned.

## 2026-10-15 fall-back TimeGrid resize correction

Red browser evidence: a 30-minute bottom resize changed the persisted end by 90 minutes because FullCalendar omitted `oldEvent.end` at equal first/second 02:30 wall clocks; `endDelta` was correctly 30 minutes. Four `calendarResizeInstants` regressions cover bottom/top DST deltas, ordinary increments and calendar-day fallback. Full frontend 32 files/186 tests, ESLint, TypeScript/production build and diff check passed. Fresh paired disposable Chromium passed both resize edges, full-card move and a 422 Availability rollback; guarded PostgreSQL confirmed exact UTC times/versions and unchanged publication. Backend application/schema/Evaluate code unchanged; latest isolated backend real-PostgreSQL suite remains 135/135.

## 2026-10-17 Published employee rename regression

Red component test: published card announced current `Alex Now` instead of frozen `Alex Before`. Fix passed 12/12 focused tests and full frontend 35 files/223 tests, ESLint and production build. Paired disposable current-source Chromium checked current Evaluate `Renamed Bob` versus frozen published `Regular Bob` in row, card, detail and after reload; zero Roster writes. Guarded Prisma confirmed both published snapshots unchanged and Shift version 1. Screenshot: `docs/evidence/calendar-published-employee-rename-2026-10-17.png`. Initial browser harness failed only because reload reset the employee-row toggle; corrected rerun passed. No migration or backend/Evaluate code change.

## 2026-10-17 Historical-name search regression

A red Week employee-row component assertion showed searching a published assignment's old name after Evaluate renamed an active employee returned no row. The per-employee published-name index fixed that lookup without changing the current row heading. Focused 12/12, full frontend 35 files/223 tests, ESLint and production build passed. Paired disposable Chromium, direct PostgreSQL and reload verified old-name search, frozen card/detail, zero Roster writes and unchanged publication. Screenshot: `docs/evidence/calendar-published-name-search-2026-10-17.png`. No migration/backend/Evaluate source change.
## 2026-10-21 Day-first toolbar checkpoint

`npm test -- --run src/lib/calendarLocation.test.ts src/components/calendar/CalendarViewSwitch.test.tsx`: 2 files, 3 tests passed. `npm run build`: TypeScript build and Vite production bundle passed. `npm run lint`: passed. Browser smoke evidence is in `docs/ROSTER_BROWSER_QA.md`; no database write, schema migration or Evaluate/BHS change was made in this checkpoint.

## 2026-10-21 Day grid geometry follow-up

After the Day header and toolbar/legend adjustment, `npm test -- --run` passed **39/39 files, 256/256 tests**; `npm run lint` and `npm run build` passed. Current-source isolated Chrome click-create, drag-create, grouped-card click and Month/Week/Day switching passed the visible UI checks recorded in `docs/ROSTER_BROWSER_QA.md`. This visual-layout change added no migration, API contract or Evaluate source change. Temporary browser, ports and paired schemas were cleaned.

## 2026-10-21 Copy entry simplification and resize observation

After removing the redundant Copy scope dialog, `npm test -- --reporter=dot` passed 39/39 files and 256/256 tests; `npm run lint` exited 0; `npm run build` passed TypeScript and Vite production build. Disposable Chrome directly opened Copy Day from More, blocked copying five synthetic unverified formal-role cards at preview, and left Save disabled. Guarded direct PostgreSQL verification retained 8 Shifts, 1 publication and unchanged versions. A 430 ↔ 3093 CSS px browser resize settled to the outer grid width on the next observation without reload. No backend application, migration or Evaluate source change.

After hiding the redundant one-choice Store selector, the frontend suite again passed 39/39 files and 256/256 tests, ESLint exited 0, and TypeScript/Vite production build passed. A new isolated browser checked two-store ADMIN selector present and one-store STORE_EVALUATOR selector absent. No backend, migration or Evaluate source change.


## 2026-10-21 Month empty-state correction

2026-10-21 sidebar range guard: current-source frontend Vitest 40 files/266 tests, ESLint and production build passed. `scheduledShiftSummary.test.ts` covers the far-year rejection and a valid 13-day selection. Fresh disposable Chromium checked the visible message, retained selection, zero extra Calendar reads and zero Roster writes. `boundedScheduledDateSelection` checks span before building the date set. No backend, schema or Evaluate source changed.

Frontend Vitest 40 files/265 tests, ESLint and `npm run build` passed. Fresh paired disposable Chromium/PostgreSQL Month regression passed with `emptyMonthHint=true`, save/reload, canonical employee and exact UTC persistence, and unchanged published data. The QA script was updated for compact event cards and the secondary More-menu entry. No backend source, migration or Evaluate source changed in this follow-up; the preceding full backend 28 files/215 real-PostgreSQL gate remains the latest backend suite.

## 2026-10-21 mixed Script preview atomicity wording

A new component regression failed red when a preview contained Monday CREATE and two Tuesday CONFLICT rows because the UI said `新增 1` without explaining that no record would be saved. After the UI fix, focused `PresetTimeSlotScriptDialog.test.tsx` passed **6/6**. Full frontend Vitest passed **44 files / 298 tests**, ESLint passed and TypeScript/Vite production build passed. Normal current-source Chrome showed `候选新增 1 · 不变 0 · 冲突 2`, the whole-import zero-write message, and disabled `请先修正冲突`; Cancel closed the draft with zero console errors. Guarded before/after local PostgreSQL digests matched exactly. Backend source/schema/Evaluate were unchanged; the existing parser/real-PostgreSQL guards for duplicate days were inspected, not rerun in this UI-only change. BHS Convert was observed read only and cancelled; its Submit effect is still unverified.



## 2026-10-21 Day publish preflight regression

`src/lib/calendarPublish.test.ts` added three assertions: current formal role/active employee passes; a legacy `验收岗` role blocks without rewriting the Shift; unassigned, inactive and cross-store employee cases block. Focused 3/3 passed. Full frontend `npm test` passed **45 files / 301 tests**; `npm run lint` exited 0; `npm run build` passed TypeScript and Vite production bundle. Normal Chrome verified the disabled Publish button and exact visible reason, saved-card drag inert, blank-grid drag Add 10:00–11:30 and Cancel. Guarded Hurstville DB digests for Availability, imports, Shifts, periods, publications and shortcuts were unchanged. Backend source/schema/Evaluate were not changed by this fix; latest isolated backend real-PostgreSQL full gate remains 28 files/215 tests from the preceding checkpoint, not rerun here.

## 2026-10-21 formal Job current-grant display

`FormalJobCatalog.test.tsx` passed 4/4: active same-store canonical position IDs determine counts; an Evaluate read failure shows unknown rather than zero; a late prior-store response cannot populate the next store; and stale job names stay hidden while the new store loads. Focused catalog plus Settings page passed 17/17. Full frontend `npm test` passed **46 files / 305 tests**, `npm run lint` exited 0, and `npm run build` passed TypeScript/Vite. Normal Hurstville Chrome showed the six live counts and zero-grant explanation; console errors 0. Guarded PostgreSQL SHA-256 baseline remained unchanged for Availability, Script imports, Shifts, periods, publications and shortcuts. No backend/Evaluate code or migration changed. Current backend full isolated real-PostgreSQL gate remains the earlier 28/215 pass; it was not rerun for this frontend read-only addition.

## 2026-10-21 Day eligible-staff filtering

One red ShiftDialog test showed choosing a formally associated Job still displayed an employee with only a matching skill and no formal authorization. The revised picker shows current Job/Availability/conflict candidates by default and retains an all-staff diagnostic toggle; a second test protects an existing assignee whose present qualification has changed. Focused ShiftDialog 28/28, full frontend 46 files / 306 tests, ESLint and TypeScript/Vite production build passed. Normal local Chrome confirmed 10:00–10:30 Add draft, formal 全岗 candidate count 0/25, diagnostic expansion and Cancel. Console errors 0. Read-only Hurstville PostgreSQL fingerprint matched previous baseline for Availability 14, Script imports 0, Shifts 13, periods 3, publications 2 and shortcut version 1. No backend, Evaluate application or migration changed; earlier backend 28/215 isolated real-PostgreSQL pass was not rerun for this UI-only change.

## 2026-10-21 Availability Script uncertain commit

Frontend `npm test -- --run --reporter=dot`: 46 files, 308 tests passed. Focused `PresetTimeSlotScriptDialog.test.tsx`: 8/8 passed, including a lost first success response and two uncertain responses. `npm run lint`, `npm run build` and `git -c core.safecrlf=false diff --check` passed. Current-source isolated Chromium/PostgreSQL test passed: 2 identical Import requests after one malformed committed HTTP 200 response, 2 Availability rows and 1 audit. Real Hurstville read-only fingerprints matched the previous baseline; normal frontend HTTP 200 and backend services healthy. No backend, migration or Evaluate change in this pass.

## 2026-10-21 Day unselected-Job picker

Red regression: a new verified-Job Day shift displayed every store employee before a Job was selected. After the scoped candidate-list change, `ShiftDialog.test.tsx` passed 29/29 and full frontend Vitest passed 46 files / 309 tests. ESLint, TypeScript/Vite build and `git diff --check` passed. Normal Chrome observed 09:00–09:30 Add prefill, empty initial candidate list, recomputation after choosing 全岗, Cancel and zero console errors. Hurstville guarded data digests remained unchanged. BHS reference Add draft showed 09:00–09:30 and Shift Staff (0), then was cancelled. No backend or Evaluate change.

Day picker follow-up gate after guarding all-staff diagnostic assignment: focused ShiftDialog 30/30; full frontend 46 files / 310 tests; ESLint and TypeScript/Vite build passed. Normal Chrome showed unqualified rows disabled and zero selected staff; Cancel caused no write. Guarded Hurstville digests matched baseline. No backend/Evaluate or migration change.

Employee-row preselection formal-Job gate: red regression demonstrated that a preselected employee without the newly chosen exact Evaluate Job was still saveable in the modal. After the inline blocker and disabled Save, focused ShiftDialog 31/31 and full frontend 46 files / 311 tests passed. `npm run lint`, `npm run build`, and `git -c core.safecrlf=false diff --check` passed. Normal Chrome showed HandoverEmployee018's 全岗 mismatch and disabled Save, then Cancel; console errors zero. Read-only local Hurstville fingerprints exactly matched the previous baseline (14 Availability, 0 Script imports, 13 Shifts, 3 periods, 2 publications and shortcut v1). Frontend HTTP 200 and backend health `database=true,evaluateMolly=true`. No backend, Evaluate source or migration changed in this UI-only gate.

BHS qualified-but-unavailable Day candidate gate: a red `ShiftDialog` test showed only one of two formally qualified employees because the other lacked covering Availability. After separating formal-holder visibility from schedulability, focused ShiftDialog passed 32/32; full frontend passed 46 files / 312 tests. ESLint, TypeScript/Vite production build and `git diff --check` passed. Normal Molly Day showed its one current 全岗 holder, disabled for unknown Availability, after the equivalent read-only BHS Add draft showed seven formal holders with six disabled. Both drafts were cancelled; no Save/Submit. Browser console errors zero. Guarded local Hurstville availability, shift, period, publication and shortcut hashes stayed identical to the protected baseline. No backend, migration or Evaluate source change.
## 2026-10-21 exact formal employee Job authorization

Backend route and service regressions now cover a skilled employee with no formal Job grant and unqualified Batch/Publish. Final `npx tsc -p tsconfig.json --noEmit` passed. Fresh migrated disposable PostgreSQL schema `codex_roster_backend_test_1792554768977_0701` ran `RUN_DATABASE_TESTS=1 npm test -- --maxWorkers=1 --testTimeout=20000`: **29 files/243 tests passed**; the schema was cleaned by the guarded script. `git diff --check` exited 0, with line-ending notices only. Current normal 4020 health has both dependencies true and 5176 returned 200. Guarded normal Hurstville fingerprint was unchanged: 14 Availability, 0 imports, 13 Shifts, 3 periods and 2 publications, with all previous content digests equal. This is API/service and database evidence, not a new browser Save acceptance on a real store evaluator account.

The frontend now renders a specific formal-grant error message. Full Vitest **46 files/313 tests**, ESLint and TypeScript/Vite production build passed. Signed-in normal Chrome opened one Day 10:00–10:30 draft; selecting 全岗 showed HandoverEmployee006 as a formal holder disabled for unknown Availability, Save with no employee produced an inline validation message, Cancel closed the draft, and console errors were zero. This was a no-write browser check; the backend 422 path is covered by direct API route regressions and service tests, not by a normal-store browser Save.

Final follow-up backend suite after Move and Copy Week grant-loss regressions: fresh migrated real PostgreSQL schema `codex_roster_backend_test_1792555035349_c92d`, **29 files/245 tests passed**, exact schema cleaned. Backend TypeScript and `git diff --check` passed. Normal Hurstville business-table counts and digests remained unchanged after the browser smoke test.

## 2026-10-21 Day slot and compact toolbar

Frontend `npm test -- --run`: **46 files / 313 tests passed**. `npm run lint`: exit 0. `npm run build`: TypeScript and Vite exit 0, 2258 modules transformed. `git diff --check`: exit 0 (line-ending notices only). Normal signed-in Chrome at a controlled 1600 × 1000 CSS viewport verified equal 20px half-hour rows, click Add 10:00–10:30 and drag Add 10:00–12:00; both drafts cancelled. Read-only PostgreSQL audit preserved 14 Availability, 0 imports, 13 Shifts, 3 periods, 2 publications and shortcut v1, with all previous SHA digests equal. No backend source or migration changed in this visual/selection pass; the earlier isolated backend 29/245 result was not rerun.

## 2026-10-21 compact Day Add/Edit modal

Focused `ShiftDialog.test.tsx`: **32/32 passed**; existing template overnight/daytime switching regression was updated for the accessible preset dropdown, and verified-Job initial staff controls are asserted hidden until the diagnostic list is opened. Full frontend `npm test -- --run`: **46 files / 313 passed**. `npm run lint`, `npm run build` (TypeScript plus Vite, 2258 modules), and `git -c core.safecrlf=false diff --check` all exited 0. Normal Chrome verified 1600 × 1000 modal bounds 1280 × 800, visible Save, preset AA clocks/break, Job-dependent employee search/candidate row, and 430 × 900 no horizontal overflow. Both reference and local drafts were cancelled; BHS was read only. Normal Hurstville read-only PostgreSQL fingerprint exactly matched all prior Availability, import, Shift, period, publication and shortcut hashes. No backend/migration/Evaluate code was changed, so the historical isolated backend 29/245 result was not rerun for this UI pass.
