# Evaluate Molly Audit Baseline

Audit date: 2026-09-14 (Australia/Sydney)  
Audit mode: read-only application audit. No source, schema, migration, package, or business-data mutation was authorized. The only repository writes made by this audit are the six requested Markdown reports.

## Repository state

- Workspace: `E:\PY Study\Evaluate Molly`
- Branch: `main`
- HEAD: `001af54` (`Deploy production migrations during Render build`)
- Recent commits: `001af54`, `16c3045`, `fcc2aab`, `e3b0f34`, `ff5a2d7`
- The worktree was already materially dirty before this audit: 51 modified files and multiple untracked application files/migrations.
- Important untracked runtime work includes:
  - `backend/prisma/migrations/20260909110000_expand_multi_store_account_access/`
  - `backend/prisma/migrations/20260909120000_contract_legacy_account_store/`
  - `backend/prisma/migrations/20260913110000_store_jobs_and_round_job_snapshot/`
  - `backend/src/storeJobService.ts`
  - new account/history/job/multi-store tests and frontend components.
- `need to do.md` is an unrelated user-owned untracked file and was not touched.

## Toolchain and dependencies

| Item | Observed version/state |
| --- | --- |
| Node | `v20.19.0` |
| npm | `10.8.2` |
| TypeScript | `5.9.3` |
| Prisma CLI / Client | `6.19.3` / `6.19.3` |
| React | `19.2.7` installed |
| React Router | `7.18.2` |
| Vite | `7.3.6` |
| Vitest | `4.1.8` |
| Express | `5.2.1` |
| PostgreSQL migration count | 32 |

## Commands and outcomes

| Check | Command | Result |
| --- | --- | --- |
| Frontend unit/component tests | `npm test -- --run` | PASS: 25 files, 94 tests. jsdom prints a non-failing `window.scrollTo` not-implemented message. |
| Backend default tests | `npm test -- --run` in `backend` | PASS: 25 files; 141 passed, 10 skipped. |
| Core DB integration tests | `RUN_DATABASE_TESTS=1` with the two integration files | PASS: 2 files, 10 tests, isolated PostgreSQL schemas created and dropped by the tests. |
| Frontend build/typecheck | `npm run build` | PASS. Main JS 553.96 kB minified (186.67 kB gzip), with Vite's >500 kB chunk warning. |
| Frontend ESLint | `npm run lint` | PASS. |
| Backend build | `npm run build` | PASS after stopping only the backend process that held Prisma's Windows DLL; backend was restarted and health rechecked. |
| Prisma validation | `npm run prisma:validate` | PASS. |
| Local migration status | `npm run prisma:migrate:deploy` / status inspection | 32 migrations applied; database up to date. |
| Empty database migration | `prisma migrate deploy` against an isolated database/schema | PASS from zero through all 32 migrations; isolated target removed afterward. |
| Frontend production dependency audit | `npm audit --omit=dev` | 0 vulnerabilities. |
| Backend production dependency audit | `npm audit --omit=dev` | 3 high advisories through `deepmerge-ts -> @prisma/config -> prisma`; `prisma` is declared as a dev dependency but npm includes an optional peer path from `@prisma/client`. Needs deployment-context triage, not an automatic upgrade. |

## Start and deploy commands

- Local: `scripts/start-dev.ps1`; frontend `127.0.0.1:5174`, backend `127.0.0.1:4000`, health `/api/health`.
- Render build: `npm ci --include=dev && npm --prefix backend ci --include=dev && npm --prefix backend run prisma:migrate:deploy && npm run render:build`.
- Render start: `npm run render:start`.
- Deployment risk: the build correctly runs `migrate deploy`, but Git-untracked migrations are invisible to Render until committed and pushed.

## Environment and secret hygiene

- `.env`, `backend/.env`, logs, `dist`, generated Prisma client, and `LOCAL_ACCOUNT_CREDENTIALS.md` are ignored.
- Only example environment files are tracked.
- `git log --all -- .env backend/.env LOCAL_ACCOUNT_CREDENTIALS.md` returned no tracked history.
- No tracked build, coverage, node_modules, log, zip, or backup artifacts were found by the audit search.
- A local ignored credential file exists. Its values were not copied into any report.

## Runtime and data baseline

Read-only local database counts at audit time:

| Entity/check | Count/result |
| --- | ---: |
| Stores | 2 |
| Employees | 29 |
| OPEN rounds | 10 |
| CLOSED rounds | 40 |
| Evaluations | 53 |
| Active STORE_EVALUATOR accounts | 3 |
| Duplicate OPEN round groups | 0 |
| Duplicate round/evaluator submissions | 0 |
| CLOSED without `closedAt` | 0 |
| OPEN with `closedAt` | 0 |
| Closed rounds missing final aggregate despite submissions | 0 |
| Invalid stored tier/score boundaries | 0 |
| Deleted accounts with active sessions/access | 0 / 0 |
| Cross-store job assignments | 0 |
| Orphan evaluation/skill/account-access rows | 0 |
| CLOSED rounds missing employee/store/job snapshots | 40 |

OPEN progress reflected current active store access: Hurstville denominators were consistently `/2`; Green Square denominators were consistently `/1`. No stale `/2` versus `/3` mismatch existed in the current local data because current active account counts are 2 and 1 respectively.

## Browser baseline

- ADMIN read-only flows checked: dashboard, employees, employee detail, history, closed round detail, historical individual evaluation, accounts, stores, analytics, skill board, regular/training store lists.
- Viewports checked: 1920x1080, 1366x768, 1024x768, 768px, and 390px.
- No application console errors or horizontal document overflow were observed; console warnings came from a browser extension.
- `/evaluations/history` loaded 40 CLOSED rounds and History -> Round -> Individual evaluation navigation worked read-only.
- STORE_EVALUATOR browser/API verification was blocked because all locally documented evaluator credentials returned 401. Credentials were not reset in this read-only audit.
- The browser connection became unavailable after the completed checks, so no further browser mutation or cleanup was attempted.

## Scope caveat

Passing tests and builds establish mechanical health only. They do not override the P1 findings in the full report: missing historical identity snapshots, backend exposure of ADMIN score metadata to evaluator callers, and undeployable untracked production migrations/code.
