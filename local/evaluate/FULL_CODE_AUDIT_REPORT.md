# Evaluate Molly Full Code Audit Report

Audit date: 2026-09-14  
Mode: independent, evidence-driven, read-only audit

## 1. Executive Summary

**Verdict: NOT READY FOR INTERNAL PILOT.**

The core scoring and Round implementation is substantially healthier than the current dirty-worktree state suggests: policy math matches the latest contract, Tier boundaries are correct, operations skills count toward Skill Score, current submissions use one-row UPSERT semantics, close/submit locking is tested, multi-store authorization is re-resolved per request, and all automated suites passed when the normally skipped database tests were explicitly enabled.

The pilot verdict is nevertheless negative because three product/deployment defects remain:

1. CLOSED history identity/job snapshots are absent for every existing local historical round, and the API silently substitutes mutable current employee/store names.
2. The history backend returns ADMIN score/name fields to STORE_EVALUATOR callers; the frontend merely hides them.
3. Essential multi-store/job/schema migrations and runtime files are untracked, so current HEAD/Render cannot reproduce the audited local application.

A fourth acceptance blocker is evidentiary: no valid evaluator credential was available for the required real-browser STORE_EVALUATOR privacy/cross-store/account-switch run. No P0 was confirmed, but unresolved P1 items violate the stated contract.

## 2. Audit Scope

Reviewed project-owned root/config/docs/scripts, frontend `src`, backend `src`, Prisma schema/migrations/scripts, tests, deployment files, runtime APIs, read-only database invariants, dependencies, and ADMIN browser flows at five viewport widths. Existing reports were treated as clues only.

The audit did not modify application code, schema, migrations, dependencies, or business data. Database integration tests used isolated PostgreSQL schemas and dropped them afterward.

## 3. Current Architecture

- React 19 + TypeScript + Vite SPA, React Router, Tailwind-style utility CSS, Radix Select, Recharts, Framer Motion/GSAP.
- Express 5 API with cookie sessions, Zod validation, Prisma 6/PostgreSQL.
- Same-origin production deployment: Express serves `/api` and the Vite build.
- Domain center: Employee -> one OPEN EvaluationRound maximum -> one mutable Evaluation per evaluator -> close-time snapshots -> immutable CLOSED history.
- Multi-store evaluator access uses `UserAccountStoreAccess`; ADMIN receives global access by role.
- Store jobs are DB-defined and assigned through `EmployeeJobAssignment`.

## 4. Business Contract Compliance

| Contract area | Result | Evidence |
| --- | --- | --- |
| Roles only ADMIN / STORE_EVALUATOR | PASS | Prisma enum/auth context; no extra runtime auth role. |
| Multi-store evaluator scope | PASS in service/DB tests | `UserAccountStoreAccess`, request-time auth reload, shared `requireStoreAccess`. |
| Employee / Employment / Store Job separation | PASS in current code | Separate fields/models/DTO/job tags. |
| REGULAR 60/15/5/5/10/5 | PASS | `backend/src/scoringPolicyV1.ts`, policy `REGULAR_V3`; tests and OPEN DB rows agree. |
| TRAINING 40/10/15/15/5/15 | PASS | policy `TRAINING_V2`; tests and OPEN DB rows agree. |
| T1-T5 boundaries | PASS | backend authority and boundary tests. |
| Operations are scored skills | PASS | three BINARY definitions included in weighted denominator. |
| No Draft/autosave | PASS | form state local; no evaluation row created by GET; submit only. |
| Same-round resubmit overwrites | PASS | update existing row + delete/recreate immutable child snapshots while OPEN; DB integration test. |
| Close is immutable boundary | PASS | transaction, close-time snapshot and DB triggers; race tests pass. |
| Dynamic OPEN denominator / ADMIN excluded | PASS | current access query and database tests; live DB denominators match active accounts. |
| Store aggregate excludes ADMIN | PASS | aggregate code/tests and browser detail. |
| History is CLOSED Round | PASS with P1 snapshot defect | frontend calls `/evaluation-rounds/history`; query filters `status=CLOSED`. |
| Current official score is latest CLOSED aggregate | PASS | shared loader defaults to CLOSED; current pages use it. |
| Training -> Regular retains round policy | PASS | promotion changes Employee only; round snapshots remain fixed. |
| PII server-side separation | Mostly PASS; real evaluator runtime incomplete | explicit list/operational DTOs; ADMIN-only profile route; no PII in ADMIN operational responses. |

## 5. Frontend Findings

### Confirmed strengths

- Route table contains all requested core pages and protected admin routes.
- Evaluation form uses server policy metadata and server preview; it does not own Tier/weight authority.
- Loading, error, empty and retry states exist on History and major data pages.
- Submit/close buttons expose loading states and prevent repeat interaction; success toast and refetch/state updates are implemented.
- Navigation context validates internal `returnTo` paths (`src/lib/evaluationNavigation.ts:58-75`); browser History -> Round -> evaluation returned to the correct semantic source.
- Responsive browser inspection found no meaningful horizontal document overflow at 1920, 1366, 1024, 768 or 390 widths.

### Findings

- **PRIV-01 (P1):** role privacy is implemented as presentation logic in History. `EvaluationHistoryIndexPage.tsx:85-86` hides ADMIN score when `isAdmin` is false, but the backend payload still contains it.
- **A11Y-01 (P2):** StoreMultiSelect has listbox semantics without the standard Arrow/Home/End active-option model. Tab/click works, but it is not a complete custom listbox implementation.
- **TEST-02 (P2):** several current-looking UI test fixtures use old policy maxima. They can pass while the displayed current policy regresses.
- **PERF-03 (P2):** the main production chunk exceeds Vite's 500 kB warning threshold; route-level splitting is absent/insufficient.

## 6. Backend Findings

### Confirmed strengths

- Zod validates mutation/query inputs.
- Resource store scope is resolved from Employee/Evaluation/Round records rather than trusted client store IDs in core routes.
- Mutation-heavy account/delete/round workflows use transactions; Round entry/submit/close use advisory locking/serializable behavior.
- Safe logging redacts declared PII and credential/token keys; Zod errors do not echo full payload values.
- Operational employee and Roster projections explicitly select allowed fields rather than serializing Prisma models wholesale.

### Findings

- History service has no actor/role input and over-returns ADMIN metadata (P1).
- History pagination/job filtering and current aggregate loading are unbounded/in-memory (P2).
- Closed detail aggregate include is too broad and contains mutable EmployeeSkill relations (P2).
- Store archive cleanup is derived from access membership and can miss ADMIN OPEN submissions (P2).
- Login rate limiting is process-local (P2 operational security).
- Helmet disables CSP and CORP (P2 hardening).

## 7. Database Findings

### Invariants that held in live read-only checks

- No duplicate OPEN employee rounds.
- No duplicate round/evaluator submissions.
- No OPEN/CLOSED timestamp inconsistencies.
- No orphan evaluations, employee skills, evaluation skill snapshots, or access rows.
- No deleted account with active session/access.
- No cross-store or inactive job assignment.
- No archived Employee/Store with OPEN Round.
- Stored final tier/score pairs and policy totals were valid.

### Schema risks

- Cross-store EmployeeJob assignment is guarded in service logic, not by a composite database constraint. Direct SQL/buggy future service code can violate it.
- Evaluation retains extensive legacy Grade/Risk/eight-dimension columns and types, increasing ambiguity.
- `UserAccountStoreAccess` cascades on account/store deletion. Soft delete avoids normal history damage, but any future hard delete must remain blocked/controlled.
- CLOSED immutability triggers are a strong control and passed isolated migration/integration verification.

## 8. Migration Findings

- All 32 local migrations deploy successfully to an empty isolated database.
- The current local DB reports all 32 applied.
- Migration order and trigger restoration work in the isolated run.
- **DEPLOY-01 (P1):** the last three migrations are untracked; current Git HEAD does not contain the schema required by the dirty application.
- The new snapshot migration adds nullable fields and intentionally does not backfill old CLOSED rows. All 40 current historical rows remain null, but runtime fallbacks conceal this semantic loss.
- Production `render.yaml` runs `prisma migrate deploy`, which is correct only after migrations are committed.
- `DEPLOYMENT.md` still documents a different build command, creating operator drift.

## 9. Authentication / Authorization

- Sessions identify an account; every authenticated request re-reads `isActive`, `deletedAt`, role and active store accesses. Permission edits take effect on the next request.
- ADMIN derives all-store access from role and does not require join rows.
- Shared `requireStoreAccess`/scope helpers are used by core resource routes.
- Safe delete revokes sessions, removes access, removes OPEN mutable submissions, retains CLOSED evaluations, and protects self/last admin.
- Login cookies are HttpOnly/Secure-in-production/SameSite=Lax and production mutations validate origin.
- Runtime ADMIN checks passed. Runtime STORE_EVALUATOR verification remains blocked by invalid local test credentials (QA-01).

## 10. Multi-Store Accounts

- Many-to-many schema and DTOs are implemented.
- Isolated DB tests prove an evaluator counts once in each assigned Store, nowhere else, and session permission reload is immediate.
- Removal clears affected OPEN current submissions and leaves CLOSED snapshots intact in tests.
- Account UI supports multiple chips and role-specific all-store presentation.
- Risk is deployability, not core service behavior: migrations/runtime files are untracked.

## 11. Employee Management

- List DTO separates Employee Type, Employment Type, Store, status and jobs.
- List/search/job filter APIs are database-backed; sensitive HR fields are excluded.
- Training promotion preserves Employee identity and does not mutate existing Round snapshots.
- Job assignment validates Employee and Job Store in service code.
- Old `position=Staff` is not the current UI's authoritative job model, though legacy schema/docs references warrant staged cleanup.

## 12. Store Jobs

- `StoreJobDefinition` and `EmployeeJobAssignment` implement Store 1:N definitions and Employee N:M assignments.
- Initial `全岗` and `带训员` rows are idempotently seeded for active stores; existing employees are not guessed into jobs.
- Jobs have stable color tokens, ordering and active state; UI badges reuse them.
- DB data at audit time: four job definitions, two assignments, zero cross-store/inactive violations.
- Remaining integrity risk: database cannot itself enforce Employee.storeId == Job.storeId.

## 13. Employee Privacy / PII

- Employee list and operational detail responses use explicit projections and did not contain forbidden sensitive keys in ADMIN runtime checks.
- Full profile endpoint is ADMIN-only and source sets `Cache-Control: no-store`.
- Employee detail only fetches HR profile for ADMIN; profile state is local to the page and auth logout clears application state/cache.
- ADMIN UI masks TFN, BSB, bank account and Super account by default.
- Logs redact PII/token/password keys.
- **Gap:** a valid evaluator account was unavailable, so the required evaluator network/body and ADMIN->logout->evaluator browser-back test could not be completed. Code/tests support the intended boundary, but pilot acceptance needs runtime proof.

## 14. Live Scoring

- GET scoring context is read-only.
- Entering scoring may create an OPEN Round through explicit POST context entry, but creates no Evaluation row.
- Form changes remain in memory; dirty navigation warns; no autosave/Draft endpoint was found in the current form flow.
- PUT submit creates or updates one `roundId + evaluatorAccountId` row; old same-round child snapshots and AI runs are replaced, not versioned as user history.
- Double-submit UI guard and database uniqueness make duplicate Evaluation rows unlikely; isolated DB test confirms one row after two submissions.
- P2 semantic risk: submission also overwrites current EmployeeSkill for every skill, making the last evaluator current-profile authority.

## 15. Evaluation Rounds

- Partial unique index limits one OPEN round per Employee.
- Round/evaluator unique constraint limits one current submission.
- Employee advisory lock controls concurrent next-round creation; round advisory lock coordinates submit/close.
- OPEN denominator queries current active, non-deleted STORE_EVALUATOR access; ADMIN never joins that set.
- Numerator and aggregate include only eligible evaluator submissions; missing evaluators are not zeroes.
- ADMIN current evaluation is returned separately and excluded from store aggregate.
- Close snapshots eligible membership, latest evaluations, final aggregate/policy/type/jobs/name and sets `closedAt`.
- Database triggers reject CLOSED Round/evaluation/snapshot mutations.
- DB race tests passed. Store archive ADMIN-score cleanup remains a gap.

## 16. Evaluation History

- Route and page are functional; browser/API returned 40 CLOSED rows.
- Query root is `EvaluationRound.status = CLOSED`; OPEN rounds do not appear.
- Filters exist for Store, Employee Type, Employee, date, Tier, Job; ordering is `closedAt`, `createdAt`, `id` descending.
- Detail is read-only and shows final aggregate, denominator snapshot, policy/type, individual snapshots and ADMIN separately to ADMIN.
- Source-aware Back navigation worked in browser.
- **HIST-01 (P1):** every existing CLOSED row lacks new identity/job snapshots. Employee/store fallbacks are current data, not historical truth.
- **PRIV-01 (P1):** list backend returns ADMIN fields regardless role.
- **PERF-01 (P2):** job filter/pagination occurs after loading all rows.
- Legacy `/api/evaluations/history` remains alongside the correct Round endpoint.

## 17. Skill / Tier / Policy

- Server policy authority is explicit:
  - REGULAR_V3: 60 / 15 / 5 / 5 / 10 / 5.
  - TRAINING_V2: 40 / 10 / 15 / 15 / 5 / 15.
- Tier v2: T5 <40, T4 <60, T3 <70, T2 <85, T1 >=85.
- 13 active skills include three BINARY operations (opening, closing, weekly cleaning), all included in the weighted skill denominator.
- Backend calculates category breakdown and frontend displays returned metadata.
- Closed browser detail correctly preserved a legacy 50-point Skill policy instead of recomputing it.
- Historical parser supports older policy versions. Forty legacy rounds lack policyId but have valid snapshots and remain interpretable.

## 18. Dashboard / Analytics

- Official metrics are based on CLOSED aggregates by default, not OPEN temporary scores.
- Tier distribution includes T5; current policy and employee-type filters are supported.
- Analytics skill categories use current EmployeeSkill as designed for current capability.
- Major P2 risk: shared aggregate loader materializes all historical round graphs and deduplicates in memory.

## 19. Skill Board

- Uses current skills and official latest CLOSED aggregate; sorting uses numeric score, not tier string.
- Operations are presented as operational capability, not qualification voting.
- Store scope is applied server-side; Roster DTO is minimal.
- Browser layout remained usable at 390px with table/scroll behavior intact.
- It inherits current EmployeeSkill last-submitter semantics and full-history aggregate-loader cost.

## 20. Roster Integration

- Read-only DTO includes jobs `{id,name,colorToken}` without duplicating the job authority.
- Store Jobs are not automatically mapped to Roster ShiftRole, and Skills remain separate.
- Service uses explicit minimal Employee/job/skill fields; forbidden HR PII was not observed in source projection.
- Consumer compatibility is documented in `MULTI_STORE_AUTH_INTEGRATION.md`, but that file is untracked and no live consumer contract run was available.

## 21. Dead Code

High-confidence current-runtime orphans/candidates are detailed in `DEAD_CODE_CANDIDATES.md`: legacy period/history APIs, unused frontend PerformanceNote repository, parked PerformanceNote backend, legacy Grade/Risk/manual dimension schema, duplicate AI models, stale fixtures, old reports, and ignored generated Prisma output.

No files were deleted. Historical migrations must remain.

## 22. Redundant Files

- Multiple old audit/readiness/cleanup reports are point-in-time artifacts and should be indexed/archived to prevent stale claims being mistaken for current state.
- Generated Prisma output exists locally but is ignored and not imported by current runtime.
- No tracked `dist`, coverage, node_modules, logs, zip or backup artifacts were found.

## 23. Performance

Primary risks:

1. History pagination is in memory after unrestricted round loading.
2. Dashboard/Analytics/Skill Board/Roster official-score loading expands full evaluation and skill graphs for all history.
3. Closed detail over-fetches mutable current skill rows.
4. Main frontend chunk is 553.96 kB minified.

At the current 29 employees/40 closed rounds these are not yet catastrophic; at 500 employees and multi-year history they become material. Indexes exist for common Round status/store/employee and job access paths, but query shape must be fixed before indexes alone help.

## 24. Dependencies

- Frontend production audit: clean.
- Backend audit: Prisma toolchain chain reports three high advisories through `deepmerge-ts`; determine whether the Render runtime artifact contains the affected CLI path before upgrading.
- No evidence of two competing UI libraries controlling the same base select; Radix is used for AppSelect while StoreMultiSelect is custom.
- Motion dependencies are both present and used; no deletion recommendation without bundle profiling.

## 25. Tests

- All available tests passed when database integration was explicitly enabled.
- Default backend command skips the 10 tests that validate the most important concurrency/database invariants.
- No CI workflow was found.
- Test weaknesses are concentrated in history compatibility/privacy, browser role matrix, high-volume performance, account deletion races, Store archive ADMIN scores, and stale current-policy fixtures.
- See `TEST_COVERAGE_GAP_MATRIX.md`.

## 26. Responsive / Accessibility

- ADMIN pages checked at 1920x1080, 1366x768, 1024x768, 768px and 390px.
- No app-level console errors, clipping, or meaningful document overflow found.
- Dialog implements focus capture, Tab loop, Escape and focus restoration.
- Toast uses aria-live; loading buttons use aria-busy in critical flows; reduced-motion classes exist.
- StoreMultiSelect keyboard listbox behavior is incomplete (P2).
- Evaluator-only responsive layouts remain unverified due credentials.

### Frontend technical quality score

| # | Dimension | Score | Key finding |
| --- | --- | ---: | --- |
| 1 | Accessibility | 3/4 | Strong focus/dialog/toast work; custom Store multi-select lacks arrow-key listbox navigation. |
| 2 | Performance | 2/4 | Main bundle exceeds 500 kB and several data pages inherit unbounded aggregate reads. |
| 3 | Responsive Design | 3/4 | Five ADMIN viewport widths passed without meaningful overflow; evaluator-only surfaces remain unverified. |
| 4 | Theming | 2/4 | Coherent Molly palette, but many literal colors/gradients and no complete dark-mode implementation. |
| 5 | Anti-Patterns | 3/4 | Interface is restrained and task-oriented; some wide shadows/gradient decoration and repeated card surfaces remain. |
| **Total** |  | **13/20** | **Acceptable, significant hardening still needed** |

**Anti-pattern verdict:** PASS with reservations. The UI does not read as an uncontrolled AI-template gallery: typography, density, semantic badges, status copy and responsive tables are consistent. The main tells are decorative gradient/shadow concentration in login/state moments and repeated card containers, not systemic visual confusion.

**Positive findings:** familiar admin navigation, consistent 44px critical controls, useful skeleton/empty/error states, readable Chinese labels, restrained state motion, reduced-motion fallbacks, semantic status text in addition to color, and a well-implemented modal focus trap.

Recommended frontend follow-up after the P1 backend/history work:

1. **P2 `$impeccable harden`**: complete StoreMultiSelect keyboard semantics and role-specific error/403 verification.
2. **P2 `$impeccable optimize`**: route-level code splitting and bounded data loading for History/Analytics/Skill Board.
3. **P3 `$impeccable document`**: record the actual Molly color/elevation/control tokens to reduce hard-coded drift.
4. **P3 `$impeccable polish`**: final contrast, shadow and cross-role responsive pass.

These can be run one at a time, together, or in a different order after the audit is approved. Re-run `$impeccable audit` after fixes to measure the score again.

## 27. Data Integrity

The local database is structurally consistent for open/closed state, uniqueness, tier/policy totals, job/store assignment, deleted accounts and orphans. The sole widespread integrity/compatibility deficit is snapshot completeness: 40/40 CLOSED rows lack newly introduced employee/store/job snapshot fields.

No data was repaired or backfilled.

## 28. P0 Findings

No P0 was confirmed. In particular, the audit did not reproduce cross-store access, wrong current policy math, duplicate OPEN rounds, duplicate current submissions, mutable CLOSED rows, or destructive history loss.

This is not equivalent to proving absence: evaluator browser credentials blocked one important runtime security matrix.

## 29. P1 Findings

1. HIST-01 — historical employee/store/job snapshot completeness and mutable fallback.
2. PRIV-01 — ADMIN score/name over-returned by history API to evaluator callers.
3. DEPLOY-01 — critical schema/runtime changes untracked and therefore not reproducible/deployable from HEAD.
4. QA-01 — required STORE_EVALUATOR real-browser privacy/scope verification blocked by stale test credentials.

## 30. P2 Findings

History and aggregate query scaling; closed-detail overfetch; current-skill last-submitter ownership ambiguity; Store archive ADMIN ghost submission; StoreMultiSelect keyboard model; disabled CSP/CORP; process-local limiter; optional DB tests/no CI; stale policy fixtures; oversized main bundle; legacy dual APIs/models.

See `RISK_REGISTER.md` for impact, evidence and regression requirements.

## 31. Recommended Remediation Order

1. Make history response role-aware and add forbidden-field route tests.
2. Decide and implement honest legacy snapshot compatibility; never present current fallbacks as immutable snapshot values.
3. Review and commit one coherent source+migration set; rehearse clean-clone and upgraded staging deployment.
4. Provision safe test evaluator credentials and complete multi-account browser/network verification.
5. Fix Store archive cleanup and resolve current EmployeeSkill ownership semantics.
6. Move History pagination/filtering and latest official-round selection into SQL with bounded projections.
7. Make DB integration mandatory in CI and update stale policy fixtures.
8. Complete keyboard accessibility/CSP/rate-limit hardening and bundle splitting.
9. Deprecate legacy APIs/models only after telemetry and historical data review.

## 32. Internal Pilot Verdict

# NOT READY FOR INTERNAL PILOT

Reason: unresolved P1 historical truth, backend role-data minimization, and deployment reproducibility defects, plus incomplete real STORE_EVALUATOR browser verification. Reassess only after those items are fixed and their specified regression/browser evidence passes.
