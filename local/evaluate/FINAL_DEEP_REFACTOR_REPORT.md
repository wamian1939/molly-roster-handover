# Final Deep Refactor Report

Audit date: 2026-09-06
Verdict: **READY FOR INTERNAL PILOT**

## 1. Core model delivered

Evaluate Molly now uses a live submission plus ADMIN snapshot model. An active evaluator has at most one mutable submitted Evaluation per OPEN Round. There is no Draft/autosave lifecycle. ADMIN close is the immutable boundary, and the next scoring action after close automatically creates the next Round.

## 2. Root causes removed

- Round membership snapshots were being reused for live denominators, producing `/1` and `/2`; OPEN progress now derives from current active same-store `STORE_EVALUATOR` accounts.
- ADMIN read authority had been confused with Evaluation ownership; all My Score lookups now include the current account, while Round Detail remains read-only.
- Completed evaluation identity had acted as a permanent scoring lock; CLOSED history is immutable while a new OPEN Round is always available for active, authorized employees.
- Draft creation/autosave coupled page visits to writes; form state is now memory-only until explicit submit.
- Qualification voting conflicted with the final capability model; the three operation capabilities are weighted BINARY skills and voting/consensus was removed.
- Current and historical policy/type/Skill data had ambiguous consumers; Round and Evaluation snapshots now preserve the original semantics while current EmployeeSkill remains independently updateable.

## 3. Scoring and history

- Regular V2: 60/10/10/10/5/5.
- Training V1: 20/10/25/25/10/10.
- Shared Tier V2: T5 below 40, T4 40–<60, T3 60–<70, T2 70–<85, T1 85–100.
- Opening, closing, and weekly cleaning each have weight 1 and enter the Skill denominator.
- Backend-owned category breakdown covers Back of House, Water Bar, Front of House, and Operations.
- Training-to-Regular keeps the same Employee, current skills, full profile, and history; an existing Training Round remains Training and the next Round snapshots Regular V2.

## 4. Architecture and cleanup

- Server services own all scoring, aggregate, Round, permission, and snapshot decisions.
- A shared aggregate reader, navigation resolver, employee-type presentation, and Dialog remove duplicated authority.
- Removed Draft UI/routes/tests/storage, qualification aggregate UI, mock fallback runtime, obsolete activity storage, orphan components/scripts, unused helpers, and the direct unused `esbuild` dependency.
- Retained all historical migrations, old policy snapshots, and compatibility data.
- Replaced two quadratic read-side joins with Map-based joins and verified 25/100/500 employee performance.

## 5. Safety and integrity

- Store scope is enforced for every evaluator read/write; ADMIN-only aggregate, close, HR profile, account, and store controls remain protected.
- GET business routes are read-only. Scoring context can create only an OPEN Round; submit creates/updates the current Evaluation.
- Database constraints enforce one OPEN Round, one evaluator row per Round, Round/Employee/Store consistency, and status/timestamp validity.
- Six database triggers freeze CLOSED Round data and dependent snapshots.
- Current integrity audit reports no duplicate live authority, orphan snapshots/skills, invalid current Round state, or new-model denominator mismatch.

## 6. Verification

- Frontend: 22 files / 80 tests.
- Backend: 20 files / 117 tests plus 5 database-gated skips in the default run.
- Isolated PostgreSQL: 5/5, including concurrency races and database-trigger immutability.
- ESLint, both TypeScript projects, frontend/backend builds, Prisma validate, 28-migration status, fresh-schema deploy, integrity audit, dependency audit, and production-mode smoke pass.
- Three Chrome passes covered authentication, scope, no-save exit, update-in-place, 2/3 aggregate, ADMIN separation, close, automatic next Round, Training transition, history, navigation, responsive behavior, and 12 final visual surfaces.

## 7. Remaining non-blocking work

- Backend npm audit reports a high advisory chain in Prisma's configuration tooling. npm's proposed automatic fix is an incompatible downgrade; handle this in a dedicated Prisma dependency cycle.
- Move the deprecated package-level Prisma seed setting to a Prisma config before Prisma 7.
- `EmployeeManagementPage.tsx` remains large. Its PII editor is locally isolated and covered; a mechanical file split is deferred until a separate low-risk cleanup.
- Automatic deadline scheduling remains intentionally out of scope; ADMIN manually ends the Round.

## 8. Incremental Skill Summary and Round item averages

- Evaluation Skill Summary now reads as one capability instrument: Skill score is primary; confirmation and roster coverage are secondary; each of the four categories shows percentage, progress count, completion level, and an accessible capacity bar.
- ADMIN Round Detail exposes server-calculated average Skill, Speed, Initiative, Attitude, Availability, and Text component points with the locked policy maximum, plus Back of House, Water Bar, Front of House, and Operations average mastery on a `/100` scale.
- Only submitted active Store Evaluators participate. ADMIN remains separate and missing submissions are not zero. Each Round belongs to one employee and one locked type/policy, so Regular and Training denominators cannot mix inside a Round.

# Submission Feedback System

- **Loading state:** submit, update, and close switch immediately to a spinner, action-specific progress copy, `aria-busy`, and disabled state.
- **Success state:** first submit announces `评分已提交`; overwrite announces `评分已更新` and can show old-to-new Overall; close announces `本轮评价已结束`. The page model updates with the response in the same cycle.
- **Error state:** network and 5xx failures say that changes were not saved, preserve all form values, restore the button, and keep Round close Dialog plus OPEN state available for retry.
- **Double-submit protection:** synchronous in-flight refs guard before React rerender; backend `roundId + evaluatorAccountId` UPSERT uniqueness remains the authoritative idempotency boundary.
- **Dirty state:** successful submit resets dirty state; unsuccessful work retains the unsaved-navigation guard.
- **Round close feedback:** success immediately replaces provisional labels with final score, closed status, and `closedAt`, then removes the close action. Failure does not replace the page.
- **Toast architecture:** one root provider supplies short, top-safe-area, screen-reader-live success/error notifications to both flows. Reduced-motion removes the transition.
- **Browser QA:** Chrome passed first submit, repeated updates, rapid double action, disconnected backend, real HTTP 500, successful recovery, close failure, and close success. No application console error was observed; logged warnings came from an unrelated installed wallet extension.

## 9. Incremental verification

- Frontend: 22 files / 85 tests.
- Backend: 20 files / 118 tests plus 5 intentionally gated skips.
- Isolated PostgreSQL: 5/5.
- ESLint, frontend build, backend build, Render-style combined build, Prisma validation, 28-migration status, integrity verifier, and restored 5174/4000 health passed.
- Browser: 390px, 1366x768, and 1920x1080 viewport classes passed without document-width overflow. The isolated Round database contained exactly one Evaluation row per tested account, froze at 1/3 and 81.5, and the disposable schema was removed.

## 10. Incremental remaining issues

- No new P0 or P1 issue remains from this increment.
- The previously documented Prisma dependency advisory and Prisma 7 seed-config migration remain P2 maintenance items.
