# Architecture Consolidation Report

Audit date: 2026-09-06

## Business authority boundaries

- `scoringPolicyV1.ts` is the single authority for policy IDs, weights, Skill factors, component scores, Overall, categories, and Tier V2.
- `evaluationRoundService.ts` owns OPEN/CLOSED lifecycle, advisory locking, dynamic eligibility, close snapshots, store-only aggregate, and ADMIN score separation.
- `evaluationV1Service.ts` owns live form context, server preview, one-row evaluator UPSERT, immutable historical reads, and current EmployeeSkill update.
- `roundAggregateRead.ts` centralizes current/final Round projection for dashboard, analytics, roster, list, profile, and history consumers.
- `evaluationNavigation.ts` centrally validates internal return targets and derives semantic Regular/Training/Round/Employee fallbacks.
- `presentation.ts` and `EmployeeTypeBadge.tsx` centralize employee-type, category, status, and policy presentation.

## Eliminated split-brain paths

- Removed Draft/autosave/get-or-create Evaluation routes and state. Opening a form creates at most the OPEN Round context; submission alone creates/updates the evaluator row.
- Removed qualification-vote/consensus UI and aggregate fields. Opening, closing, and weekly cleaning are weighted BINARY SkillDefinitions.
- Removed fallback/mock runtime paths that could make API failures look successful.
- Separated ADMIN aggregate view from personal scoring. Round GET is read-only; My Score is explicit.
- Formal Current Score and History now use CLOSED Round aggregate snapshots; OPEN averages are explicitly temporary.

## Query and performance consolidation

- Store roster fetches employees, closed aggregates, OPEN rounds, and live eligible accounts in bounded batch queries.
- Replaced per-employee filtering of all OPEN rounds with an indexed Map lookup, removing an O(employee × open-round) transform.
- Replaced per-round filtering of all live accounts with a per-store Map, removing an O(round × account) transform.
- Dashboard/Analytics/Skill Board load Skill and Round data in batches; no per-employee Prisma request loop exists.
- Disposable-schema benchmarks (13 skills per employee):

| Employees | Store roster | Skill Board | Dashboard | Analytics |
|---:|---:|---:|---:|---:|
| 25 | 12.9 ms | 25.0 ms | 20.5 ms | 10.1 ms |
| 100 | 12.3 ms | 57.9 ms | 18.0 ms | 17.4 ms |
| 500 | 69.5 ms | 303.8 ms | 146.4 ms | 148.1 ms |

The 500-row Skill Board is intentionally the heaviest response because it contains 6,500 current Skill cells; it remains a single batched fetch and avoids cell-level JavaScript animation.

## Database authority

- Partial unique index: one OPEN Round per employee.
- Unique `(roundId, evaluatorAccountId)`: one current submission per evaluator per Round.
- Composite Round/Employee/Store foreign key prevents cross-scope attachment.
- CHECK constraint keeps OPEN/CLOSED and `closedAt` consistent.
- Six triggers freeze CLOSED Round, evaluation, Skill snapshot, AI, evidence, and membership records.
- Close-time membership and final components/score/Tier are snapshots; current account changes cannot rewrite history.

## Deliberate non-refactors

- `EmployeeManagementPage.tsx` is large because it owns the page, filters, list/card views, and the full protected profile editor. Its internal sections are already locally isolated and tested. A file split would be mostly mechanical and was deferred to avoid destabilizing PII form behavior during this business-model release.
- Prisma 6 was not force-downgraded or upgraded to 7 solely for an audit score. The development-tool advisory is documented for a separately tested dependency cycle.
