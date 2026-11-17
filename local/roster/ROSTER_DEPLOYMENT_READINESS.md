# Molly Roster Deployment Readiness

## 2026-10-21 latest gate: no silent timezone in Calendar/export

Follow-up on real legacy Green Square data: two published snapshots lack a frozen timezone. Their current export remains disabled without settings, but the immutable history links remain available; actual local Chrome print labels dates/times as UTC in Chinese. Final backend fresh PostgreSQL **238/238**, current-source production build and restarted database/Evaluate health passed after this wording fix. This did not alter old snapshots or grant employee roles.

Unconfigured stores can no longer display legacy Shift dates as Sydney or generate current draft CSV/print in an assumed timezone. Copy with source Shifts and publication require settings. Calendar, Staff and Export guide setup and block time-based actions when settings are absent; a legacy published snapshot with no timezone is explicitly marked UTC. Backend real-PostgreSQL **238/238** and frontend **295/295**, both production builds, frontend lint, Prisma Validate/migration status and live database/Evaluate health passed. Configured Hurstville Day click/drag, Export and Staff were browser checked without saving. A read-only Green Square pass verified missing-settings Day warning and 409 for historical Shifts, no current export links, and disabled Availability controls. Normal data digests were unchanged. This is still **NOT READY FOR INTERNAL PILOT**: no real STORE_EVALUATOR/device acceptance, and BHS server Submit semantics remain unverified. A legacy store with existing data but missing timezone needs supervised reconciliation before use.

## 2026-10-21 timezone setup remains a required store onboarding step

Script Preview/Commit, Shift validation and manual Availability writes now reject missing store timezone settings with 409 instead of silently using Sydney. A disposable real PostgreSQL suite passed 29 files/235 tests, including zero-write checks; its schema was cleaned. Normal Hurstville has explicit Sydney settings (30-minute minimum, version 3), and the current-source Day Add opens and cancels normally with no data change. Frontend guidance for an unconfigured store, read/export fallback behavior, real STORE_EVALUATOR/device acceptance and BHS Submit semantics remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Day 30-minute browser persistence gate

Fresh disposable Evaluate/Roster PostgreSQL and local Chrome verified empty Day click -> 13:00-13:30 Add -> synthetic formal role/available employee selection -> one UI Save -> reload -> saved-card Edit. Direct Prisma confirmed one new Shift/assignment, exact UTC endpoints, draft version increment and unchanged published snapshot. Exact QA services and schemas were removed; normal 5176/4020 remains healthy. This closes the synthetic Molly browser persistence gap. **NOT READY FOR INTERNAL PILOT:** real STORE_EVALUATOR/store-device acceptance and BHS server Submit parity remain unverified.

2026-10-21 Day minimum follow-up: A guarded, backed-up local Hurstville settings update changed the minimum Shift from 60 to 30 minutes (version 2→3), matching the observed BHS 30-minute frontend grid and staged Add behavior. The normal local Chrome Day 09:00 blank click now opens 09:00–09:30 Add; Cancel wrote no Shift. Direct PostgreSQL checks retained 13 Shifts, 23 assignments and two publication IDs/versions. Backend TypeScript passed. A fresh disposable real-PostgreSQL service save persisted exactly one 30-minute Shift and canonical fixture assignment with unchanged publication, then its schema was cleaned. Browser UI Save/reload, BHS server Submit behavior, real STORE_EVALUATOR/device and employee grants remain open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21 Settings follow-up: BHS Job Info remains six jobs (read only). The local Hurstville Settings page now presents the six Evaluate-backed formal jobs before a closed historical-draft review disclosure; opening it retains links to the 11 legacy-role draft Shifts. Normal Chrome verified the disclosure and zero page errors; new Roster roles still have zero Shift/template references and `验收岗` remains inactive with eight historical drafts. Frontend 44 files/291 tests, ESLint and production build passed, normal frontend/API health passed. No DB/schema or BHS data changed in this frontend step. Real STORE_EVALUATOR/device and employee grants remain open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: Local Hurstville now has six Evaluate formal job definitions and six code-associated Roster Shift Roles after two guarded local role inserts. The two Roster roles have no Shifts/templates; all four newly added Evaluate definitions still have zero employee grants. Hurstville 13 Shifts/23 assignments/2 publications were unchanged; legacy QA role history was retained. BHS blank Day gestures confirmed 30-minute down/up selection in cancelled forms; reference data was not modified. Normal local ADMIN Chrome Day showed six roles and a 09:00–10:30 blank-drag draft, then Cancel. Settings now says “已关联排班岗位” for the six associations rather than implying shifts exist. Frontend 291/291, lint and production build passed. Real STORE_EVALUATOR/device and employee grants/skill rules remain unverified. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: BHS Hurstville Job Info and Day edit controls were observed read only. Local Evaluate now has the four additional formal job definitions with zero employee grants; no BHS write or schema migration occurred. Molly Day's Copy/Repeat actions are secondary in the saved Shift editor; current-source browser and guarded disposable PostgreSQL confirmed both entry paths, Cancel, zero writes and unchanged publication. Frontend 290/290, lint and production build passed. Real employee job authorizations, target STORE_EVALUATOR and physical device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: Day saved-card click-edit, reload and two-session stale-version rejection passed in current-source Chromium plus disposable PostgreSQL. Direct DB retained canonical employee and unchanged published history. Toolbar/gesture browser regression passed 12 blank selections, two saved-card drag attempts and zero writes; Copy is secondary and absent from the top row. QA listeners/schemas cleaned and normal frontend 5176/API 4020 healthy (`services.database=true`, `services.evaluateMolly=true`). Real STORE_EVALUATOR/device and BHS saved-operation gates remain open. **NOT READY FOR INTERNAL PILOT.**


2026-10-21: Day's stacked scheduled sidebar now opens within view on 640px and 1000px layouts; the pre-fix heading was y=2429px on narrow Chrome, then y=84px after the fix. Narrow click-create, blank drag-create and saved-card click passed in current-source synthetic Chromium with zero writes/page errors and unchanged disposable PostgreSQL periods/publication. Frontend 44 files/289 tests, ESLint/build passed; QA schemas/listeners cleaned, normal 5176/4020 healthy. BHS mobile interaction and real STORE_EVALUATOR/device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: Unknown Script nicknames ending in punctuation now reach explicit canonical-employee mapping when joined directly to weekday codes. Synthetic Chromium/PostgreSQL committed seven exact Availability rows with unchanged Shift/publication state; full backend disposable-PostgreSQL suite 29 files/226 tests, TypeScript and Prisma Validate passed. QA services/schemas cleaned, normal frontend/API healthy. The Windows BHS browser observation was stopped by URL-confidence policy; BHS Submit behavior, formal Job reconciliation and real STORE_EVALUATOR/device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: Fixed the shared Dialog's focus restoration scrolling Day back to the below-grid sidebar toggle after cancelling Add. A red/green 1600×1100 browser check kept the 08:00 slot at y=509.125px before/after Cancel and verified immediate blank drag 08:00–09:30 plus saved-card click, zero Roster mutations/page errors and unchanged disposable PostgreSQL versions/publication. Frontend 44 files/289 tests, lint/build passed. BHS exact Cancel behavior and real STORE_EVALUATOR/device acceptance remain unverified; formal Job catalog reconciliation is open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: Day scheduled-sidebar opening now restores the time grid to the viewport top. A red/green current-source Chromium check measured y=-154px before and y=137px after at the BHS reference viewport, with y=129px at a common 1600×1100 desktop. Five synthetic Shift/employee cards, zero Roster mutations/page errors and unchanged disposable PostgreSQL versions/publication were verified. Frontend 44 files/289 tests, ESLint/build passed; exact QA services/schemas cleaned, normal 5176/4020 healthy. BHS saved actions, formal Job reconciliation and real STORE_EVALUATOR/device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: Name-first Script Import now accepts ordinary punctuation in Evaluate employee names while continuing to reject control/format characters and invalid code tokens. Disposable Chromium/PostgreSQL passed Preview/Commit/repeat for a synthetic punctuation-named employee with unchanged baseline Shifts/publication. Full backend real-PostgreSQL 29 files/225 tests, TypeScript emit and Prisma Validate passed; three exact QA/test schemas and listeners cleaned. BHS Submit semantics, formal Job mapping and real STORE_EVALUATOR/device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: The personal Staff Script now sends the selected Evaluate employee's actual name with codes and retains canonical-ID binding. A synthetic alias-name collision passed disposable Chromium Preview/Commit/repeat and direct PostgreSQL integrity checks. Frontend 44 files/289 tests, lint/build and backend TypeScript no-emit passed; temporary schemas/listeners cleaned. No BHS or normal-store write. Real STORE_EVALUATOR/device, formal Job reconciliation and BHS Submit semantics remain open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: Store-local Export year selection and immediate stale-link clearing passed 6 focused tests, frontend 44 files/288 tests, lint/build and disposable Chromium at a Sydney/Adelaide New Year boundary. Calendar toolbar was browser-checked as Day-first with Copy outside the top row. Script-import focused backend tests passed 97/97. No migration or normal-store/BHS write; QA services and schemas were cleaned. Real STORE_EVALUATOR/device, formal Job reconciliation and BHS saved-operation semantics remain open. **NOT READY FOR INTERNAL PILOT.**

2026-10-21: Current-source disposable Chromium caught and verified a Day/Week saved-card double-click dialog stability fix. One appropriate Edit or grouped-chooser dialog remains visible; saved-card dragging and dialog cancellation produced zero Shift writes. Direct PostgreSQL retained baseline Shifts, period versions and publication. Full frontend 44/286, lint and production build passed; exact QA listeners/schemas cleaned. No migration or Evaluate/BHS/normal-store write. Formal Job mapping, BHS saved semantics and real `STORE_EVALUATOR`/device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Day scale checkpoint

Disposable current-source Day loads at 50/100/500 employees and up to 5,000 Shifts took 902/912/1,453 ms in one headless Chromium sample per size, with 20 first-page cards and no writes/errors. A 500-person blank-grid canceled drag sampled 362 rAF intervals at 16.7 ms median/p95, none above 33.3 ms; direct PostgreSQL retained all benchmark data and baseline versions. Actual store-device sustained performance and authorized evaluator acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 overnight Day/sidebar checkpoint

The Scheduled Shift mini-calendar now marks overnight continuation dates without changing the existing start-date work-hour attribution. Fresh disposable browser/PostgreSQL verified 31 October–1 November display, explicit next-day explanation, zero writes and unchanged versions. Frontend 43/280, lint and production build passed; the 5,000-Shift dot calculation sampled 4.44 ms median locally. BHS's hour allocation, real store evaluator/device and formal Job reconciliation remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Day gesture and formal Job gate

Fresh disposable Day/Week browser regressions passed click-only saved cards, blank-grid click/cancellation and zero writes, with direct PostgreSQL preservation of three Shifts and one publication. Copy Day preview is now restricted to its originating store in the frontend in addition to backend authorization. Full frontend 43/278, lint and build passed. Current read-only Evaluate Hurstville still has only two active formal Job definitions versus six observed in BHS; no official qualification was invented. Target real evaluator/device, business Job reconciliation and BHS saved-operation acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 automatic Copy Day preview checkpoint

The secondary Copy Day dialog now checks dates automatically while retaining server conflict/version checks and an explicit retry. Fresh disposable Chromium/PostgreSQL passed stale preview rejection, injected 503 fail-closed recovery, Cancel zero-write and unchanged publication. Frontend 43/278, lint and production build passed. No schema or Evaluate source change. Real STORE_EVALUATOR on the target environment, formal Job catalog reconciliation, BHS saved-operation behavior and store-device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 manual multi-date Availability checkpoint

New Staff multi-date manual entry passed frontend 43/278 tests, lint and isolated Chromium/PostgreSQL Save/Cancel/concurrency checks. The existing store-scoped transaction rejected a stale competing date with 409; direct PostgreSQL retained the winner and the unchanged baseline Shift/publication counts. No real store or BHS data was touched. BHS Submit semantics, authoritative formal Job catalog, real STORE_EVALUATOR/device acceptance and wider parity gates remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Day and local-default checkpoint

Day top controls now visually group date navigation; Copy remains in the lower secondary menu. Synthetic current-source browser verified blank click and drag create correct unsaved clocks, then Cancel left 0 Shifts. A guarded local Hurstville default-break update 30→0 (version 1→2) was backed up and verified against all other stable settings and unchanged 13 Shifts/2 publications. Frontend build and backend TypeScript passed. Hurstville's 60-minute minimum and 09:00 opening still differ from the observed BHS 30-minute 08:00 draft; BHS saved behavior, authoritative formal Job catalog, and real STORE_EVALUATOR/device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Day drag-create persisted-chain checkpoint

Fresh disposable current-source Chromium/PostgreSQL rechecked Day blank drag 10:00–11:30 through one Shift POST, one saved row, reload and click-to-edit, exact UTC and canonical employee; the published fixture Calendar remained identical. The final run used a synthetic STORE_EVALUATOR for Calendar actions; ADMIN only bootstrapped isolated test data. The QA script now guards these invariants. No product, migration, Evaluate or BHS data change. Test services/schemas cleaned and normal 5176/4020 healthy. This narrows Day acceptance evidence but does not replace a **real** STORE_EVALUATOR/device trial, resolve formal Job data, or establish all BHS saved semantics. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Preset Shift break/default checkpoint

Signed-in BHS Setting → Preset Shift was observed without saving: 0–120-minute break choices every 15 minutes and an unsaved appended 09:00–22:00 / 0 row. Molly's template and Day Shift forms now expose the observed break range, preserve legacy stored values, and default new templates to 09:00–22:00 / 0. Current-source disposable Chromium and paired PostgreSQL verified that default, a 120-minute template, Day application, one saved/reloaded Shift with exact UTC/canonical employee and zero page errors. Frontend 41/269 tests, ESLint and production build passed. Temporary services/schemas cleaned; normal 5176/4020 healthy. No migration, backend/Evaluate product change or BHS data write. Real STORE_EVALUATOR/device acceptance, official Hurstville Job mapping and BHS saved-operation semantics remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 formal job catalog gate

Current read-only database evidence finds six Hurstville Job labels in BHS but only two active formal jobs in Evaluate (全岗, 带训员), with one distinct active employee formally assigned. Roster's inactive 验收岗 still appears in eight historical DRAFT Shifts; these records were preserved. No automated label matching can safely grant the missing Evaluate qualifications or repair the old Shifts. Day blank drag and saved-card click were reconfirmed in BHS with both unsaved dialogs cancelled; Molly's corresponding local behavior has prior browser/DB evidence. Fresh frontend 265/265, backend disposable PostgreSQL 215/215, lint/build/TypeScript/Prisma gates passed and normal services remained healthy. Real store evaluator/device acceptance and authoritative job reconciliation remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Scheduled Shift navigation gate

Read-only BHS reference and current-source isolated Chrome verified direct month/year navigation, week-number labels and preservation of the selected range and main Day. Direct PostgreSQL found unchanged fixture Shifts, assignments and publication; frontend 40 files/262 tests, lint and build passed. QA schemas/services were removed and normal 5176/4020 remained healthy. Full reference visual capture, overnight-hour attribution, historical Job mapping and real store evaluator/device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Scheduled Shift formal Job gate

The optional panel now takes Job filters only from Evaluate-verified formal roles, while retaining old draft Shifts as explicitly historical Worklog entries and published snapshots as frozen names. A generated-STORE_EVALUATOR isolated browser with an old QA Shift role and no Evaluate QA Job showed no false checkbox; guarded PostgreSQL verified 3 unchanged Shifts, 3 assignments and 1 publication. Frontend 40 files/262 tests, lint and build passed; exact QA schemas/services were cleaned. Real Hurstville legacy-role mapping and real account/device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Scheduled Shift range gate

Read-only BHS evidence established continuous inclusive date-range selection in its right mini-calendar. Molly's side panel now applies that behavior, verified in isolated Chrome for 8–10 October and 10 October–2 November, including intervening staff Shifts and unchanged main Day date. Guarded PostgreSQL found zero mutation; frontend 40 files/260 tests, lint and build passed. Disposable QA schemas/services were cleaned; normal 5176/4020 remain healthy. BHS overnight-hour attribution, real evaluator/device acceptance and remaining formal-role mapping are open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-21 Day Scheduled Shift panel gate

Current-source isolated browser verified the new optional date/employee summary panel, cross-month selection, preserved main Day date and existing Add/Edit interaction. Direct PostgreSQL confirmed zero Shift/publication/version mutation from those cancelled actions. Frontend 40 files/258 tests, ESLint and production build passed; 430 px viewport had no page overflow. The paired disposable schemas and services were removed; normal 5176/4020 remain healthy. BHS screenshot and saved-operation parity, real store evaluator/device acceptance and remaining formal-job mapping are open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-20 sidebar/Month geometry gate

The desktop sidebar and outer Month rectangle now closely match prior same-viewport BHS measurements; the collapse toggle, mobile drawer and 24 Week/Day blank drag selections passed isolated Chromium with zero Roster writes. Full frontend 227/227, lint and build passed. This is geometry and local-interaction evidence only. Dense BHS Calendar, Settings behavior, live BHS session, real STORE_EVALUATOR acceptance and historical job mapping remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-20 Availability Script reviewed-count gate

The manager-confirmed CREATE/UNCHANGED counts are now checked inside the locked import transaction. A concurrent identical Availability row returns 409 without a partial import audit. Full disposable PostgreSQL backend 197/197, frontend 227/227, lint/build, backend TypeScript compile and current-source Chromium/API/database QA passed; temporary schemas were cleaned. BHS current session is at login, saved Submit parity remains unverified, real STORE_EVALUATOR acceptance is missing, and historical Hurstville role mapping remains unresolved. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-17 published role snapshot display gate

Same-time published Shifts with different frozen role names/colors now remain separate Calendar cards, verified in disposable Chromium and PostgreSQL. Frontend 222/222, lint and production build passed. Live BHS, real evaluator account, legacy role mapping and physical store acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-17 duplicate Save gate

Fresh disposable Chromium/PostgreSQL confirmed a mouse double-click on Save creates exactly one Shift, survives reload and leaves older publication unchanged. Live BHS, real target evaluator, Hurstville historical role mapping and physical store acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-17 draft role deactivation gate

Draft-backed roles can no longer be deactivated through Settings or API: the Settings control is disabled with an explanation, and the backend returns 409 under the store lock. Disposable real PostgreSQL, current-source Chromium/API, full frontend/backend suites and production builds passed. This closes one data-integrity defect, while BHS live comparison, real target evaluator, historical Hurstville role mapping and physical store acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-17 drag text-selection gate

The held Day/Week preview text `14:00 - 15:30` also matched the Add dialog fields after release in a repeated current-source Chromium run. Zero writes and exact QA cleanup were confirmed.

Current-source disposable Chromium passed Day and Week drag-create with exact 14:00–15:30 prefills, no selected text during/after drag and zero Roster writes on Cancel. Temporary QA resources were cleaned. Live BHS, real target evaluator, legacy role mapping and store-device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-17 atomic role create gate

The complete post-change backend build passed; local migrations remain current at seven, and source 4020/5176 returned healthy responses.

Current backend passed 23 files/160 tests on disposable real PostgreSQL, including a red-green create/activate interleaving that now rejects duplicate formal-job association under the store lock. Frontend remains 220/220 from the preceding unchanged frontend gate. Live BHS, real target evaluator, Hurstville legacy-role mapping and store-device acceptance remain outstanding. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-17 role reactivation concurrency gate

The post-change full backend production build also passed; the restarted source 4020 service reports database/Evaluate true.

Current backend real-PostgreSQL suite passed 23 files/159 tests, including one-success/one-409 concurrent activation for the same Evaluate formal job. Browser/API readback confirmed rejected activation leaves all Roster role rows unchanged. Temporary schemas/services were cleaned. The prior frontend 220/220, lint and production build remain applicable because this change is backend-only. Live BHS, real target evaluator, Hurstville legacy-role mapping and store-device acceptance remain outstanding. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-17 duplicate formal-job role gate

The complete backend production build subsequently passed; the source 4020 watcher was restarted and database/Evaluate health returned true. Seven local migrations remain current.

Current frontend 35 files/220 tests, lint and production build; backend 23 files/156 tests on disposable real PostgreSQL and TypeScript no-emit passed. Current-source Chromium confirmed Settings disables duplicate association for an already linked Evaluate formal job; direct API returned 409 with unchanged Roster role rows. All exact QA services and schemas were cleaned, and normal 5176/4020 health stayed 200. Live BHS, real target STORE_EVALUATOR, legacy-role mapping and physical-store acceptance remain outstanding. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-17 current local gate

Current frontend 219/219 tests, lint and production build; backend 155/155 tests on isolated real PostgreSQL and full production build passed. Seven local migrations are current. Restarted source backend 4020 and frontend 5176 are healthy; Evaluate dependency is reachable. Disposable Chromium verified Copy Day current employee snapshots, employee-row saved-card no-drag and exact formal-job qualification cues. QA services/schemas were cleaned; no normal data or Evaluate application code was changed. Current live BHS inspection, real target STORE_EVALUATOR and physical-store acceptance remain open, and eight Hurstville DRAFT Shifts still need a business-confirmed formal-role mapping. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-16 formal-role alias gate

Backend now rejects hidden global-role aliases when a store-specific role is the selected match for an Evaluate formal job. Disposable real PostgreSQL 148/148 backend tests, backend TypeScript/build and paired generated-ADMIN Chromium/API verification passed; the normal source backend was restarted and 5176/4020 health passed. Read-only live Hurstville audit found no such duplicate alias for its two current formal jobs, but eight DRAFT Shifts still use the unmatched `验收岗` role and require explicit manager repair before publishing. Existing data was not changed. Direct BHS Settings/Calendar evidence, real target `STORE_EVALUATOR` login and store-device acceptance remain unavailable. **NOT READY FOR INTERNAL PILOT.**

A read-only environment inspection during this audit inadvertently printed a configured Evaluate external API credential in a private tool result. The `.env` file is ignored/untracked and the credential was not copied into repository files. Rotate that credential if it is live before treating this environment as production-ready; the audit did not use the credential to call the provider.

## 2026-10-16 publication formal-job checkpoint

New publication snapshots now contain the matched current Evaluate formal job name. Generated-ADMIN Chromium Publish, manager-history API and real PostgreSQL revision tests passed; original Shift and older publication snapshots stayed stable. Backend 146/146, frontend latest 204/204, lint and both builds passed. Normal 5176/4020 services are healthy. No migration or Evaluate code change. Direct BHS observation, real target `STORE_EVALUATOR` and physical-store acceptance remain missing. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-16 formal-job snapshot checkpoint

New Copy Day/Week/Repeat and Batch role writes now snapshot Evaluate's current formal job name, while source Shifts and published history remain stable. The Calendar labels verified roles with the current formal name. Local paired Chromium/API and real PostgreSQL tests passed; frontend 204/204, backend 146/146, lint and both production builds passed. No migration or Evaluate code change. Normal 5176/4020 services are healthy. Direct BHS reference observation, real target `STORE_EVALUATOR` and physical store-device acceptance remain missing. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-16 corrected Calendar and formal-job checkpoint

The local page is running at `http://127.0.0.1:5176/`; backend 4020 reports both database and Evaluate healthy. Current-source isolated Chromium verified dragging a saved card opens no dialog and persists no move, blank-grid drag creates an unsaved time draft, and Settings excludes an active legacy role absent from Evaluate's formal jobs. Fake role and Shift writes return 422; Publish and Copy Day/Week/Repeat now reject a role outside the active Evaluate store-job list. Frontend 203/203 and real-PostgreSQL backend 146/146 tests, lint and both production builds passed. Existing legacy database rows were preserved; no migration or Evaluate application change occurred. Direct BHS page observation, real target evaluator and physical device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-16 legacy publication display checkpoint

Four local public publication snapshots lack a recorded timezone. Historical detail, CSV and print now show labelled UTC instants instead of silently inheriting today's store timezone; the original snapshots remain untouched. Frontend 199/199, backend 139/139 with disposable PostgreSQL, production builds, and generated-ADMIN Chromium passed. Original store-local wall times need source-backed review. Target HTTPS real `STORE_EVALUATOR`, direct ShiftHelper saved-action comparison and physical store-device acceptance remain open. **NOT READY FOR INTERNAL PILOT.**

## 2026-10-16 backend PostgreSQL gate

The current backend passed 135/135 tests in 22 files against a new disposable PostgreSQL schema with all six migrations. Prisma validate passed and read-only status found normal `molly_roster.public` current at six migrations. No normal database rows were modified for this gate; the isolated schema was removed. Backend application code and running 4020 were unchanged. The Evaluate-to-Roster workforce-read/commit race, target HTTPS and real STORE_EVALUATOR acceptance remain open. Internal pilot is not accepted.

## 2026-10-16 Repeat and Publish workforce checkpoint

Isolated generated-ADMIN Chromium and guarded PostgreSQL verified Repeat's 422 rejection invalidates its old preview while keeping recurrence input, and Publish's 422 rejection retains DRAFT and published history. Frontend 197/197, ESLint, build and backend TypeScript passed. No migration or Evaluate app change. Direct BHS, target HTTPS and authorized real STORE_EVALUATOR acceptance remain open. Internal pilot is not accepted.

## 2026-10-16 Copy Day/Week preview drift checkpoint

Generated-ADMIN two-tab Chromium and guarded disposable PostgreSQL verified that a transfer after initially copyable Day/Week previews causes two 422 commits, no target writes, invalidated old previews and fresh blocking previews. Frontend 196/196, ESLint, build and backend TypeScript passed. No migration or Evaluate app change. Direct BHS, target HTTPS and authorized real STORE_EVALUATOR acceptance remain open. Internal pilot is not accepted.

## 2026-10-16 stale-workforce drag checkpoint

Isolated generated-ADMIN Chromium and guarded PostgreSQL verified Week employee-row and Day TimeGrid drag rejection after an Evaluate transfer: PATCH 422, source card retained, workforce refreshed, former row marked for reassignment, and published history unchanged. Frontend 196/196, ESLint, build and backend TypeScript passed. No migration or Evaluate app change. Direct BHS, target HTTPS and authorized real STORE_EVALUATOR acceptance remain open. Internal pilot is not accepted.

## 2026-10-16 open-dialog employee transfer checkpoint

Generated-ADMIN Chromium and guarded disposable PostgreSQL verified a transfer after Shift Edit opened: first PATCH 400, workforce refresh with unsaved note retained, removal/replacement PATCH 200, reload and unchanged published history. Frontend 196/196, ESLint, build and backend TypeScript passed. No migration or Evaluate application change. Direct BHS, target HTTPS and authorized real STORE_EVALUATOR acceptance remain open. Internal pilot is not accepted.

## 2026-10-16 former employee draft repair checkpoint

Generated-ADMIN Chromium and guarded disposable PostgreSQL verified an actual Evaluate employee transfer, blocked stale-assignment Save with zero PATCH requests, replacement with an active employee through one PATCH 200, reload and unchanged published history. Frontend 196/196, lint, production build and backend TypeScript passed. No migration or Evaluate application change. Direct BHS, target HTTPS and authorized real STORE_EVALUATOR acceptance remain open. Internal pilot is not accepted.

## 2026-10-16 formal-position filter checkpoint

Generated-ADMIN Chromium and guarded disposable Evaluate/Roster PostgreSQL schemas verified the independent official-position picker, canonical employee assignment, one saved shift, reload, and unchanged published snapshot. Frontend 195/195, lint, production build, and backend TypeScript passed. No migration or Evaluate application change. Direct BHS and real target STORE_EVALUATOR acceptance remain open. Internal pilot is not accepted.

## Readiness decision

Committed-pair local HTTP smoke (2026-10-09): clean detached Evaluate `4653855` and Roster `2c44832` checkouts used separate freshly migrated disposable schemas. Roster proxy login, own-store workforce (10 employees), matching canonical detail ID, null official score, PII omission and cross-store 403 passed; dependency health was true. Temporary services/schemas were cleaned. Target CI, staging and deployed authenticated score-refresh/publication checks remain open.

The local integration has passed an isolated real-browser STORE_EVALUATOR pass and a CLOSED-round score refresh into Roster. Production readiness remains open because the deployed infrastructure, secrets, migration state, and production login/logout plus workforce reads have not been verified.

## Runtime contract

- Node: `>=20.19 <23`
- Database: PostgreSQL; Roster must use its own database/schema.
- Build: `npm run build && npm --prefix backend run build`
- Start: `npm --prefix backend run start`
- Migration: `npm --prefix backend run prisma:migrate:deploy`
- Health: `GET /api/health`; require HTTP 200, `services.database=true`, and `services.evaluateMolly=true` for rollout approval.

Required backend variables:

- `NODE_ENV=production`
- `DATABASE_URL`
- `PORT`
- `EVALUATE_API_BASE_URL`, ending in `/api`
- `EVALUATE_APP_ORIGIN` when Evaluate's configured public `APP_ORIGIN` differs from the API base URL origin (for example, an internal service address); Roster sends this origin on proxied login/logout
- `APP_ORIGIN`, the exact public Roster origin

`CORS_ORIGIN` is a development control. `VITE_API_BASE_URL` should remain empty for the recommended same-origin production topology.

## Security topology

- Serve frontend and Roster API from one public origin. Roster proxies login/session calls to Evaluate and forwards the HttpOnly session cookie; no token or role belongs in localStorage.
- Keep Evaluate integration endpoints private to authenticated calls. Roster accepts only the versioned allowlisted workforce DTO and strips unexpected fields.
- Never point `DATABASE_URL` at Evaluate's database. Never add Employee, Account, Session, Evaluation or EvaluationRound authority tables to Roster.
- Production mutations enforce exact Origin and store scope; ADMIN-only manager exports are server-guarded.
- Production responses set a restrictive same-origin Content Security Policy, deny framing through CSP, and retain Helmet frame protection.
- Rotate any credential if it appears in logs or chat. No production credential was used in this build.

## Pre-deploy checklist

1. Provision an isolated PostgreSQL database and backup policy.
2. Configure exact environment values in the deployment secret store.
3. Run both production builds, both test suites, both production dependency audits, Prisma validate and migration status.
4. Apply migrations once with `prisma:migrate:deploy`; do not use `db push`.
5. Start the backend and verify the nested health fields, not only the HTTP status.
6. Login as ADMIN and STORE_EVALUATOR; verify store selection/scope, create/edit/delete, publication, employee-safe export and manager export.
7. At 1366×768 and 390px, verify Day drag, dialog save, published lock and no body overflow.
8. After a legitimate new Evaluate CLOSED round, refresh Roster and confirm the new card score while an existing publication snapshot remains unchanged.
9. Confirm employee-safe CSV contains no internal notes, score, Tier, evaluator detail, phone, email or address.
10. Confirm database backups and rollback ownership before inviting stores.

## Rollback

- Application: redeploy the prior artifact; migrations in this release are additive foundation migrations.
- Database: preserve the Roster database and publication snapshots. Do not delete or rebuild Evaluate data to recover Roster.
- Integration outage: leave published rosters readable/exportable from Roster; block new workforce-dependent writes until Evaluate health recovers.

## Known operational notes

- Prisma 6 emits a deprecation notice for package.json-based configuration. Plan a separate Prisma 7 migration; do not mix it into pilot deployment.
- The patched `deepmerge-ts` override is verified by Prisma generation/build and keeps the production dependency audit at zero.
- The actual production entrypoint and SPA fallback were smoke-tested from `dist/server.js`, not inferred from build success.

## Local release checkpoint (2026-10-09)

The original dirty `master` worktree is preserved. A separate local branch `codex/roster-evaluate-integration` has WIP source commit `e379155` and narrow frontend lockfile security commit `6caed7e`; it packages current Calendar work alongside Evaluate integration. A detached clean checkout passed fresh installs, frontend/backend production builds, frontend lint and 111/111 tests, backend 94/94 database-enabled tests, Prisma validation and local 4/4 migration status. Both production dependency audits returned zero advisories after the lockfile updated `source-map-js` to the [patched 1.2.2 release](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). This is a local reproducibility checkpoint only. Review the broad WIP commit, verify remote CI and target database identity, rehearse staging migration and authenticated runtime before release. The normal backend on 4020 still serves an earlier loaded build.

# Committed-pair local score/publication acceptance (2026-10-09)

Catalog-only local integrity checkpoint: a direct read-only PostgreSQL query found all 20 Roster business CHECK constraints present and validated, covering period/version, shift time/break, assignment score/Tier snapshots, availability and settings. There is no Roster custom trigger or partial index in `public`. Evaluate's own catalog independently has six validated CHECKs, six enabled historical-freeze triggers and its valid unique OPEN-round partial index. These checks cover objects Prisma diff cannot compare; target staging/production catalogs remain uninspected.

Read-only local drift checkpoint: Roster's four migration files produced `No difference detected` against the actual `molly_roster.public` catalog using a separate disposable shadow database. Evaluate's 37 migrations likewise matched its own development catalog, and its Prisma model was aligned to existing SQL indexes/defaults with no new migration. Both shadow databases were dropped; target staging/production drift still requires separate preflight. A migration-status green check alone was not used as proof of catalog parity.

Latest local reproducibility checkpoint: the clean detached Roster `29b3b0e` backend passed a fresh `npm ci`, production build, Prisma validation, 4/4 local migration status and full database-enabled 95/95 tests. The paired clean Evaluate `321464d` passed frontend 97/97, backend database-enabled 191/191, both production builds, Prisma validation and 37/37 local migration status. No remote CI, staging or production preflight has run. The Roster backend login proxy also passed paired production-mode local HTTP 429/`Retry-After` acceptance with Evaluate's shared counter; target HTTPS remains unverified.

The clean detached Evaluate `4653855` and Roster `2c44832` checkouts passed a real HTTP and PostgreSQL test on separate disposable schemas: OPEN evaluator submission kept Roster official score null; ADMIN close changed the next Roster read to 76.5/T2 with the CLOSED Round ID. The earlier published shift revision retained null score/Tier/round ID after close; a republished revision froze 76.5/T2. Both revisions were reread through the authenticated manager API. Temporary services, schemas and credentials were cleaned. This strengthens local integration evidence; deployed HTTPS and target migration/identity checks remain required before release.

Read-only Git preflight found no configured remote in the Roster repository. Its candidate branch is reviewable locally but cannot produce remote CI or a normal PR until the project owner identifies the intended remote. The Evaluate candidate is likewise local only; its remote `main` had not advanced beyond its merge base at this check. No deployment or production database action was taken.

The local candidate now includes `.github/workflows/validate.yml` for mandatory PostgreSQL 16 migrations and database-enabled tests plus frontend/backend builds and production dependency audits. A local fresh-schema rehearsal passed 4/4 migrations, backend 94/94, frontend 111/111, lint/build and zero production advisories, then removed the disposable schema. Remote Actions execution remains unverified because no Roster Git remote is configured.


Current local schema preflight (2026-10-09): after Evaluate migration 38, both Prisma datamodel-to-live and migration-history-to-live diffs returned exit 0/No difference detected for Evaluate 38/38 and Roster 4/4. Dedicated local shadow databases were created only for migration replay, then dropped; zero leftovers remained. This does not replace the target database identity, backup, SQL/data preflight or separate custom-trigger/catalog check before deployment.


Current paired local regression gate (2026-10-09): Roster frontend lint, 113 tests/build and backend Prisma validate/build plus 99 database-enabled tests passed in a newly migrated isolated schema, which was removed. Evaluate frontend lint, 101 tests/build and backend Prisma validate/build plus 198 database-enabled tests passed. This refreshes source verification at the latest local candidate heads; remote CI, existing evaluator login and target migration/runtime remain separate gates.

2026-10-15 local candidate update: single-assignment Week employee-row cards may now change date and employee in one versioned, Availability-checked Roster transaction after a current store-scoped Evaluate target read. Isolated Chrome verified a saved Bob 9 October to HandoverEmployee006 10 October diagonal move, refresh persistence, and a rejected unavailable reverse diagonal move with unchanged Shift ID/version/assignment. PostgreSQL backend 111/111, frontend 140/140, builds, lint and Prisma status passed; temporary schemas/account/services/tab were cleaned. This remains local evidence only; real target HTTPS STORE_EVALUATOR and BHS saved behavior have not been accepted. Internal pilot is not accepted.
2026-10-15 Month update: an isolated generated-ADMIN Chromium flow now verifies Month blank-cell create/save/reload, event Edit, date-number Day navigation and published-date lock. A guarded PostgreSQL read confirmed one new shift and an unchanged published period. Frontend 142/142, build and lint passed. This is local candidate evidence; target HTTPS real STORE_EVALUATOR acceptance, direct BHS saved-action parity and sustained FPS remain open. Internal pilot is not accepted.

Published-create follow-up: a second isolated browser run observed explicit lock feedback from Month, Day, Week and toolbar creation, and no draft after Day drag selection on a published date. PostgreSQL still showed PUBLISHED version 1. The shared UI guard supplements the existing server lock; target acceptance gates remain open.

Large-store drag sampling: isolated headless Chromium completed roughly five-second canceled Week row drags at 50, 100 and 500 employees, with p95 requestAnimationFrame intervals of 16.7 ms and no intervals over 33.3 ms or Shift mutation requests. At 500 staff the board rendered its default 60 visible rows; direct PostgreSQL confirmed 5,000 benchmark shifts/assignments and unchanged fixture versions. This narrows the local interaction performance gap but does not prove sustained FPS on store devices or target deployment readiness. Internal pilot remains unaccepted.

Invalid row-drop follow-up: a locally known overlap now prevents the Week employee-row mutation request and shows a visible reason on release. Isolated Chromium captured red target feedback, zero Shift writes and unchanged direct PostgreSQL rows/versions. Server-side Availability, store, conflict and concurrency validation remains required. This local improvement does not close target HTTPS evaluator acceptance or direct ShiftHelper parity gates; internal pilot remains unaccepted.

Overnight-template follow-up: toolbar New Shift now follows the store opening clock; an overnight template automatically marks Next Day. Isolated Chromium saved/reloaded a 22:00–02:00 Cindy shift and showed its next-day continuation. Direct PostgreSQL confirmed the expected UTC instants and untouched published period. Frontend 143/143 tests, build and lint passed. This is generated-ADMIN local evidence; target HTTPS real STORE_EVALUATOR and direct ShiftHelper behavior remain open. Internal pilot remains unaccepted.
## 2026-10-15 overnight Availability update

The Staff-to-Calendar overnight workflow passed generated-ADMIN Chromium and direct disposable PostgreSQL checks, with 145/145 frontend and 113/113 real-database backend tests, production builds, Lint and Prisma Validate passing. The backend tests include cross-day overlap, API maximum interval and Sydney DST fallback rejection. No migration or Evaluate code change. Target HTTPS STORE_EVALUATOR acceptance and direct BHS saved-behavior checks remain open. Internal pilot is **not accepted**.
2026-10-15 Staff employee-scope follow-up: an Availability read failure after switching employees previously left Save enabled with the old draft; a late prior-employee Save response could also overwrite a new employee's form. Both are now scoped and blocked. Generated-ADMIN Chromium verified fault, Retry and delayed-response paths; guarded PostgreSQL found seven intended Cindy rows, no HandoverEmployee006 rows and unchanged Shift/period data. Frontend 148/148 tests, build and Lint passed. This improves local data safety but does not satisfy target real-account HTTPS or BHS acceptance; internal pilot remains **not accepted**.
2026-10-15 Shift ownership follow-up: a local public migration now enforces Shift period/store equality using a validated compound FK. A preflight of 14 Shifts found zero mismatches, a checked pg_dump backup was retained in `%TEMP%`, and postflight plus migration status were healthy. Isolated backend 118/118, frontend 149/149, lint/build and local malformed-source Chromium/DB rollback passed. Target HTTPS real-account, BHS saved behavior and store-device gates remain open; internal pilot is not accepted.

2026-10-15 Staff fallback update: local generated-ADMIN Chromium saved and reloaded a Sydney first-02:30 UTC+11 to second-02:30 UTC+10 Availability interval; guarded PostgreSQL held exactly the expected one-hour row without Shift/publication changes. Frontend 175/175, backend isolated real-PostgreSQL 133/133, lint and builds passed after a transient concurrent-run Copy Day timeout was cleared by serial rerun. Normal 4020 health database/Evaluate true and 5176 HTTP 200 after restart. No migration or Evaluate change. This closes the local Staff repeated-hour editor gap, but direct BHS saved behavior, target HTTPS real STORE_EVALUATOR and physical store-device acceptance remain open. Internal pilot remains **not accepted**.

2026-10-15 Availability concurrency update: the public Roster Availability PUT now requires `expectedRows` row IDs/versions; clients omitting it receive HTTP 400. A stale snapshot receives 409 inside the locked replacement transaction with no overwrite. Staff retains the draft, blocks repeat Save and offers explicit reload. Two independent local Chromium sessions, direct PostgreSQL, frontend 176/176, backend real-PostgreSQL 135/135, lint and builds passed; normal stack restarted healthy. Direct-call QA scripts were updated for the request contract. There is no migration or Evaluate application change. The user reports no available target real STORE_EVALUATOR account yet and intends to open BHS for observation; target authorization, direct BHS behavior and physical store-device checks remain open. Internal pilot is **not accepted**.

2026-10-15 workflow freshness update: Staff discards delayed save results after a newer same-employee load, and Copy Day discards a conflict preview when its dates change during the request. Red-green local Chromium checks and direct disposable PostgreSQL checks passed; latest frontend full suite is 177/177 with ESLint/production build, and the unchanged backend application retains its 135/135 real-PostgreSQL gate. Temporary services and schemas were cleaned; normal 4020 health and 5176 HTTP 200 passed. A BHS window title was intermittently visible, but page capture failed and no direct reference behavior was observed. Target HTTPS real-account and physical store-device checks also remain open. Internal pilot is **not accepted**.

2026-10-15 Repeat Shift freshness update: an obsolete conflict preview can no longer reappear after editing the repeat end date or weekdays. Red-green component evidence, generated-ADMIN Chromium with a held HTTP response, and guarded disposable PostgreSQL confirmed fresh preview, zero Repeat writes and unchanged source records. Frontend 178/178, ESLint, production build and diff check passed; backend application remains at its latest 135/135 real-PostgreSQL gate. Temporary services and exact schemas were cleaned. Direct BHS page capture, target real evaluator and store-device acceptance remain open. Internal pilot is **not accepted**.
