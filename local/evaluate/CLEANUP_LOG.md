# Cleanup Log

Audit date: 2026-09-05

## Removed product files

### `src/pages/EvaluationV1DraftEntryPage.tsx`

- Reason: route embodied the retired Draft/get-or-create Evaluation lifecycle.
- Reference search: route tree and repository calls were moved to live scoring context routes.
- Replacement: `EvaluationEntryPage.tsx` and `LiveEvaluationPage.tsx`.
- Tests after deletion: frontend 77/77; backend 113/113; database integration 4/4.
- Build: frontend and backend production builds pass.
- Browser: verified through authenticated live-scoring, close, and automatic-next-round flows.

### `src/hooks/useFallbackMode.ts`, `src/services/fallbackStatus.ts`, `src/services/fallbackStatus.test.ts`, `src/data/fallbackBaseData.ts`

- Reason: unreachable mock-fallback runtime could hide API, authentication, and authorization failures.
- Reference search: consumers in `PageContainer` and management pages were removed; repository tests assert fail-closed behavior.
- Replacement: explicit loading/error/empty states backed by the API.
- Tests after deletion: frontend 77/77.
- Build: frontend production build passes.
- Browser: verified; API failures remain explicit and no mock fallback appeared.

### `src/components/employee-detail/QualificationSummary.tsx`

- Reason: Qualification voting/consensus was superseded by weighted BINARY operation skills.
- Reference search: no production Qualification UI/API/model references remain.
- Replacement: `ReadOnlySkillMatrix.tsx` and category/operation capability display.
- Tests after deletion: scoring policy, employee detail, aggregate, and Skill Board tests pass.
- Build: frontend and backend production builds pass.
- Browser: verified; operation skills appear as current capabilities without voting UI.

### `src/components/evaluation-v1/ConfirmCompleteDialog.tsx`

- Reason: old “Complete evaluation” boundary conflicts with live submission and ADMIN close-round semantics.
- Reference search: no imports remained after the live form refactor.
- Replacement: explicit submit action for OPEN round plus ADMIN close confirmation on Round Detail.
- Tests after deletion: frontend 77/77.
- Build: frontend production build passes.
- Browser: verified; explicit submit and ADMIN close are distinct actions.

### `src/components/evaluation/QuickNotesPanel.tsx`

- Reason: unreferenced legacy form component; formal scoring page no longer mounts it.
- Reference search: repository-wide import search found no consumer.
- Replacement: Performance Note API and employee-detail surfaces remain intact.
- Tests after deletion: frontend and backend suites pass.
- Build: frontend and backend production builds pass.
- Browser: not applicable to the removed unreferenced component; employee detail remained functional.

## Removed obsolete tests

### `backend/tests/evaluationV1Service.test.ts`

- Reason: asserted Draft autosave/Completed lifecycle that no longer exists.
- Replacement: `liveEvaluationV1Service.test.ts`, route tests, and isolated PostgreSQL round integration tests.

### `backend/tests/storeArchive.integration.test.ts`

- Reason: duplicated older integration harness and imported removed lifecycle fixtures.
- Replacement: store service/route tests plus the isolated-schema live-round integration harness.

## Removed one-off audit scripts

### `backend/scripts/browser-evaluator-fixture.ts`

- Reason: unreferenced legacy helper wrote a fixture account into the normal database and contained an unrelated ADMIN password-rotation path.
- Replacement: `browser-acceptance-environment.ts` creates random accounts only inside a validated temporary schema and provides an explicit cleanup command.

### `backend/scripts/list-active-skills.ts`

- Reason: one-off read script used during diagnosis, with no product or repeatable acceptance responsibility.
- Replacement: scoring/SkillDefinition assertions live in automated tests and the isolated browser fixture.

## Database cleanup

- Migration `20260905210000_remove_drafts_and_freeze_closed_rounds` discards obsolete unfinished Draft data, preserves submitted/historical evaluations, and establishes the new status semantics.
- Migration `20260905213000_remove_legacy_evaluation_activities` removes the unused revision/activity table.
- Historical migration folders were retained; no applied migration was rewritten.

## Dependency cleanup result

No runtime dependency was removed: every declared frontend and backend runtime package has a production import. Non-force audit fixes and frontend Vite/esbuild upgrades were applied. The remaining Prisma/config/deepmerge advisory chain is documented rather than forcing an unsafe Prisma downgrade; npm still reports it with `--omit=dev` because Prisma is present through the `@prisma/client` peer tree.

### Root `esbuild` declaration

- Removed the direct root `esbuild` dev dependency after import, script, and build-reference searches found no direct consumer. Vite continues to own its compatible transitive build dependency.
- Post-removal evidence: TypeScript, 79 frontend tests, ESLint, and the Vite production build pass; the root audit reports zero vulnerabilities.

### Unused symbol cleanup

- Removed small unconsumed exports/types from presentation, formatting, motion, repository, and roster utilities, plus a stale completed-evaluation mapper/include branch.
- Knip's remaining backend “unused files” are nested-package entrypoint false positives; the remaining exported DTO member types are part of public composite response types and were retained.
