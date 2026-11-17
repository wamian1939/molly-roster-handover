# Audit Fix Log

Audit date: 2026-09-06

Browser evidence note: after the user reconnected Chrome, the full authenticated acceptance suite ran in an isolated schema with one ADMIN and three STORE_EVALUATOR accounts. The inline evidence below reflects the final browser rerun; temporary browser data was deleted afterwards.

## Live round denominator drift

- Issue: employee rows could show inconsistent `/1`, `/2`, or `/3` denominators in the same store.
- Severity: P0 business correctness.
- Reproduction: OPEN rounds used historical `EvaluationRoundEvaluator` membership snapshots created at different times.
- Root cause: mutable live eligibility was read from immutable round membership.
- Fix: OPEN denominator and numerator now query current active STORE_EVALUATOR accounts in the round store; ADMIN is excluded. Membership rows are written only during close.
- Tests: three-evaluator isolated DB scenarios prove 0/3, 1/3, 2/3 and dynamic account addition.
- Browser verification: passed; every OPEN employee row used the current store denominator `/3`.

## Draft/autosave lifecycle contradicted final business model

- Issue: opening/leaving scoring could create or restore a Draft and lock later entry behavior.
- Severity: P0 workflow correctness.
- Reproduction: old entry route created a row before explicit submission and form autosave patched it.
- Root cause: evaluation identity doubled as a Draft workspace and historical record.
- Fix: form edits are memory-only, GET is read-only, preview/AI analysis do not persist, and PUT submit is the only evaluation write.
- Tests: GET before/after row counts unchanged; exit-without-submit unit coverage; route write-method assertions.
- Browser verification: passed; entering, changing, and leaving without submit created no Evaluation.

## Same-round submissions created the wrong immutable boundary

- Issue: evaluator submission was treated as final and rescore paths created history rows.
- Severity: P0 business correctness.
- Root cause: individual Completed status was used as the history boundary.
- Fix: unique `(roundId,evaluatorAccountId)` plus transaction UPSERT; OPEN submissions remain editable and CLOSED rounds are immutable.
- Tests: submit 70 then 80 leaves one row at 80; no prior revision is returned.
- Browser verification: passed; A resubmitted in one OPEN round and the same row changed from 90.3 to 82.3 with version 1.

## CLOSED round database protection was missing after enum migration

- Issue: application checks existed but the PostgreSQL immutability trigger had been dropped by an enum-rebuild migration.
- Severity: P0 data integrity.
- Reproduction: isolated-schema test updated a CLOSED evaluation successfully.
- Root cause: migration recreated the `Evaluation` table without recreating its historical trigger.
- Fix: formal migration `20260905214000_restore_closed_evaluation_trigger` restores six freeze triggers for round, evaluation, skill snapshot, AI run/evidence, and membership data.
- Tests: isolated DB mutation is rejected; integrity script reports 6/6 triggers.
- Browser verification: not applicable to the database constraint.

## ADMIN scoring and aggregate roles were mixed

- Issue: viewing aggregate could consume/create ADMIN scoring state; ADMIN score could enter store progress/average.
- Severity: P0 business correctness.
- Root cause: aggregate access and “my evaluation” ownership shared broad read/create logic.
- Fix: aggregate GET is read-only; scoring context is explicit; ownership is `(round,current account)`; ADMIN score is displayed separately and excluded from STORE_EVALUATOR progress and average.
- Tests: role/scope route tests and isolated DB aggregate assertions.
- Browser verification: passed; ADMIN aggregate viewing created no score, and ADMIN 62.3 remained separate from store 79.3 and progress 2/3.

## Close and automatic next-round lifecycle

- Issue: CLOSED rounds could permanently lock an employee or require manual next-round setup.
- Severity: P0 workflow correctness.
- Root cause: scoring entry selected historical state instead of atomically acquiring an OPEN round.
- Fix: only ADMIN may close; partial close snapshots current eligibility and aggregate; next score atomically gets/creates exactly one new OPEN round.
- Tests: 2/3 close at 75, immutable Round 1, automatic Round 2, concurrent creation produces one round.
- Browser verification: passed; ADMIN closed at 2/3, history froze, and the next evaluator score opened Round 2 automatically.

## Qualification opinion model conflicted with skills

- Issue: opening, closing, and weekly cleaning were non-scoring qualification votes/consensus.
- Severity: P0 scoring correctness.
- Root cause: legacy employee qualification fields and aggregate UI existed outside SkillDefinition.
- Fix: operations are BINARY weighted skills in OPERATIONS; legacy capability data is migrated; aggregate opinion UI/API/model removed.
- Tests: all-can-do versus cannot-do changes Skill ratio and Overall; category ratios and operation count are exact.
- Browser verification: passed; operation skills rendered in the four skill groups and no qualification voting UI appeared.

## Policy and Tier authority drift

- Issue: Regular/Training weight changes and T5 could be recomputed inconsistently across pages.
- Severity: P0 scoring correctness.
- Root cause: historical policy assumptions and presentation-specific Tier logic.
- Fix: server-owned `REGULAR_V2` 60/10/10/10/5/5, `TRAINING_V1` 20/10/25/25/10/10, tier policy v2, and immutable policy snapshots.
- Tests: policy totals/boundaries, 0/39.99/40/59.99/60/69.99/70/84.99/85/100 Tier cases, legacy snapshot compatibility.
- Browser verification: passed; Training displayed 20/10/25/25/10/10, Regular displayed 60/10/10/10/5/5, and T1-T5 rendered correctly.

## Training-to-Regular history mutation risk

- Issue: changing the current employee type could silently reinterpret an OPEN Training round or old history.
- Severity: P1 historical correctness.
- Root cause: policy/type were sometimes inferred from current Employee.
- Fix: transition updates only current Employee type; OPEN round and completed history retain type/policy snapshots; future rounds use Regular V2.
- Tests: employee identity, skills/profile/history retained and new Regular max is 60.
- Browser verification: passed; Training rounds remained `/20`, the same employee was promoted, and the next Regular round used `/60` while old history stayed Training.

## Navigation returned to role-guessed pages

- Issue: evaluation/round Back actions could return to overview or wrong employee type.
- Severity: P1 usability.
- Root cause: return route was inferred from role or browser history.
- Fix: shared safe internal return resolver, explicit source context, semantic store/type deep-link fallback, and dynamic labels.
- Tests: Regular, Training, round-to-individual, refresh/deep link, and external/protocol-relative rejection.
- Browser verification: passed for list-to-score, list-to-round, round-to-individual, deep-link fallback, and external `returnTo` rejection.

## Sensitive employee fields could influence broad search

- Issue: summary-list search risked querying HR-only identity/contact fields.
- Severity: P1 privacy boundary.
- Root cause: employee list query mixed summary and profile concerns.
- Fix: list/select/search stay on `displayName` and operational fields; full profile endpoint is ADMIN-only; logs redact sensitive keys.
- Tests: evaluator profile 403, cross-store 403, list DTO contains no PII keys, query-shape and safe-logging tests.
- Browser verification: passed; evaluator navigation exposed no ADMIN sections or sensitive HR values, while ADMIN profile remained masked by default.

## CLOSED Round Detail exposed a scoring entry

- Issue: read-only historical round could still render the “我的评分” action.
- Severity: P1 UX/immutability signal.
- Root cause: action visibility was role-based but did not also require OPEN status.
- Fix: scoring action and close controls render only for OPEN rounds; CLOSED detail remains read-only.
- Tests: dedicated frontend CLOSED-round assertion.
- Browser verification: passed; CLOSED Round Detail had no scoring action and individual detail was frozen.

## Hidden mock fallback and stale lifecycle copy

- Issue: dead fallback services/docs and Draft/Completed copy obscured real error and live-round semantics.
- Severity: P1 operability.
- Root cause: legacy demo behavior survived architecture changes.
- Fix: deleted fallback runtime, rewrote API/product docs, and standardized 未评分/已评分/再次评分 copy.
- Tests: repositories fail closed; user-visible Draft-language negative tests.
- Browser verification: passed; no Draft, fallback, qualification-vote, or legacy lifecycle copy appeared in the tested flows.

## Touch targets on core workflows

- Issue: several compact scoring/list/round controls were below a dependable touch target.
- Severity: P2 accessibility/responsive.
- Root cause: desktop-first padding values.
- Fix: core navigation, submit, rating, skill status, row action, dialog, type selector, and pagination controls now meet the 44px target.
- Tests: lint, typecheck, frontend suite, and production build pass; static impeccable detector reports no findings.
- Browser verification: passed on the mobile class and 1366x768 / 1920x1080 desktop classes with no document-width overflow.

## Browser-discovered Round snapshot presentation defects

- Issue: OPEN individual details were labeled as historical, immutable snapshots; their capability count initialized as `0/13`; the score card also displayed `已完成`. The History index still exposed evaluator-oriented Completed terminology instead of CLOSED rounds.
- Severity: P1 semantic correctness and navigation clarity.
- Root cause: read-only presentation was conflated with historical CLOSED state, preview coverage initialized with a literal zero, and the History UI still consumed its legacy individual-evaluation vocabulary.
- Fix: OPEN read-only and CLOSED historical states now render separately; coverage initializes from the saved skill snapshot; `已完成` is bound only to CLOSED history; History lists Round number, type snapshot, progress, aggregate, and close time and links to Round Detail.
- Tests: dedicated OPEN/CLOSED presentation and 13/13 coverage regression, round-history rendering test, backend roundNumber DTO assertion, plus full frontend/backend suites.
- Browser verification: passed on OPEN and CLOSED individual detail, History desktop/mobile, and Employee Detail with Training plus Regular rounds.

## Store Management query crashed against the current Prisma schema

- Issue: `/api/stores/manage` returned HTTP 500 and the ADMIN Store Management page showed zero stores.
- Severity: P1 operational failure.
- Root cause: `StoreService` still requested `_count.activities`, `_count.performanceNotes`, and `_count.aiAnalysisRuns` after those Store relations had been removed from the current Prisma schema.
- Fix: reduced the management count selection and frontend DTO to the live `employees`, `evaluations`, and `userAccounts` relations, while retaining the separately derived active-evaluator count.
- Tests: added a StoreService query-shape/DTO regression; focused backend test and TypeScript check pass.
- Runtime verification: isolated PostgreSQL API changed from HTTP 500 to HTTP 200 and returned both seeded stores.

## Skill live summary waited for unrelated ratings

- Issue: changing an operation skill updated the local form but left Skill score and category breakdown stale until every manual rating was filled.
- Severity: P1 scoring transparency.
- Root cause: the only preview endpoint required a complete evaluation payload, so the form skipped server preview while ratings were incomplete.
- Fix: added a read-only, server-authoritative skill preview endpoint accepting all current skill states, including `Unknown`; incomplete skill sets return a null component score and never treat Unknown as CannotDo.
- Tests: frontend interaction test verifies `/60` and operation counts update without ratings; backend service and route tests verify Unknown semantics and no persistence.

## User-facing archive conflict exposed an internal Round ID

- Issue: the archive/store-change conflict message included the internal Round identifier.
- Severity: P2 error-model hygiene.
- Root cause: a diagnostic value was embedded directly into an actionable 409 message.
- Fix: retained the actionable Chinese guidance and removed the technical identifier; technical context remains available to server logs.

## Safe logging missed secondary HR identifiers

- Issue: the redaction set covered the core bank/tax fields but omitted USI, super fund name, visa type, and the literal `DATABASE_URL` key.
- Severity: P1 privacy hardening.
- Root cause: the original denylist was narrower than the final employee profile contract.
- Fix: expanded both key-value and JSON redaction patterns and added regression fixtures for every added field.

## Integrity verifier counted objects from disposable schemas

- Issue: the local database integrity report showed 12 freeze triggers and a missing round-scope foreign key even though migrations and isolated tests were healthy.
- Severity: P2 audit reliability.
- Root cause: PostgreSQL catalog queries filtered by object name but not by `current_schema()`, so active disposable acceptance/test schemas contaminated counts.
- Fix: joined catalog objects to `pg_namespace` and limited trigger/constraint evidence to the current application schema.

## Employee history Round rows were disabled controls

- Issue: the visible CLOSED Round history row in Employee Detail could not be opened by keyboard or pointer.
- Severity: P1 navigation/accessibility.
- Root cause: current Round history reused a disabled legacy individual-evaluation disclosure button.
- Fix: Round history uses a real link to Round Detail with employee-detail source context and a safe return target; legacy entries retain disclosure behavior.
- Tests/browser: dedicated route/returnTo assertion and final Employee Detail/History navigation review pass.

## Async page loads could commit stale responses

- Issue: Account, Store, Employee, and Round views could update after unmount or let an older request overwrite a newer filter result.
- Severity: P2 state correctness.
- Root cause: loaders lacked lifecycle and request-sequence guards; one initial guard also failed to re-arm under StrictMode remount.
- Fix: added mounted/active and sequence checks that re-arm on each effect setup.
- Tests: frontend suite, StrictMode-compatible page tests, TypeScript, and build pass.

## Management archive actions used native confirmation

- Issue: native confirms had inconsistent focus/copy behavior and were not reliably testable through connected Chrome.
- Severity: P2 accessibility/testability.
- Fix: Store and Employee archive flows use the shared focus-trapped Dialog, block duplicate actions, and provide explicit cancel/confirm labels.
- Tests: Dialog focus trap/Escape/restore plus confirmation-before-write regression pass.

## Read-side transforms contained quadratic joins

- Issue: Store roster filtered the full OPEN-round array for every employee, and aggregate reads filtered every live account for every Round.
- Severity: P2 scale/performance.
- Root cause: array scans were used as joins after batched database queries.
- Fix: build employee-to-round and store-to-account maps once, preserving bounded Prisma query counts.
- Verification: disposable-schema 25/100/500 benchmarks pass; 500 employees measured 69.5 ms roster, 303.8 ms Skill Board, 146.4 ms Dashboard, and 148.1 ms Analytics.

## Integrity audit conflated legacy and current denominator snapshots

- Issue: an expanded audit initially classified 39 old CLOSED rounds with null snapshot counts as current-model mismatches.
- Severity: P2 audit accuracy/historical safety.
- Root cause: pre-snapshot compatibility rows and post-refactor close snapshots used different expected completeness.
- Fix: report legacy null snapshots separately; compare membership/submission counts only for rounds that carry the new close-time count snapshot.
- Evidence: 39 legacy-compatible rows retained, zero new-model denominator mismatches, and no historical row rewritten.

## Skill Summary lacked instant category readability

- Issue: category cards exposed data but did not communicate strength, progress, and completion at a glance.
- Severity: P2 workflow clarity.
- Root cause: the summary used compact text-only metrics with no shared visual capacity cue.
- Fix: introduced four responsive category instruments with explicit percentage, confirmed/capable counts, textual level, and accessible battery-style progress bars. Skill total and confirmation progress now have a clear primary/secondary hierarchy; all animation honors reduced motion.
- Verification: component regression, production build, visual review, and width checks passed at desktop and narrow viewport classes with no document-level overflow.

## Round Detail lacked an explicit small-item average contract

- Issue: ADMIN could infer component means from `components`, but the API and UI did not define a stable small-item average panel or denominator semantics; Operations used current profile data instead of the Round snapshots.
- Severity: P1 management explainability.
- Root cause: aggregate components and skill categories evolved independently without a presentation DTO.
- Fix: added server-owned `itemAverages` for six component point means and four category mastery means. All four categories now average immutable submitted EvaluationSkillSnapshot data. ADMIN and unsubmitted accounts remain excluded.
- Verification: unit tests cover empty/null behavior, denominators, partial participation, and Operations snapshot averaging; Chrome confirmed 46.0/60, 8.0/10, 10.0/10, 10.0/10, 5.0/5, 2.5/5 and 70/70/70/100 category means for the isolated Round.

## Mutations did not provide one consistent, durable feedback cycle

- Issue: submit/update/close offered limited loading text and could leave users relying on indirect page changes; close failure replaced the entire page.
- Severity: P1 interaction confidence.
- Root cause: no shared transient-feedback layer and no action-specific error boundary.
- Fix: added one shared accessible Toast provider, spinner/disabled/`aria-busy` states, first-vs-update copy, old-to-new score feedback, dirty reset on success, in-flight ref guards, preserved inputs on failure, and close-specific errors that keep the OPEN page and Dialog usable.
- Verification: automated tests and Chrome covered first submit, repeated update, rapid double action, offline failure, HTTP 500, recovery, close failure, and immediate CLOSED state after success.
