# Final Production Audit Report

Audit date: 2026-09-06
Target: local `Evaluate Molly` workspace and PostgreSQL `evaluate_molly` database

## 1. Executive Summary

The core product was refactored from Draft/Completed individual evaluations to live per-evaluator submissions within an OPEN round and an ADMIN-created immutable CLOSED snapshot. Scoring, category breakdown, Training-to-Regular history, navigation, store scope, PII boundaries, migration discipline, and failure behavior were aligned with the master business contract. Automated, API/database, and real multi-account Chrome acceptance evidence is green.

## 2. Final readiness verdict

**READY FOR INTERNAL PILOT**

No P0 or P1 defect remains known after automated, isolated PostgreSQL, authenticated multi-account Chrome, and responsive visual verification. No production deployment was performed.

## 3. Business model verification

- OPEN round: one current mutable submission per evaluator.
- No Draft, autosave, resume Draft, or Draft placeholder behavior.
- Explicit submit is the evaluation write boundary.
- ADMIN close is the immutable historical boundary.
- New scoring after close automatically opens the next round.
- Formal current score is the latest CLOSED store aggregate, not an OPEN temporary average or latest individual score.

## 4. Frontend audit

Routes and entry intentions are separated: employee-list scoring opens `/my-score`; ADMIN aggregate opens Round Detail; individual evaluation detail is read-only. Loading/error/empty states are API-authoritative, touch targets were hardened, and stale Draft/Qualification/fallback UI was removed. Frontend test, lint, typecheck, static UI audit, and production build pass.

## 5. Backend audit

Round ownership, live submission UPSERT, close transaction, aggregate separation, store scope, and DTO scoring authority are centralized in services rather than React. GET routes do not create rounds/evaluations/membership. Only explicit scoring-context acquisition may create an OPEN round; only PUT submit creates/updates an Evaluation.

## 6. Database audit

Current integrity result: 48 rounds, 0 evaluations without a round, 0 duplicate OPEN rounds, 0 duplicate evaluator submissions, 42 historical Completed-compatible evaluations, 10 live submissions, no obsolete Draft table, 43 membership snapshots, composite round-scope FK present, and all 6 CLOSED immutability triggers present. There are also zero round/timestamp mismatches, orphan Skill snapshots, orphan EmployeeSkills, archived-employee OPEN rounds, invalid policy snapshots, or new-model closed-denominator mismatches. The 39 legacy CLOSED rounds without denominator snapshot fields are explicitly classified as pre-snapshot compatibility data and were not rewritten.

## 7. Auth / Store Scope

Database sessions back browser authentication. ADMIN has global read/manage scope. STORE_EVALUATOR can score only active employees in its assigned store, update only its own round submission, and cannot access aggregate/breakdown, full HR profile, or close-round operations. Live API smoke returned 403 for cross-store, aggregate, and profile attempts.

## 8. Multi-evaluator scoring

The OPEN denominator is the current count of active STORE_EVALUATOR accounts for the store. Numerator counts distinct eligible evaluators with a current submitted row. Repeated submissions do not increment progress. Local Hurstville currently has 2 active evaluators; the isolated three-account test proves all employee rounds use `/3` and immediately react to evaluator activation.

## 9. Round snapshot model

ADMIN may close at partial or full completion. The close transaction calculates the store-only final aggregate from submitted eligible STORE_EVALUATOR scores, snapshots eligible/missing membership and policy/type data, stores `closedAt`, and changes status to CLOSED. ADMIN score is preserved separately. Database triggers block later mutation.

## 10. Scoring policies

- `REGULAR_V2`: Skill 60, Speed 10, Initiative 10, Attitude 10, Availability 5, Text 5.
- `TRAINING_V1`: Skill 20, Speed 10, Initiative 25, Attitude 25, Availability 10, Text 10.
- Frontend displays server-returned policy metadata and does not own weight constants.
- Historical `REGULAR_V1` and Training legacy snapshots remain parseable and are not recalculated.

## 11. Tier rules

Tier policy v2 is shared by both employee types: T5 `[0,40)`, T4 `[40,60)`, T3 `[60,70)`, T2 `[70,85)`, T1 `[85,100]`. Boundary tests cover 0, 39.99, 40, 59.99, 60, 69.99, 70, 84.99, 85, and 100. Legacy snapshot Tier values remain readable.

## 12. Skill model

Progressive skills retain Unknown/NotTrained/Training/Independent/Proficient factors. Opening, closing, and weekly cleaning are `BINARY` OPERATIONS skills with Unknown/CanNotDo/CanDo semantics and weight 1 each. Unknown is incomplete rather than silently zero. They enter the Skill denominator and affect Overall. Backend returns weighted Skill total and Back of House, Water Bar, Front of House, and Operations category results.

## 13. Employee Type

Current `Employee.employeeType` drives only the policy for a new round. Each round/evaluation retains `employeeTypeSnapshot`, so current type and last-evaluation standard can be shown independently.

## 14. Training to Regular

ADMIN can promote the same Employee record from Training to Regular. Identity, store, profile, EmployeeSkill, rounds, and history remain. An existing OPEN Training round remains Training; the next new round snapshots Regular V2. No reverse conversion or new Employee is introduced.

## 15. Employee profile / PII

Summary DTOs exclude legal name, contact, address, visa, bank, tax, and super fields. Broad list search does not query these fields. Full HR profile is ADMIN-only; evaluator API access is 403. Safe logging tests cover sensitive-key redaction. Environment files are gitignored; tracked database strings are placeholders only.

## 16. Navigation

`evaluationNavigation.ts` resolves Back targets from explicit source state/query, accepts only safe single-slash internal paths, rejects external/protocol-relative values, and falls back using round/evaluation store and employee-type snapshots. Return behavior is source-driven, not role-driven.

## 17. Dashboard

Current formal metrics use the latest CLOSED round aggregate. OPEN temporary averages do not overwrite formal scores. Tier distribution includes T5 and empty aggregate is represented as unavailable rather than zero.

## 18. Analytics

Analytics uses server-calculated current formal round data and current EmployeeSkill category coverage. It supports Regular/Training filtering, T1-T5, normalized category metrics, and finite batched query sets rather than per-row reads.

## 19. Skill Board

Skill Board retains the detailed current capability matrix, exposes compact category coverage and operation capability states, supports T5, and sorts by numeric Overall rather than Tier text. It reads current EmployeeSkill rather than mutating historical snapshots.

## 20. Responsive

Core controls use minimum 44px targets and responsive table/card patterns. Authenticated Chrome review passed at the requested 390px mobile class and 1366x768 / 1920x1080 desktop classes. Employee Detail, Evaluation, Round Detail, and History showed no document-width overflow.

## 21. Accessibility

Core actions have explicit labels, non-color status text, keyboard-capable native/Radix controls, visible focus styles, reduced-motion handling, and larger targets. Browser interaction used native links, buttons, radio groups, dialogs, and the unsaved-change confirmation successfully.

## 22. Performance

Dashboard/analytics/round reads use bounded grouped queries; no evaluator-by-employee N+1 loop was found. Two quadratic in-memory joins were replaced by employee/store maps. Disposable-schema tests with 13 skills per employee measured, respectively for 25/100/500 employees: Store roster 12.9/12.3/69.5 ms, Skill Board 25.0/57.9/303.8 ms, Dashboard 20.5/18.0/146.4 ms, and Analytics 10.1/17.4/148.1 ms. Frontend routes are lazy-loaded and Skill cells do not each mount an expensive animation.

## 23. Dead code removed

Draft entry, fallback-mode runtime/data, Qualification summary, obsolete completion dialog, and an unreferenced Quick Notes component were removed. Their replacements and evidence are recorded in `CLEANUP_LOG.md`.

## 24. Files deleted

Deleted frontend product/test files: 8. Deleted/replaced obsolete backend tests: 2. Applied migration history was preserved. See `CLEANUP_LOG.md` for per-file reason, reference search, replacement, tests, build, and browser status.

## 25. Dependencies removed

The unused direct root `esbuild` dev declaration was removed; Vite retains its own compatible transitive dependency. Import audit confirmed all runtime dependencies are used: Framer Motion, GSAP, `@gsap/react`, and Recharts each have production consumers. Root npm audit is clean. Backend `npm audit` reports the three-item Prisma/config/deepmerge tooling chain documented under P2.

## 26. Migrations

There are 28 ordered migrations and `prisma migrate status` reports up to date. New migrations introduce employee-type policy snapshots, multi-evaluator rounds, scope constraints, T5/Training policy, operation skills, live rounds, legacy enrichment, Draft/activity cleanup, and restored CLOSED immutability triggers. Migration deploy, not db push, is the supported path.

## 27. Automated tests

- Frontend: 22 files, 80 passed.
- Backend default: 20 passed files plus 1 intentionally gated DB file; 117 passed and 5 skipped.
- Isolated PostgreSQL integration: 1 file, 5 passed, including rapid duplicate-submit and close-versus-submit races.
- ESLint: pass.
- Frontend TypeScript: pass.
- Backend TypeScript/build: pass.
- Prisma validate/status: valid and up to date.

## 28. Browser manual tests

Completed as three distinct real-UI passes in an isolated PostgreSQL schema with one ADMIN, three same-store STORE_EVALUATOR accounts, and one cross-store evaluator. The final adversarial sequence used HandoverEmployee006: ADMIN aggregate visit caused no Evaluation row; an abandoned Skill change was absent on re-entry; A submitted 71.5 and B submitted 83.5 for `2 / 3` and aggregate 77.5; A updated to 83.5 and the database still held exactly one A row while the old 71.5 disappeared; close froze `2 / 3` and 83.5; A then submitted 97.5/T1 into a different automatically created Round; History retained only the CLOSED result. All 12 named core screens were revisited with no error state; source navigation, Training `/20`, Regular `/60`, four Skill groups, management dialogs, T5, scope, and immutable detail were rechecked. Exact 390px and requested desktop-class visual evidence passed. The isolated schema, processes, and temporary credential file were removed after final verification.

## 29. Production build

Frontend Vite 7.3.6 production build passes. Backend Prisma client generation and TypeScript production build pass after stopping only the Windows backend processes that held the query-engine DLL, then restoring the development services. A separate production-mode process against the disposable database returned 200 for health and a React deep link, rejected unknown API access, omitted `X-Powered-By`, included Helmet `nosniff`, and served a bundle with no localhost API URL. Frontend port 5174 and backend health on port 4000 were restored.

## 30. Remaining P0/P1/P2

- P0: none known.
- P1: none known.
- P2: backend `npm audit` (also with `--omit=dev`) reports 3 high entries in the Prisma -> `@prisma/config` -> `deepmerge-ts` chain. The installed production tree includes Prisma through `@prisma/client`'s peer chain, although the affected config merge path is tooling/configuration rather than an exposed application route. npm proposes an unsafe forced downgrade to Prisma 6.12.0, so it was not applied without a separate compatibility cycle.
- P2: Prisma warns that the package.json seed configuration should move to a Prisma config before Prisma 7.

## 31. Deferred decisions

- No scheduler/deadline automation was added; ADMIN close remains the explicit snapshot action.
- Same-round evaluator revisions are intentionally not retained.
- Concurrent EmployeeSkill writes use the latest submitted current capability; historical evaluator snapshots remain independent.
- Upgrading to Prisma 7 and its config format should be a separately tested maintenance change.

## 32. Deployment readiness

Code, migrations, builds, database integrity, runtime health, and local authenticated browser acceptance support an internal pilot. A production deployment should still run the normal environment-specific migration, bootstrap/login, dependency-risk review, and smoke checklist. No production deploy or push was performed.

## 33. Internal Pilot readiness

**READY FOR INTERNAL PILOT**

The named ADMIN plus three STORE_EVALUATOR scenarios, live overwrite, dynamic denominator, partial close, automatic next round, source-aware return, Training-to-Regular snapshots, sensitive-profile boundary, and responsive visual checks passed. Remaining P2 items are maintenance work and do not block the pilot.

## 34. Incremental acceptance addendum

The Skill Summary, ADMIN small-item aggregate, and shared submission-feedback increment passed automated, database, build, and Chrome acceptance. The Round API now owns point averages and `/100` category mastery averages; the UI names their denominator and excludes ADMIN/unsubmitted accounts. Evaluation and close mutations provide immediate loading, action-specific success, state synchronization, retry-safe errors, and double-action protection. Current totals are 85 frontend tests, 118 default backend tests plus 5 gated skips, and 5 isolated database tests. No new P0/P1 issue was found, so the internal-pilot verdict is unchanged.
