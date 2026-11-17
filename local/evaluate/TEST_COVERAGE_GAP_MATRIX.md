# Test Coverage Gap Matrix

Audit date: 2026-09-14

## Executed suites

- Frontend: 94/94 passed across 25 files.
- Backend default: 141 passed, 10 skipped across 25 files.
- Backend isolated DB: the 10 normally skipped tests were explicitly enabled and all passed.
- Build/typecheck, lint, Prisma validation, current DB migration status and empty-schema migration all passed.

## Coverage gaps

| Area | Existing evidence | Missing or weak evidence | Priority / proposed test |
| --- | --- | --- | --- |
| Multi-store authorization | Unit/route tests and 5 isolated DB tests cover access update, denominator and safe deletion. | Real browser account using valid single/multi-store credentials; IDOR response-body verification. | P1: authenticated browser/API matrix without password reset. |
| History DTO privacy | History service tests cover rows/filter basics. | No assertion that STORE_EVALUATOR responses omit `adminScore` and `adminEvaluatorName`; implementation currently returns them. | P1: role-aware route/service response-shape test. |
| Historical name/job snapshots | Close logic has snapshot fields and current tests cover close behavior. | No upgraded legacy-data test where snapshot fields are null; no rename-after-close immutability test. | P1: migrate legacy fixture, rename masters, verify stable history semantics. |
| Production migration completeness | Empty database can apply all local migrations. | No clean-clone or committed-file gate; three migrations are untracked. | P1: CI fails if Prisma schema diff is not represented by tracked migrations. |
| PII network boundary | Backend operational DTO unit tests and ADMIN profile route restrictions exist; ADMIN runtime payload checked. | Real STORE_EVALUATOR network response and ADMIN->logout->evaluator cache/back test blocked by invalid credentials. | P1: dedicated browser fixture plus JSON forbidden-key scanner. |
| Submit/close concurrency | 5 isolated DB tests passed, including submit-close races. | These tests are skipped by the normal command and no CI is present. | P2: mandatory CI Postgres job with `RUN_DATABASE_TESTS=1`. |
| Account deletion concurrency | Self/last-admin and deletion behavior tested. | Concurrent deletion/demotion of different ADMIN accounts and Prisma serializable retry UX not tested. | P2: two-transaction race and 409/retry contract tests. |
| Store archive | Unit tests cover archive and multi-store continuation. | No ADMIN OPEN submission fixture; current implementation can leave it behind. | P2: evaluator+ADMIN open scores, archive, restore, assert zero live rows. |
| Current skill ownership | Scoring tests prove operations count and submissions update EmployeeSkill. | No two-evaluator test documenting last-write-wins/current-profile authority. | P2: submit A then B and reverse order; product acceptance required. |
| History performance | Pagination UI/service basics tested. | No query-count, payload or high-volume tests; pagination is in memory. | P2: seed 5,000 closed rounds and assert bounded SQL/payload. |
| Dashboard/Analytics/Skill Board scale | Functional page/service tests exist. | No lifetime-history scale test; shared loader materializes full round graphs. | P2: 500 employee/multi-year benchmark and query plan. |
| Current policy UI | Backend policy boundary tests are strong. | Some UI fixtures use old current weights; historical/current fixture intent is not explicit. | P2: policy metadata factory tests for REGULAR_V3 60/15/5/5/10/5 and TRAINING_V2 40/10/15/15/5/15. |
| Source-aware navigation | Unit coverage checks safe paths and History links. | No full browser refresh/deep-link matrix for every source; browser spot checks covered History and Round. | P2: Playwright route matrix including external `returnTo` rejection and scroll restoration. |
| Accessibility | Dialog focus trap and several keyboard interactions are tested. | StoreMultiSelect lacks arrow/Home/End active-option behavior; no automated axe scan. | P2: keyboard contract and axe scan at desktop/mobile. |
| Responsive | Browser audit covered five widths with no document overflow. | No automated screenshot/overflow regression suite and evaluator-only layouts unverified. | P3: visual snapshots at 1366 and 390 for role variants. |
| Login rate limiting | Route tests cover basic behavior. | No restart or multi-instance behavior test. | P3: infrastructure-level distributed limiter test or documented limitation. |
| Roster integration | DTO/service/routes tested; no PII fields found in minimal projection. | No consumer contract test against a live Molly Roster version. | P2: versioned JSON contract fixture shared with Roster. |
| Legacy endpoints | Unit tests keep old endpoints alive. | No telemetry proves they have external consumers; no deprecation tests. | P3: access-log audit before removal. |

## Test quality assessment

The suites are useful and caught many business invariants, but their default green state is overly optimistic because database integration is opt-in and critical browser role coverage depends on undocumented/stale credentials. Current tests are strongest around scoring math, route validation, Round UPSERT/close mechanics, and multi-store service rules; weakest around historical compatibility, role-specific response minimization, high-volume query behavior, and complete browser security flows.
