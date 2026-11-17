# Dead Code and Redundant Artifact Candidates

Audit date: 2026-09-14  
This is a read-only candidate list. Nothing was deleted. Historical migrations are explicitly excluded from deletion recommendations.

| Candidate | Why it appears unused/redundant | Reference evidence | Deletion risk | Recommendation |
| --- | --- | --- | --- | --- |
| `GET /api/evaluations/history` + `EvaluationReadService.listCompletedHistory` | Current History repository calls `/evaluation-rounds/history`; no frontend runtime caller uses the legacy route. | `backend/src/routes.ts:345-350`; `backend/src/evaluationReadService.ts:105-115`; current call at `src/services/evaluationRepository.ts:62`. | Medium: an external client may still call it. | LEGACY-RETAIN now; add deprecation telemetry, then DELETE route/service branch separately. |
| `GET /api/evaluations/periods` + `EvaluationCatalogService.listPeriods` | Live Round scoring no longer uses evaluation periods; only backend tests reference the endpoint. | `backend/src/routes.ts:108-109`, `backend/src/evaluationCatalogService.ts`, route tests. | Medium: possible external client. | REVIEW then DELETE after access-log verification. |
| Frontend `performanceNoteRepository.ts` and PerformanceNote types | No current page/component imports it; only its own tests use it. | Search found references in repository tests/types, not current routes/pages. | Medium: feature may be intentionally parked. | LEGACY-RETAIN or move behind documented feature boundary. |
| Backend `performanceNoteService.ts`, routes, domain adapters | No current frontend runtime consumer, but API remains writable/readable and has tests. | `backend/src/routes.ts:265-295`, service/tests. | High: external use and persisted notes possible. | REVIEW; do not delete without data/use audit. |
| Prisma legacy `Grade`, `RiskLevel`, old eight manual dimensions and legacy score columns | Current V1 UI/services use Tier and V1 component columns; searches find these mostly in schema, compatibility objects and null-filled fixtures. | `backend/prisma/schema.prisma:22-40,393-407`; absence from current UI runtime. | High: historical rows and older migrations may depend on columns/types. | LEGACY-RETAIN; migrate only after production data profiling and API deprecation. |
| `AiAnalysisRun` legacy model vs `EvaluationAiRun` V1 model | Two AI analysis representations remain; current evaluation submission uses `EvaluationAiRun`. | Schema models and `evaluationV1Service.ts:241+`; old service/schema references. | High: historical evidence/audit data. | MERGE only through an explicit historical compatibility design; never delete migrations/data blindly. |
| Legacy qualification migrations/columns/snapshot parsers | User-visible qualification voting is gone and operations are skills, but historical migrations and snapshot compatibility remain. | Migrations `20260812120000`, `20260901090000`, `20260905101000`; current skill code has no vote UI. | High: required to migrate from zero and read legacy history. | LEGACY-RETAIN. Remove only dead runtime branches, never migration history. |
| Old audit/readiness reports (`*_REPORT.md`, old `FILE_AUDIT_MATRIX.md`) | They are point-in-time claims and can contradict current uncommitted work. | Repository root/docs contain multiple audit/readiness documents; current audit independently revalidated them. | Low/medium: useful historical evidence. | MERGE into an archive index or mark with dates/status; do not treat as current truth. |
| Ignored `backend/src/generated/prisma/` (~26 MB) | No current runtime import found outside old reports; application imports `@prisma/client`. | Reference search plus `.gitignore`; generated directory exists locally. | Low if reproducible by `prisma generate`. | GENERATED: delete locally only in an authorized cleanup, regenerate on build. |
| Stale current-policy test literals | Current UI fixtures still encode older maxima without consistently labeling them historical. | `src/components/evaluation-v1/EvaluationV1Form.test.tsx:55,157`; `src/pages/EvaluationRoundDetailPage.test.tsx:23,48`. | Low code-deletion risk; medium test-semantic risk. | REFACTOR into current-policy and explicitly named historical builders. |
| Repeated round aggregate expansion | `loadRoundAggregates` plus several consumers repeat in-memory latest/dedup/metric work over large includes. | `backend/src/roundAggregateRead.ts`; analytics/dashboard/skill-board/roster service callers. | High: behavior is shared and historically sensitive. | MERGE into purpose-specific query services, with result-equivalence tests. |
| Duplicate history DTO shapes | Legacy completed history and CLOSED-round history return overlapping but different shapes. | `evaluationReadService.ts:105-174`, frontend types/repository. | Medium. | MERGE on the CLOSED Round contract after legacy API retirement. |
| Local screenshots/temp browser artifacts | None were tracked by Git search. | `git ls-files` artifact scan returned no results. | N/A. | KEEP repository clean; no deletion needed. |

## Safe cleanup order

1. Add telemetry/deprecation notices for legacy API endpoints.
2. Separate explicit historical compatibility code from current runtime code.
3. Replace stale test literals with policy builders.
4. Retire only frontend-orphan repositories after confirming no dynamic imports or external use.
5. Handle schema columns/models through formal migrations with production data checks.
6. Keep every historical migration permanently.
