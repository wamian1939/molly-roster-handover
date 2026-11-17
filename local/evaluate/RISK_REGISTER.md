# Evaluate Molly Risk Register

2026-10-09 paired-source QA update: clean detached Evaluate `4653855` and Roster `2c44832` checkouts passed a temporary two-schema HTTP smoke: dependency health, proxied evaluator login, authorized workforce and canonical detail ID, PII omission, and cross-store 403. A subsequent two-schema HTTP/database run also proved that an OPEN submission leaves Roster official score null; ADMIN close changes its next read to 76.5/T2; and publication revision 1 retains null score/Tier while revision 2 freezes 76.5/T2 with the CLOSED Round ID. Both disposable schemas and services were removed. Target CI/staging and deployed HTTPS acceptance remain open.

2026-10-09 cross-project deployment update: Roster's current dirty worktree was also packaged without altering `master`: local branch `codex/roster-evaluate-integration` has WIP source commit `e379155` and lockfile fix `6caed7e`. Its detached clean checkout passed frontend/backend builds, frontend 111 tests, backend 94 database-enabled tests, Prisma validation and local 4/4 migration status; production dependency audits are zero. Both repositories now have reviewable local branches, but neither has been pushed or validated in remote CI, staging migration, or target runtime. DEPLOY-01 therefore remains a release gate.

2026-10-09 QA-01 update: a generated STORE_EVALUATOR in a disposable migrated development schema completed browser login, own-store list/detail, other-store denial, personal submission and resubmission, logout/login persistence and OPEN-versus-official score checks. This strengthens local browser evidence but does not replace acceptance using an existing authorized evaluator in the target environment. Live AI analysis, browser console and failed-network diagnostics also remain unverified. The temporary account, services and schema were removed.

2026-10-09 release candidate update: code commit `03a2d85` and documentation commit `1ff58a2` package 119 files on local branch `codex/evaluate-master-data-integration`, preserving the original dirty `main` worktree. A separate detached clean checkout of `1ff58a2` passed fresh installs, frontend build/lint/95 tests, backend Prisma generate/build/185 database-enabled tests, Prisma validation and 36/36 local migration status. `DEPLOY-01` remains open until review, push, CI/staging and target migration preflight. Frontend `source-map-js` was updated from affected 1.2.1 to patched 1.2.2 in the lockfile only, based on the [reviewed advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q); the clean candidate frontend and backend production audits report zero advisories. The normal running services still have not loaded all current source/dependencies.

2026-10-09 current remote check: read-only `git ls-remote` found Evaluate `origin/main` still at `001af5453e0cc5540dc0fb711efcb213d784ad6a` and no candidate branch. Roster has no remote. A single unauthenticated HTTPS request to the historically recorded Render health endpoint timed out after 45 seconds; uptime, database identity and deployed commit remain unknown. Local candidate tests and normal local-service health cannot close DEPLOY-01 or QA-01.

Original audit date: 2026-09-14. HIST-01, HIST-02, PRIV-01 and SKILL-01 were updated with the 2026-10-09 remediation and validation; other rows retain their original audit context and require current-state verification before use as release findings.

| ID | Severity | Risk / evidence | Business impact | Recommended treatment | Required regression evidence |
| --- | --- | --- | --- | --- | --- |
| HIST-01 | P1 residual historical evidence | All 40 development CLOSED rounds predate Round-level name and job snapshots. Current reads now use a unanimous, nonblank personal-evaluation name/store label when available, and explicitly mark its provenance; a conflicting or missing label is marked as a current-profile fallback. The 40 personal labels are unanimous but do not prove close-time names. | Existing history no longer silently presents current identity as a frozen close snapshot, but exact close-time identity and jobs cannot be recovered from current evidence. | Keep historical sources visible, retain null jobs, and obtain independent evidence before any legacy backfill. New closes persist Round-level snapshots. | Isolated PostgreSQL legacy simulation and rename/list/detail test passed; ADMIN and evaluator real-browser history paths passed against a disposable schema. Deployed-version acceptance remains. |
| PRIV-01 | Fixed P1 locally | The CLOSED history route formerly omitted actor context, so the service fetched and emitted ADMIN personal score/name to STORE_EVALUATOR. A pre-fix test reproduced `adminScore: 92` in evaluator JSON. | Manager-only personal scoring metadata crossed the backend permission boundary. | The route now passes AuthContext; ADMIN personal evaluations are fetched only for ADMIN and only for returned page rows, and evaluator DTOs omit both fields. | Unit and isolated PostgreSQL tests plus real authenticated HTTP ADMIN/evaluator comparison passed. Normal 4000 reload and deployed acceptance remain release gates. |
| DEPLOY-01 | P1 release gate | The old `main` HEAD lacks required migrations/runtime files. Local candidate branches passed clean checkout checks. The Evaluate development model and catalog match with 38/38 migrations; Roster has 4/4. Neither candidate has been pushed or tested in target CI/staging. | Deployment from old `main` can still run mismatched code/schema; target database drift remains unknown. | Review local commits, run target preflight/backup and controlled staging migration, then integrate through the normal review path. Preserve preexisting local work. | CI run, staging empty/upgrade migration rehearsal, authenticated target smoke and target database preflight remain. |
| QA-01 | P1 target acceptance gate | The original local evaluator credentials returned 401; no reset was authorized. Generated STORE_EVALUATOR accounts in disposable schemas have since passed real browser login, store isolation, submission/resubmission and logout/login persistence. | Local behavior is exercised, but an existing authorized evaluator and deployed target session/CORS/cookie behavior are unverified. | Run the same matrix with an existing authorized evaluator in the target environment; retain generated-fixture evidence separately. | Target ADMIN and evaluator browser matrix with network payload and console review. |
| ANALYTICS-01 | Fixed P1 locally; target acceptance pending | Analytics included CLOSED rounds with no official aggregate and converted their null score to zero. The read-only development comparison found eight such rounds for active employees. | Trend counts, movement and apparent current scores could be distorted by an invalid zero. | Analytics now excludes rounds without a formal aggregate before building its employee and trend projections. No historical row or scoring rule was changed. | Unit regression includes a newer invalid CLOSED round; isolated PostgreSQL live-round suite 18/18 confirms a later empty close leaves Analytics score and trend stable. Full database-enabled backend 196/196, root lint and backend build passed before that test addition. Development comparison confirmed 31 valid active rounds and 31 Analytics trend points. Target acceptance remains. |
| SCOPE-01 | Fixed P2 locally; target acceptance pending | Analytics and Skill Board services trusted a selected Store ID even if it was outside their supplied authorized Store scope. Their current HTTP routes already checked this boundary. | A future internal caller could bypass scope by passing an inconsistent selected Store ID. | Both services now reject the inconsistent scope with 403 before reading employees; route behavior and ADMIN unrestricted scope remain unchanged. | Direct-service regressions for Dashboard, Analytics and Skill Board passed; full database-enabled backend 198/198, root lint and backend build passed. Target runtime remains unverified. |
| DATA-01 | P2 current HR completeness | Read-only local development audit found all 29 employees lack commencement date, given name and English name; 28 lack surname. IDs and display names are present, and no duplicate display-name groups or status/store inconsistencies were found. | Tenure is unknown for this dataset; legal-name fields cannot be assumed complete for HR decisions. | Obtain primary HR evidence, review by canonical Employee ID, update through the ADMIN profile workflow, and never infer identity or start date from a matching name. | Re-run `audit-employee-master-completeness.ts` and confirm historical evaluation/publication snapshots remain intact after any approved updates. |
| PERF-01 | Fixed P2 locally; production latency pending | History previously loaded every CLOSED Round, filtered jobs in memory, then sliced a page. | Response time and memory grew with lifetime history despite a paginated response. | Job snapshot containment now filters in PostgreSQL; `count`, `skip` and `take` apply to the scoped query. A GIN JSONB index supports the job predicate. | Unit and isolated DB tests passed. In a 500-employee/5,000-round synthetic fixture, count/page IDs matched and five-run SQL medians improved 1.039 to 0.264 ms and 1.457 to 0.611 ms. Production API latency remains unmeasured. |
| PERF-02 | P2 residual Analytics/history scale | Current-score surfaces formerly loaded every matching CLOSED Round with full evaluator/skill snapshots, then deduplicated in memory. Dashboard also loaded lifetime history despite using only current results. | Reads grew with lifetime evaluation history. | Roster, Skill Board, store roster and Dashboard now select one latest valid CLOSED Round per employee through the indexed lookup; Analytics still loads full history for monthly trend and movement, and detailed history needs separate bounded projections. | Development comparison matched all 25 official scores; 500-employee/5,000-round synthetic latest-ID results matched. New Dashboard unit and real-DB regression passed; isolated authenticated HTTP returned 200. Production API latency remains unmeasured. |
| HIST-02 | Fixed P2 | `roundAggregateInclude` formerly loaded current `EmployeeSkill` and the Round DTO spread it into CLOSED history. A pre-fix test reproduced the leak. | Mutable current skills could appear alongside immutable historical categories. | The Round query now selects only employee ID/name and its DTO explicitly projects those fields. Historical category calculations still read evaluation skill snapshots. | Focused 17/17, isolated PostgreSQL live-round 9/9, full DB-enabled backend 163/163, lint, TypeScript and isolated production build passed. |
| SKILL-01 | P2 residual data review | The former evaluator-submission upsert was removed and two-evaluator tests passed. A read-only local provenance check found 256 current skill rows across 25 employees with the same ADMIN actor and a submitted personal snapshot within 60 seconds; 75 other rows carry the qualification-migration marker. | Legacy current statuses may reflect an individual's old submission; timing cannot prove which values are incorrect. | Review the ignored local CSV with store managers, then confirm disputed statuses through the ADMIN current-skill API. Do not bulk replace or infer a consensus. | Re-run the read-only provenance audit after each reviewed batch and retain the explicit-confirmation concurrency tests. |
| STORE-01 | Fixed P2 locally | Store archive formerly deleted OPEN evaluations only for accounts found through store-access rows, excluding ADMIN personal submissions. A pre-fix test failed both with evaluator access and with no access row. | An ADMIN OPEN score could remain dormant through archive and reappear after restore. | Archive now locks/deactivates the store first, deletes every evaluation belonging to its OPEN Rounds, retries serialization conflicts, and retains CLOSED history. Opening, submitting and closing a Round take a shared store lock and reject archived stores. | Unit 5/5 and isolated PostgreSQL live-round 16/16 passed, including ADMIN/evaluator cleanup, preserved history and concurrent archive boundaries. Full DB-enabled backend 176/176 passed; normal 4000 reload remains. |
| A11Y-01 | Fixed P2 locally; assistive-tech spot check pending | The Store multi-select previously offered only pointer/Tab/Escape access. It now uses an option-only listbox, roving option focus, Arrow/Home/End navigation, Enter/Space selection, labelled search, focus visibility and error association. | Keyboard users can grant multiple stores without traversing every option; an actual screen-reader session remains unverified. | Preserve the existing visual system and run an assistive-tech spot check before formal accessibility sign-off. | Keyboard component tests 2/2, account page tests 3/3, full frontend 101/101, lint/build and isolated Chrome desktop/mobile keyboard flow passed. |
| SEC-01 | Fixed P2 locally | Helmet previously disabled CSP and CORP in all modes. | A future XSS or foreign content issue had fewer browser containment layers. | Production now sends same-origin CSP and CORP; inline styles remain allowed for existing React/Framer presentation, while scripts and connections stay same-origin. | Production header tests, TypeScript build/lint and isolated real-browser ADMIN login/dashboard/employee-list smoke passed. Target HTTPS acceptance remains. |
| SEC-02 | Fixed P2 locally; deployment pending | Login throttling formerly used an in-process Map. | Restart or multiple instances could reset/split protection. | A PostgreSQL hash-keyed reservation now enforces ten attempts per Evaluate-visible IP/username per 15 minutes across instances; Roster forwards the 429 `Retry-After` header. | Two-client concurrent database test and paired temporary production-mode HTTP 401/429 acceptance passed. Roster's upstream IP may group users of one account; normal services and target deployment have not loaded this code. Edge monitoring remains needed. |
| TEST-01 | P2 pending remote CI run | Core DB invariants are skipped unless `RUN_DATABASE_TESTS=1`; the repository previously had no CI workflow. | A normal local `npm test` can stay green while database behavior regresses. | `.github/workflows/validate.yml` now supplies PostgreSQL, applies clean migrations and runs the backend suite with `RUN_DATABASE_TESTS=1`, alongside frontend lint/test/build and backend validate/build. | YAML parsed locally and 176/176 backend tests passed against local PostgreSQL; a committed GitHub Actions run has not yet occurred. |
| TEST-02 | Fixed P2 locally | Current-round frontend fixtures previously used REGULAR_V2 weights and one text component exceeded its maximum. | Those fixtures could falsely endorse obsolete or impossible score labels. | Current-round fixtures now use REGULAR_V3, the historical CLOSED fixture is marked as legacy, and score-preview contract tests cover REGULAR_V3 and TRAINING_V2 maxima. | Targeted 13/13, full frontend 97/97, lint and production build passed locally; remote CI remains unrun. |
| PERF-03 | P2 | Frontend main chunk is 553.96 kB minified and Vite reports a >500 kB warning. | Slower cold load, especially after Render free-tier wake-up and on mobile. | Route-level lazy loading and chart isolation; measure before/after. | Bundle budget and route-load smoke tests. |
| LEGACY-01 | P2 | Old `/evaluations/history`, `/evaluations/periods`, PerformanceNote runtime, Grade/Risk/eight-dimension schema fields remain without current UI consumers. | Multiple history/score models increase maintenance error risk and enlarge schema/API surface. | Deprecate explicitly, measure external use, then remove runtime paths in a separate migration/refactor while retaining historical migrations. | Reference search, access-log check, compatibility test plan. |
| DOC-01 | Fixed P3 locally | `render.yaml` and `DEPLOYMENT.md` now use the same read-only migration-status build gate; migration deploy is a separate controlled step. | Operator instructions agree in source; target rehearsal is still unverified. | Keep the guide and blueprint aligned through release review. | Clean target deployment rehearsal following only the document. |
| DEP-01 | Fixed P3 locally; target artifact pending | Narrow dependency overrides resolved the earlier Prisma-chain advisory without changing the scoring model. Current Evaluate and Roster backend `npm audit --omit=dev` each report zero vulnerabilities. | Local dependency risk is reduced; deployed artifact contents remain unverified. | Inspect the target image/SBOM after deployment and continue audit monitoring. | Clean production audit plus target runtime module inspection. |

## Severity totals at original audit

- P0: 0 confirmed
- P1: 4 (three product/deployment defects plus one mandatory browser-verification blocker)
- P2: 11
- P3: 2

These totals describe the original audit snapshot; fixed rows remain in the table for traceability. The current local source has no confirmed P0. HIST-01 still lacks independent close-time evidence, DEPLOY-01 requires a coherent committed release and staging migration rehearsal, and QA-01 requires acceptance with a real authorized evaluator in the target environment. PRIV-01, HIST-02, STORE-01 and the PERF-01 query shape were fixed locally and verified as stated in their rows. The normal development processes still serve older builds.

## Detailed evidence records

### HIST-01 — CLOSED history identity is not a complete snapshot

2026-10-09 update: The current read path and both history UI surfaces now report the provenance of each legacy name. A unanimous label in completed personal evaluations is displayed before any current-profile fallback. A disposable PostgreSQL regression proved rename stability for that case; the close snapshot path was also verified. Real-browser ADMIN list/detail showed the old personal label and source after a simulated current-profile rename; the evaluator list showed the same historical label without ADMIN score. The original observations below describe the pre-fix source and remain as reproduction history. The exact close-time identity of old rows and historical jobs remain unproven, so this is a residual P1 evidence/release issue. No development legacy Round or Evaluation row was altered.

- Severity: P1
- Business impact: historical employee/store identity can change retroactively; job history is unavailable for all legacy rows.
- Reproduction: query CLOSED rounds for the three snapshot columns, then rename a current Employee/Store in an isolated fixture and reload History.
- File/lines: `backend/src/evaluationReadService.ts:130-171`; snapshot fields in `backend/prisma/schema.prisma:260-280`.
- Code evidence: the mapper uses `employeeDisplayNameSnapshot ?? employee.displayName` and the equivalent Store fallback.
- Runtime/API/DB evidence: 40 of 40 local CLOSED rounds had all three new snapshot fields null; the browser still displayed current names because of fallback.
- Recommended fix: define an honest legacy display policy and backfill only facts that can be proved; guarantee new close snapshots.
- Regression: close, rename masters, and assert list/detail retain the close-time values; legacy null jobs must be labelled unavailable, not current.

### PRIV-01 — History API over-returns ADMIN score identity

- Status: fixed in current source; the normal port 4000 process has not reloaded it.
- Pre-fix reproduction: a STORE_EVALUATOR history service test received `adminScore: 92` and failed the forbidden-key assertion.
- Fix: route passes the authenticated actor. The service queries ADMIN personal evaluations only for ADMIN and only for the visible page; evaluator responses omit both `adminScore` and `adminEvaluatorName` rather than returning null.
- Validation: isolated PostgreSQL test confirmed evaluator omission and ADMIN positive data. Full DB-enabled backend suite passed 164/164; lint, TypeScript and a hash-matched isolated backend production build passed. A temporary HTTP service against a disposable migrated schema accepted real ADMIN and STORE_EVALUATOR logins: both saw the same CLOSED round, only ADMIN received the two fields, and evaluator history had `Cache-Control: no-store, private`. The temporary service, schema and credentials were removed.

### DEPLOY-01 — Audited application cannot be reproduced from Git HEAD

Current state: both candidate branches are locally committed and independently buildable; Evaluate development has 38/38 migrations and Roster 4/4. The original bullets below describe the pre-packaging worktree. Review, remote CI, target preflight and deployment remain open.

- Severity: P1
- Business impact: production can run code/schema combinations that fail at startup or omit multi-store/jobs/history fields.
- Reproduction: inspect `git status`, then compare HEAD schema/runtime with current local build and Render's repository-only build.
- File/lines: untracked migrations `20260909110000`, `20260909120000`, `20260913110000`; untracked `backend/src/storeJobService.ts`; `render.yaml:1-9`.
- Code evidence: Prisma schema references models/columns introduced only by untracked SQL.
- Runtime/API/DB evidence: local DB has 32 applied migrations, while `git status` marks the last three `??`.
- Recommended fix: review and commit a coherent source/migration set, then deploy a clean clone to staging.
- Regression: clean clone build, empty migration, upgrade migration, Render smoke.

### QA-01 — Required evaluator browser security run is not reproducible

Current state: generated disposable STORE_EVALUATOR accounts passed local real-browser authorization and submission flows. The original bullets below describe the failed historical credential attempt. Acceptance with an existing authorized evaluator in the deployed target remains open.

- Severity: P1 verification blocker
- Business impact: pilot cannot rely on unverified cross-store/PII/account-switch behavior in the actual browser.
- Reproduction: use each locally documented STORE_EVALUATOR login; all returned 401.
- File/lines: ignored `LOCAL_ACCOUNT_CREDENTIALS.md` (contents intentionally excluded); login route `backend/src/routes.ts:73-93`.
- Code evidence: none indicating an auth logic defect; this is fixture/operational evidence failure.
- Runtime/API/DB evidence: three active evaluator accounts exist, but documented credentials did not authenticate.
- Recommended fix: safe non-production browser fixtures/credential bootstrap.
- Regression: full ADMIN/single-store/multi-store browser matrix and network forbidden-key scan.

### PERF-01 — History pagination and job-filter scale

- Severity: P2
- Business impact: the prior in-memory filter/page path scaled with full history.
- Current fix: `backend/src/evaluationReadService.ts` applies the job predicate, count, skip and take in PostgreSQL; migration `20261009180000_history_job_snapshot_gin_index` supports JSONB containment.
- Runtime/API/DB evidence: a disposable 5,000-round fixture returned the same 500 matching rows and first-page IDs before/after the index, with five-run warm-cache medians of 1.039 to 0.264 ms for count and 1.457 to 0.611 ms for page fetch.
- Remaining check: deployed API latency and actual production data distribution are unmeasured.

### PERF-02 — Official aggregate reads expand lifetime history

- Severity: P2
- Business impact: Analytics and detailed history still grow with lifetime data; the current-result surfaces have been narrowed.
- Reproduction: profile those endpoints after seeding multiple rounds per employee.
- File/lines: `backend/src/roundAggregateRead.ts:4-45` and its service callers.
- Current fix: current-score paths, including Dashboard, use a per-employee latest-valid CLOSED lookup and load only selected aggregates; migration `20261009170000_latest_closed_round_lookup_index` supplies the ordered index. Analytics retains full history because its monthly trend and movement need prior rounds; its projection remains a P2 performance task.
- Runtime/API/DB evidence: 29 development employees yielded the same 25 official results, loading 25 selected rounds instead of 40; isolated PostgreSQL used an index-only ordered lookup and preserved CLOSED score with a newer submitted OPEN round.
- Scale regression: a disposable 500-employee/5,000-CLOSED-round fixture returned the same 500 latest IDs and reduced five-run warm-cache SQL median from 5.697 ms to 1.971 ms. Production distribution and end-to-end API latency remain unmeasured.
- Dashboard follow-up: a unit test asserts the latest-ID query and restricted Round hydration, a real PostgreSQL test compares Dashboard's score with the Roster official latest-valid CLOSED result when a later empty Round exists, and an isolated generated-ADMIN HTTP request returned 10 active/0 evaluated/10 missing fixture employees. Backend database-enabled suite 196/196, build and root lint passed after sequential Prisma generation. The earlier concurrent test/build attempt hit a transient Windows query-engine DLL lock; the sequential build succeeded.

### HIST-02 — Closed detail mixes immutable and mutable skill data

- Status: fixed locally; production reload remains a separate release gate.
- Pre-fix reproduction: an injected current skill appeared in the CLOSED Round `employee.skills` field, while the historical categories came from evaluation snapshots. The new test failed before the fix.
- Fix: `roundAggregateInclude` no longer joins current employee skills, and `computeRoundAggregate` emits only employee ID and close-time display name. No history row, skill snapshot, or scoring rule changed.
- Validation: the unit test passes after the fix; an isolated PostgreSQL case changes current official skill after close and proves the CLOSED detail employee has no `skills` field while the stored historical snapshots remain unchanged. Full DB-enabled backend suite passed 163/163, lint/TypeScript passed, and a hash-matched isolated backend production build passed.

### SKILL-01 — Legacy current-skill provenance review

- Severity: P2 residual data review; the write-path defect is fixed.
- Fixed code: evaluator submissions now write only personal evaluation snapshots. Current skills change only through the protected, explicit ADMIN confirmation endpoint; two-evaluator and stale-write database tests passed.
- Read-only development evidence: 331 current skill rows and 468 submitted skill snapshots. All 256 rows whose `updatedBy` matches a current ADMIN account have a same-employee, same-skill, same-actor submitted snapshot within 60 seconds and the same status; 75 rows carry the qualification-migration marker. These 256 rows span 25 employees. Two rows also have a conflicting nearby snapshot, so temporal correlation is not a determination of the correct value.
- Review artifact: `.deployment-local/current-skill-provenance-review-20261009.csv` is intentionally Git-ignored. It contains only employee IDs, skill codes, status, actor/evaluation IDs and timestamps, with no employee names or HR fields. SHA-256: `9e5e0c560c4ce7235292f247e8a04e4bd28a78c8b3ddbe02331f099ed73173f8`.
- Treatment: managers inspect candidate rows against operational evidence and confirm only disputed statuses via the ADMIN current-skill API. No automatic merge, reset or historical rewrite is justified. Re-run `npx tsx scripts/audit-current-skill-provenance.ts` from `backend` for aggregate counts; `--write-review` creates a CSV only if that dated filename does not already exist.

### STORE-01 — Archive cleanup can leave ADMIN OPEN submissions

2026-10-09 update: fixed in source. The archive transaction's OPEN evaluation deletion now depends only on Round store ID and OPEN status. The pre-fix focused test failed twice; after the change it passed. A disposable PostgreSQL test created a CLOSED history result and a later OPEN round with both ADMIN and store evaluator submissions; archiving removed both OPEN rows, retained the CLOSED evaluation and Round, and deactivated the evaluator who lost its last store. Additional disposable PostgreSQL races showed Round creation and submission wait for an in-flight store archive then reject the archived store. Closing an OPEN Round after a concurrent archive first exposed PostgreSQL `40001`; this is now a clear 409. Archive itself retries serialization conflicts and returns 409 after three unsuccessful attempts. The normal 4000 service has not loaded the fix.

- Severity: P2
- Business impact: a dormant mutable ADMIN score may reappear after Store restore.
- Reproduction: isolated fixture with evaluator and ADMIN submissions, archive Store, inspect OPEN evaluations.
- File/lines: `backend/src/storeService.ts:77-108`.
- Code evidence: deletion filters evaluator IDs obtained only from `UserAccountStoreAccess`; ADMIN normally has none.
- Runtime/API/DB evidence: current live DB has no archived Store OPEN rows, so the defect is latent rather than currently corrupting data.
- Recommended fix: delete/exclude all evaluations whose round is OPEN in that Store, independent of access rows.
- Regression: archive/restore with evaluator plus ADMIN submissions; CLOSED untouched.

### A11Y-01 — Custom Store multi-select lacks complete keyboard model

- Status: fixed in the local candidate; actual screen-reader output is not yet checked.
- Pre-fix: Arrow/Home/End could not navigate options and search/action buttons were children of the listbox role.
- Current behavior: focus moves from search to options with ArrowUp/Down; options support ArrowUp/Down/Home/End and Enter/Space selection. Shift+Tab returns to search, forward Tab closes to the trigger, and Escape closes with trigger focus. Search remains a normal text input; an empty filter has no invalid active option. The listbox contains options only, and option focus, error and search focus states are visible.
- Validation: focused keyboard tests 2/2, existing account tests 3/3, full frontend 101/101, lint and production build passed. In isolated real Chrome, a generated ADMIN selected both fixture stores by Space/Enter, observed `aria-selected=true` and selected chips, then used Tab to exit. At narrow viewport, the popup stayed within the page width and application-origin console error/warn count was zero. No account was saved; schema, account, tab and services were removed.
- Remaining check: assistive-technology spot check in the target browser before claiming full screen-reader acceptance.

### SEC-01 — CSP and CORP are disabled

2026-10-09 update: fixed in the local candidate. Production responses now enforce `default-src`, `script-src`, `connect-src`, `base-uri` and `form-action` as self, `object-src` and `frame-ancestors` as none, and CORP as same-origin. `style-src 'unsafe-inline'` is retained for the current inline style and motion implementation. Development CSP/CORP stays disabled for the separate Vite origin. Header tests passed 2/2, backend TypeScript build and root lint passed. A disposable-schema production-mode browser loaded login, authenticated ADMIN dashboard and employee table with no app-origin CSP/console errors. The isolated service and schema were cleaned. An ignored credential-free `csp-smoke-dist` junction remains in the original worktree because automatic approval review rejected its removal; it is not a deployed artifact.

- Severity: P2
- Business impact: browser defense-in-depth against injected/foreign content is reduced.
- Reproduction: GET production-style response and inspect security headers.
- File/lines: `backend/src/app.ts:36`.
- Code evidence: `helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false })`.
- Runtime/API/DB evidence: source configuration is unconditional.
- Recommended fix: staged production CSP/CORP compatible with same-origin bundle/API.
- Regression: header assertions and browser smoke.

### SEC-02 — Shared login throttling, locally repaired

- Severity: P2, source and local database repaired; target deployment pending.
- Previous impact: restart or multiple service instances reset/split an in-memory limit.
- Code: `LoginRateLimitService` reserves attempts through atomic PostgreSQL upsert keyed by SHA-256 of Evaluate-visible IP and normalized username. Ten requests are allowed per 15 minutes; further requests return 429 and `Retry-After`. A successful login clears its key. Roster forwards the retry header. A proxied request may use Roster's upstream IP; arbitrary browser-forwarded IP headers must not be trusted.
- Runtime/API/DB evidence: two Prisma clients admitted exactly ten of 15 concurrent attempts; a new service remained blocked until expiry. Disposable production-mode HTTP returned ten 401s then 429 with `Retry-After: 900`, while a different account authenticated. Local development migration 37 was applied after backup; no production connection was used.
- Remaining boundary: the normal service processes still run earlier code. Paired local HTTP proved the shared bucket and 429 relay, but target load-balancer IP behavior, per-IP username spraying and edge abuse controls require operational monitoring and acceptance.

### TEST-01 — Core DB tests are optional and CI is absent

2026-10-09 current-state update: CI now exists at .github/workflows/validate.yml. It starts PostgreSQL 16, deploys and checks migrations, sets RUN_DATABASE_TESTS=1, and runs backend tests plus frontend/backend builds. The candidate branch is not pushed, so a remote workflow run remains unverified. The reproduction below describes the pre-fix baseline.

- Severity: P2
- Business impact: default green tests do not execute concurrency, trigger and access-update invariants.
- Reproduction: run backend `npm test`; observe 10 skipped, then set `RUN_DATABASE_TESTS=1`; observe execution.
- File/lines: `backend/tests/liveRoundDatabase.integration.test.ts:10-14`; `multiStoreAccountDatabase.integration.test.ts:11-15`.
- Code evidence: `describe.skip` unless environment flag is 1.
- Runtime/API/DB evidence: default 141 pass/10 skip; explicit isolated run 10/10 pass; no `.github` CI found.
- Recommended fix: mandatory CI PostgreSQL job.
- Regression: CI shows 151 executed, zero skipped.

### TEST-02 — Current-policy fixtures contain stale maxima

2026-10-09 update: fixed in the local candidate. The editable current-round and aggregate fixtures now use REGULAR_V3 `60/15/5/5/10/5`; aggregate components stay within their maxima and sum to 82.3. The CLOSED Employee Detail fixture keeps its historical weights with an explicit comment. New score-preview tests assert the six UI maxima for REGULAR_V3 and TRAINING_V2 `40/10/15/15/5/15`. Targeted 13/13, full frontend 97/97, lint and production build passed. This changes test data only; it does not alter backend scoring or historical snapshots. Remote CI is still pending.

- Severity: P2
- Business impact: UI tests can validate obsolete displays and miss current contract regressions.
- Reproduction: compare fixture policy/components to `scoringPolicyV1.ts`.
- File/lines: `src/components/evaluation-v1/EvaluationV1Form.test.tsx:55,157`; `src/pages/EvaluationRoundDetailPage.test.tsx:23,48`.
- Code evidence: fixtures include REGULAR 60/10/10/10/5/5 rather than REGULAR_V3.
- Runtime/API/DB evidence: live OPEN rows and browser current policy use correct V3, so issue is test fidelity.
- Recommended fix: shared policy builders and explicitly named legacy fixtures.
- Regression: current/legacy UI tests with valid component maxima.

### PERF-03 — Main frontend bundle exceeds warning budget

2026-10-09 current-state update: a fresh candidate production build passed, but Vite still warned on the 554.01 kB minified index chunk; the chart chunk was 349.64 kB. Routes already use React lazy. This P2 remains open for bundle analysis and a measured initial-load improvement.

- Severity: P2
- Business impact: slower cold load after free-tier wake and on mobile.
- Reproduction: `npm run build`.
- File/lines: route imports in `src/App.tsx`; chart/page imports.
- Code evidence: eager page graph; no effective route lazy split.
- Runtime/API/DB evidence: Vite emitted main JS 553.96 kB minified and warning above 500 kB.
- Recommended fix: route lazy loading and chart chunk isolation.
- Regression: enforce bundle budget and route smoke.

### LEGACY-01 — Multiple obsolete business models remain live

- Severity: P2
- Business impact: developers can select the wrong history/scoring model and expand attack/maintenance surface.
- Reproduction: reference search for periods, PerformanceNote, Grade, Risk and legacy manual dimensions.
- File/lines: `backend/src/routes.ts:108-109,265-295,345-350`; `backend/prisma/schema.prisma:22-40,393-407`; frontend PerformanceNote repository/types.
- Code evidence: endpoints/models remain while current UI uses CLOSED Round/Tier/V1 scoring.
- Runtime/API/DB evidence: no current page imports PerformanceNote repository or legacy history endpoint; tests keep them alive.
- Recommended fix: telemetry-backed deprecation and separate migration project.
- Regression: external-use audit and compatibility plan.

### DOC-01 — Deployment command documentation drifts from blueprint

2026-10-09 current-state update: `render.yaml` and `DEPLOYMENT.md` now specify the same build command. It uses read-only `prisma:migrate:status`; the guide puts migrate deploy in a separate controlled step after target identity, backup, and SQL preflight. Local command alignment is repaired; target deployment execution remains unverified. The original bullets below describe the pre-fix finding.

- Severity: P3
- Business impact: manual operators may deploy without the command currently encoded in Render.
- Reproduction: compare `DEPLOYMENT.md` Build section with `render.yaml`.
- File/lines: `DEPLOYMENT.md` Build and Apply migrations sections; `render.yaml:5-7`.
- Code evidence: document example omits migrate deploy in build while blueprint includes it.
- Runtime/API/DB evidence: local migration runs pass; risk is operator inconsistency.
- Recommended fix: one approved deployment sequence in both files.
- Regression: clean rehearsal following documentation only.

### DEP-01 — Prisma toolchain advisory requires deployment triage

2026-10-09 current-state update: narrow checked-in overrides are present and fresh production-only audits in both candidate backends report zero vulnerabilities. Target image contents and remote audit execution remain unverified. The original bullets below describe the pre-fix finding.

- Severity: P3
- Business impact: advisory noise and possible build-time exposure; no confirmed app-runtime exploit.
- Reproduction: backend `npm audit --omit=dev` and `npm explain deepmerge-ts`.
- File/lines: `backend/package.json`, `backend/package-lock.json`.
- Code evidence: `deepmerge-ts` comes from `@prisma/config` via Prisma CLI; Prisma is declared dev dependency.
- Runtime/API/DB evidence: audit reports three high findings; builds/tests pass.
- Recommended fix: inspect final runtime artifact and upstream fixed versions before compatibility-tested upgrade.
- Regression: clean audit/SBOM and full migration/build suite.
