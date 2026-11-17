# Evaluate Molly Project Audit Map

Audit date: 2026-09-05

Per-file authority: `FILE_AUDIT_MATRIX.md` classifies the complete 222-path Git/current-worktree inventory, including deleted tracked paths, migrations, tests, configs, reports, and runtime assets. Ignored build/dependency/generated directories are classified separately there.

## Runtime and entry points

| Area | Entry point | Responsibility |
| --- | --- | --- |
| Frontend | `src/main.tsx`, `src/App.tsx` | React application, authenticated route tree, lazy-loaded product pages |
| Backend | `backend/src/server.ts`, `backend/src/app.ts` | Express runtime, security middleware, session authentication, API router |
| Local startup | `scripts/start-dev.ps1` | Prisma client generation, optional migration deploy, backend on 4000, frontend on 5174 |
| Deployment | `render.yaml`, `DEPLOYMENT.md` | Render build/start contract and database configuration guidance |
| Database | `backend/prisma/schema.prisma` | PostgreSQL models, enums, relations, indexes, and migration authority |

## Product route map

| Frontend route | Page | Access and role |
| --- | --- | --- |
| `/login` | `LoginPage` | Public |
| `/evaluations` | `DashboardPage` | Authenticated, store-scoped for evaluator |
| `/evaluations/stores/:storeId` | `StoreEmployeeTypeSelectionPage` | Authorized store |
| `/evaluations/stores/:storeId/employees/:employeeType` | `StoreEvaluationPage` | Authorized store and semantic employee-type list |
| `/evaluation-rounds/:roundId/my-score` | `LiveEvaluationPage` | Own live score in OPEN round |
| `/evaluations/v1/:evaluationId` | `EvaluationV1Page` | Read-only individual evaluation detail |
| `/evaluation-rounds/:roundId` | `EvaluationRoundDetailPage` | ADMIN aggregate/read/close page |
| `/evaluations/history` | `EvaluationHistoryIndexPage` | CLOSED rounds only |
| `/evaluations/analytics` | `EvaluationAnalyticsPage` | Current CLOSED-round analytics |
| `/skill-board` | `RosterSkillBoardPage` | Current EmployeeSkill capability board |
| `/employees`, `/employees/:employeeId` | Management and detail | Role-filtered employee operations and profile detail |
| `/stores`, `/accounts` | Management pages | ADMIN only |

## Backend service map

| Service | Authority |
| --- | --- |
| `evaluationRoundService.ts` | one OPEN round per employee, dynamic eligible denominator, close transaction, historical membership snapshot |
| `evaluationV1Service.ts` | in-memory preview and AI analysis, explicit live submission UPSERT, individual detail DTO |
| `roundAggregateRead.ts` | STORE_EVALUATOR-only aggregate versus separate ADMIN submissions |
| `scoringPolicyV1.ts` | versioned Regular/Training weights, T1-T5 policy, binary/progressive factors, category calculations |
| `evaluationReadService.ts` | dashboard/store/history/analytics read models using CLOSED rounds for formal current score |
| `employeeService.ts` | employee CRUD, archive/restore, Training-to-Regular, summary versus sensitive profile boundary |
| `rosterSkillBoardService.ts` | current EmployeeSkill matrix and normalized category coverage |
| `auth.ts`, `accountService.ts` | database sessions, password hashing compatibility, role and store scope |
| `safeLogging.ts` | error sanitization and sensitive-value redaction |

## Data model map

Core models are `Store`, `UserAccount`, `AuthSession`, `Employee`, `EvaluationRound`, `EvaluationRoundEvaluator`, `Evaluation`, `SkillDefinition`, `EmployeeSkill`, `EvaluationSkillSnapshot`, `EvaluationAiRun`, `EvaluationAiEvidence`, and `PerformanceNote`.

Key invariants:

- `EvaluationRound`: OPEN is live and mutable; CLOSED is the historical boundary.
- Partial unique index permits at most one OPEN round per employee.
- `Evaluation(roundId, evaluatorAccountId)` is unique; same-round resubmission updates one row.
- OPEN denominator dynamically queries active `STORE_EVALUATOR` accounts in the round store.
- ADMIN submissions are separate from denominator and store aggregate.
- Close snapshots eligible membership and freezes the round and related evaluation/skill/AI rows with database triggers.
- `EmployeeSkill` is current capability; `EvaluationSkillSnapshot` is historical evaluator input.
- Operation skills are weighted `BINARY` skills in `OPERATIONS`, not qualification votes.

## Frontend state and navigation map

- Authentication is centralized in `src/auth/AuthContext.tsx`.
- API access is centralized in `src/services/*Repository.ts`; no mock fallback remains.
- Live form edits remain component memory until explicit submit.
- `src/lib/evaluationNavigation.ts` validates internal `returnTo`, resolves source-aware labels, and supplies store/type deep-link fallbacks.
- Employee list and Round Detail use separate scoring and aggregate entries.
- Individual detail is read-only; only `/my-score` provides editable live scoring.

## Test inventory

- Frontend: 22 files / 77 tests.
- Backend unit and route tests: 20 files / 113 tests, with one database suite gated from the default command.
- PostgreSQL integration: `backend/tests/liveRoundDatabase.integration.test.ts`, 4 tests against a temporary isolated schema.
- Integrity tools: `backend/scripts/verify-round-integrity.ts`, `backend/scripts/audit-live-scoring.ts`.
- Browser harness: `backend/scripts/browser-acceptance-environment.ts`, `backend/scripts/inspect-browser-acceptance.ts`, and `scripts/start-browser-acceptance.ps1` create, inspect, run, and clean a validated temporary-schema acceptance environment.

## Audit boundaries and verification

- All repository, API, migration, automated test, build, and database checks were run locally.
- Authenticated Chrome acceptance passed with one ADMIN and three STORE_EVALUATOR accounts, including live overwrite, `/3` denominator, partial close, next round, transition snapshots, safe navigation, and mobile/desktop visual review.
- Browser acceptance used an isolated schema and temporary generated accounts; all temporary resources were removed afterwards.
- No production deployment or external write was performed.
