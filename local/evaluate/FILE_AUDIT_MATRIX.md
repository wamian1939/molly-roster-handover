# File Audit Matrix

Audit date: 2026-09-14
Scope: every Git-tracked or non-ignored untracked project file visible at audit time, excluding the six generated audit deliverables themselves. Ignored dependencies/build/generated outputs are summarized after the table. Classification is evidence-guided; `REVIEW` is not permission to delete.

| File path | Current purpose | Major references | Runtime used | Duplicate | Legacy residue | Sensitive logic | Action | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `"Molly LOGO/Molly LOGO/\345\233\233\345\217\266\346\230\237-\351\273\221.png"` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | "Molly LOGO/Molly LOGO/\345\233\233\345\217\266\346\230\237-\351\273\221.png" |
| `.env.example` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | .env.example |
| `.gitignore` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | .gitignore |
| `ADVERSARIAL_QA_REPORT.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `AGENTS.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `ARCHITECTURE_CONSOLIDATION_REPORT.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `AUDIT_FIX_LOG.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `backend/.env.example` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | backend/.env.example |
| `backend/package.json` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | backend/package.json |
| `backend/package-lock.json` | Dependency manifest/lockfile | npm build/test/deploy | Build/install | No evidence | No | No | KEEP | npm scripts and dependency audit |
| `backend/prisma/bootstrap-admin.ts` | Prisma schema/seed/admin utility: bootstrap-admin.ts | Prisma CLI/package scripts | Operational | No evidence | No | Yes: database/auth configuration | KEEP | Package scripts and Prisma validation |
| `backend/prisma/migrations/20260607110000_init_evaluation_module/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260607110000_init_evaluation_module/migration.sql |
| `backend/prisma/migrations/20260607125000_add_employee_management_fields/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260607125000_add_employee_management_fields/migration.sql |
| `backend/prisma/migrations/20260612091952_init/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260612091952_init/migration.sql |
| `backend/prisma/migrations/20260612115000_add_performance_notes/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260612115000_add_performance_notes/migration.sql |
| `backend/prisma/migrations/20260613100000_add_ai_analysis_runs/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260613100000_add_ai_analysis_runs/migration.sql |
| `backend/prisma/migrations/20260811120000_add_scoring_v1_foundation/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260811120000_add_scoring_v1_foundation/migration.sql |
| `backend/prisma/migrations/20260812090000_add_evaluation_v1_records/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260812090000_add_evaluation_v1_records/migration.sql |
| `backend/prisma/migrations/20260812120000_add_employee_qualifications/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260812120000_add_employee_qualifications/migration.sql |
| `backend/prisma/migrations/20260813123000_add_v1_analytics_indexes/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260813123000_add_v1_analytics_indexes/migration.sql |
| `backend/prisma/migrations/20260817090000_stabilize_v1_workflow/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260817090000_stabilize_v1_workflow/migration.sql |
| `backend/prisma/migrations/20260817110000_clear_untouched_legacy_unknown_drafts/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260817110000_clear_untouched_legacy_unknown_drafts/migration.sql |
| `backend/prisma/migrations/20260817150000_add_formal_auth/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | Authorization schema | LEGACY-RETAIN | backend/prisma/migrations/20260817150000_add_formal_auth/migration.sql |
| `backend/prisma/migrations/20260818100000_harden_authentication/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | Authorization schema | LEGACY-RETAIN | backend/prisma/migrations/20260818100000_harden_authentication/migration.sql |
| `backend/prisma/migrations/20260821100000_archive_stores_and_decouple_v1_period/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260821100000_archive_stores_and_decouple_v1_period/migration.sql |
| `backend/prisma/migrations/20260824100000_add_employee_type_dual_scoring_policy/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260824100000_add_employee_type_dual_scoring_policy/migration.sql |
| `backend/prisma/migrations/20260830110000_add_multi_evaluator_rounds/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260830110000_add_multi_evaluator_rounds/migration.sql |
| `backend/prisma/migrations/20260830130000_enforce_round_scope_consistency/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260830130000_enforce_round_scope_consistency/migration.sql |
| `backend/prisma/migrations/20260901090000_employee_profile_qualification_refactor/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260901090000_employee_profile_qualification_refactor/migration.sql |
| `backend/prisma/migrations/20260904120000_scoring_availability_training_policy_t5/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260904120000_scoring_availability_training_policy_t5/migration.sql |
| `backend/prisma/migrations/20260905100000_operational_skills_regular_v2/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260905100000_operational_skills_regular_v2/migration.sql |
| `backend/prisma/migrations/20260905101000_migrate_qualification_capabilities/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260905101000_migrate_qualification_capabilities/migration.sql |
| `backend/prisma/migrations/20260905102000_backfill_operational_skill_drafts/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260905102000_backfill_operational_skill_drafts/migration.sql |
| `backend/prisma/migrations/20260905103000_expand_policy_component_ranges/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260905103000_expand_policy_component_ranges/migration.sql |
| `backend/prisma/migrations/20260905180000_live_scoring_admin_snapshot_rounds/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260905180000_live_scoring_admin_snapshot_rounds/migration.sql |
| `backend/prisma/migrations/20260905190000_enrich_legacy_open_round_skill_snapshots/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260905190000_enrich_legacy_open_round_skill_snapshots/migration.sql |
| `backend/prisma/migrations/20260905210000_remove_drafts_and_freeze_closed_rounds/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260905210000_remove_drafts_and_freeze_closed_rounds/migration.sql |
| `backend/prisma/migrations/20260905213000_remove_legacy_evaluation_activities/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260905213000_remove_legacy_evaluation_activities/migration.sql |
| `backend/prisma/migrations/20260905214000_restore_closed_evaluation_trigger/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260905214000_restore_closed_evaluation_trigger/migration.sql |
| `backend/prisma/migrations/20260907010000_upgrade_open_round_scoring_policies/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/20260907010000_upgrade_open_round_scoring_policies/migration.sql |
| `backend/prisma/migrations/20260909110000_expand_multi_store_account_access/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Current, but untracked | Authorization schema | LEGACY-RETAIN | backend/prisma/migrations/20260909110000_expand_multi_store_account_access/migration.sql |
| `backend/prisma/migrations/20260909120000_contract_legacy_account_store/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Current, but untracked | Authorization schema | LEGACY-RETAIN | backend/prisma/migrations/20260909120000_contract_legacy_account_store/migration.sql |
| `backend/prisma/migrations/20260913110000_store_jobs_and_round_job_snapshot/migration.sql` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Current, but untracked | No | LEGACY-RETAIN | backend/prisma/migrations/20260913110000_store_jobs_and_round_job_snapshot/migration.sql |
| `backend/prisma/migrations/migration_lock.toml` | Ordered Prisma database migration | prisma migrate deploy | Deploy-time | No evidence | Historical migration | No | LEGACY-RETAIN | backend/prisma/migrations/migration_lock.toml |
| `backend/prisma/schema.prisma` | Prisma schema/seed/admin utility: schema.prisma | Prisma CLI/package scripts | Build/runtime model | No evidence | No | Yes: database/auth configuration | KEEP | Package scripts and Prisma validation |
| `backend/prisma/seed.ts` | Prisma schema/seed/admin utility: seed.ts | Prisma CLI/package scripts | Operational | No evidence | No | Yes: database/auth configuration | KEEP | Package scripts and Prisma validation |
| `backend/README.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `backend/scripts/audit-live-scoring.ts` | Operational/preflight script: audit-live-scoring.ts | Manual/package workflow | Operational | No evidence | No | No | KEEP | Script and documentation scan |
| `backend/scripts/benchmark-population.ts` | Operational/preflight script: benchmark-population.ts | Manual/package workflow | Operational | No evidence | No | No | KEEP | Script and documentation scan |
| `backend/scripts/browser-acceptance-environment.ts` | Operational/preflight script: browser-acceptance-environment.ts | Manual/package workflow | Operational | No evidence | No | No | KEEP | Script and documentation scan |
| `backend/scripts/inspect-browser-acceptance.ts` | Operational/preflight script: inspect-browser-acceptance.ts | Manual/package workflow | Operational | No evidence | No | No | KEEP | Script and documentation scan |
| `backend/scripts/preflight-account-access-migration.ts` | Operational/preflight script: preflight-account-access-migration.ts | Manual/package workflow | Operational | No evidence | No | Yes: database preflight | KEEP | Script and documentation scan |
| `backend/scripts/preflight-history-privacy-jobs-migration.ts` | Operational/preflight script: preflight-history-privacy-jobs-migration.ts | Manual/package workflow | Operational | No evidence | No | Yes: database preflight | KEEP | Script and documentation scan |
| `backend/scripts/verify-round-integrity.ts` | Operational/preflight script: verify-round-integrity.ts | Manual/package workflow | Operational | No evidence | No | No | KEEP | Script and documentation scan |
| `backend/src/accountService.ts` | Backend service/runtime module: accountService.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/aiTextEvaluationV1.ts` | Backend service/runtime module: aiTextEvaluationV1.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/analyticsV1Service.ts` | Backend service/runtime module: analyticsV1Service.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/app.ts` | Backend service/runtime module: app.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/auth.ts` | Backend service/runtime module: auth.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/domain.ts` | Backend service/runtime module: domain.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/employeeEvaluationSummaryService.ts` | Backend service/runtime module: employeeEvaluationSummaryService.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/employeeService.ts` | Backend service/runtime module: employeeService.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/evaluationCatalogService.ts` | Backend service/runtime module: evaluationCatalogService.ts | routes.ts/server service graph | Yes | No evidence | No current frontend consumer | Yes: authorization/data | REVIEW | Route/service/reference scan |
| `backend/src/evaluationReadService.ts` | Backend service/runtime module: evaluationReadService.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/evaluationRoundService.ts` | Backend service/runtime module: evaluationRoundService.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/evaluationV1Service.ts` | Backend service/runtime module: evaluationV1Service.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/httpError.ts` | Backend service/runtime module: httpError.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/performanceNoteService.ts` | Backend service/runtime module: performanceNoteService.ts | routes.ts/server service graph | Yes | No evidence | No current frontend consumer | No | REVIEW | Route/service/reference scan |
| `backend/src/prisma.ts` | Backend service/runtime module: prisma.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/rosterIntegrationService.ts` | Backend service/runtime module: rosterIntegrationService.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/rosterSkillBoardService.ts` | Backend service/runtime module: rosterSkillBoardService.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/roundAggregateRead.ts` | Backend service/runtime module: roundAggregateRead.ts | routes.ts/server service graph | Yes | No evidence | No | No | REFACTOR | Route/service/reference scan |
| `backend/src/routes.ts` | Backend service/runtime module: routes.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/safeLogging.ts` | Backend service/runtime module: safeLogging.ts | routes.ts/server service graph | Yes | No evidence | No | Yes: authorization/data | KEEP | Route/service/reference scan |
| `backend/src/scoringPolicyV1.ts` | Backend service/runtime module: scoringPolicyV1.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/server.ts` | Backend service/runtime module: server.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/storeJobService.ts` | Backend service/runtime module: storeJobService.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/storeService.ts` | Backend service/runtime module: storeService.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/src/validation.ts` | Backend service/runtime module: validation.ts | routes.ts/server service graph | Yes | No evidence | No | No | KEEP | Route/service/reference scan |
| `backend/tests/accountRoutes.test.ts` | Automated verification for accountRoutes.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/accountService.test.ts` | Automated verification for accountService.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/analyticsV1Service.test.ts` | Automated verification for analyticsV1Service.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/auth.test.ts` | Automated verification for auth.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/employeeEvaluationSummaryService.test.ts` | Automated verification for employeeEvaluationSummaryService.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/employeeRoutes.test.ts` | Automated verification for employeeRoutes.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/employeeService.test.ts` | Automated verification for employeeService.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/evaluationHistoryService.test.ts` | Automated verification for evaluationHistoryService.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/evaluationReadService.test.ts` | Automated verification for evaluationReadService.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/evaluationRoundService.test.ts` | Automated verification for evaluationRoundService.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/evaluationRoutes.test.ts` | Automated verification for evaluationRoutes.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/evaluationV1Routes.test.ts` | Automated verification for evaluationV1Routes.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/liveEvaluationV1Service.test.ts` | Automated verification for liveEvaluationV1Service.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/liveRoundDatabase.integration.test.ts` | Automated verification for liveRoundDatabase.integration.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/multiStoreAccountDatabase.integration.test.ts` | Automated verification for multiStoreAccountDatabase.integration.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/performanceNoteRoutes.test.ts` | Automated verification for performanceNoteRoutes.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/performanceNoteService.test.ts` | Automated verification for performanceNoteService.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/productionApp.test.ts` | Automated verification for productionApp.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/rosterIntegrationRoutes.test.ts` | Automated verification for rosterIntegrationRoutes.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/rosterIntegrationService.test.ts` | Automated verification for rosterIntegrationService.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/rosterSkillBoardRoutes.test.ts` | Automated verification for rosterSkillBoardRoutes.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/rosterSkillBoardService.test.ts` | Automated verification for rosterSkillBoardService.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/roundTestFixtures.ts` | Automated verification for roundTestFixtures.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/safeLogging.test.ts` | Automated verification for safeLogging.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/scoringPolicyV1.test.ts` | Automated verification for scoringPolicyV1.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/securityRoutes.test.ts` | Automated verification for securityRoutes.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `backend/tests/storeJobService.test.ts` | Automated verification for storeJobService.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tests/storeService.test.ts` | Automated verification for storeService.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `backend/tsconfig.json` | Build/deployment/tooling configuration | Build/deploy commands | Build/deploy | No evidence | No | No | KEEP | Successful build/config inspection |
| `backend/vitest.config.ts` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | backend/vitest.config.ts |
| `CLEANUP_LOG.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `DEEP_CLEANUP_LOG.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `DEPLOYMENT.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `docs/access-control.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `docs/ai-analysis.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `docs/employee-api-contract.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `docs/evaluation-api-contract.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `docs/performance-notes-api-contract.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `EMPLOYEE_EVALUATION_AUDIT.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `EMPLOYEE_EVALUATION_REMEDIATION_PLAN.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `eslint.config.js` | Build/deployment/tooling configuration | Build/deploy commands | Build/deploy | No evidence | No | No | KEEP | Successful build/config inspection |
| `EVALUATE_CHANGES_FOR_ROSTER.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `FINAL_DEEP_REFACTOR_REPORT.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `FINAL_PRODUCTION_AUDIT_REPORT.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `FRONTEND_TECHNICAL_AUDIT.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `GOAL_MODE_PROGRESS.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `index.html` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | index.html |
| `MULTI_STORE_AUTH_INTEGRATION.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `need to do.md` | User-owned working note | No runtime references | No | No evidence | Ownership outside application uncertain | No | REVIEW | Untracked file; not opened/modified |
| `package.json` | Dependency manifest/lockfile | npm build/test/deploy | Build/install | No evidence | No | No | KEEP | npm scripts and dependency audit |
| `package-lock.json` | Dependency manifest/lockfile | npm build/test/deploy | Build/install | No evidence | No | No | KEEP | npm scripts and dependency audit |
| `postcss.config.js` | Build/deployment/tooling configuration | Build/deploy commands | Build/deploy | No evidence | No | No | KEEP | Successful build/config inspection |
| `PRODUCT.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | No | No | KEEP | Documentation inventory |
| `PRODUCTION_READINESS_REMEDIATION_REPORT.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `PROJECT_AUDIT_MAP.md` | Documentation or point-in-time report | Human/operator reference | No | No evidence | Point-in-time; may be stale | No | REVIEW | Documentation inventory |
| `public/favicon.svg` | Static public asset | Vite public serving | Yes | No evidence | No | No | KEEP | Static asset inventory |
| `render.yaml` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | render.yaml |
| `scripts/run-production-smoke.ps1` | Operational/preflight script: run-production-smoke.ps1 | Manual/package workflow | Operational | No evidence | No | No | KEEP | Script and documentation scan |
| `scripts/start-browser-acceptance.ps1` | Operational/preflight script: start-browser-acceptance.ps1 | Manual/package workflow | Operational | No evidence | No | No | KEEP | Script and documentation scan |
| `scripts/start-dev.ps1` | Operational/preflight script: start-dev.ps1 | Manual/package workflow | Operational | No evidence | No | No | KEEP | Script and documentation scan |
| `src/App.tsx` | Frontend runtime/config asset: App.tsx | Vite/frontend entry graph | Yes | No evidence | No | No | KEEP | Entry/import scan |
| `src/auth/AuthContext.test.tsx` | Automated verification for AuthContext.test.tsx | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `src/auth/AuthContext.tsx` | Frontend authenticated-user/session context | App/AppShell/protected pages | Yes | No evidence | No | Yes: authorization state | KEEP | Auth context import search |
| `src/components/badges/EmployeeStatusBadge.tsx` | Reusable frontend component: EmployeeStatusBadge.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/badges/EmployeeTypeBadge.tsx` | Reusable frontend component: EmployeeTypeBadge.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/badges/StoreJobTag.tsx` | Reusable frontend component: StoreJobTag.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/brand/brandAssets.ts` | Reusable frontend component: brandAssets.ts | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/brand/BrandLoader.tsx` | Reusable frontend component: BrandLoader.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/brand/BrandTransitionLayer.tsx` | Reusable frontend component: BrandTransitionLayer.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/brand/MollyClover.tsx` | Reusable frontend component: MollyClover.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/employee-detail/EvaluationHistorySection.tsx` | Reusable frontend component: EvaluationHistorySection.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/employee-detail/ReadOnlySkillMatrix.tsx` | Reusable frontend component: ReadOnlySkillMatrix.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/employee-detail/V1EvaluationDetail.tsx` | Reusable frontend component: V1EvaluationDetail.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/employee-detail/V1ScoreTrend.tsx` | Reusable frontend component: V1ScoreTrend.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation/EmployeeEvaluationTable.test.tsx` | Automated verification for EmployeeEvaluationTable.test.tsx | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `src/components/evaluation/EmployeeEvaluationTable.tsx` | Reusable frontend component: EmployeeEvaluationTable.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation/ScoreCard.tsx` | Reusable frontend component: ScoreCard.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation-v1/EvaluationV1Form.test.tsx` | Automated verification for EvaluationV1Form.test.tsx | Vitest discovery | Test-only | No evidence | No | No | REFACTOR | Test discovery and assertion scan |
| `src/components/evaluation-v1/EvaluationV1Form.tsx` | Reusable frontend component: EvaluationV1Form.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation-v1/evaluationV1FormModel.test.ts` | Automated verification for evaluationV1FormModel.test.ts | Vitest discovery | Test-only | No evidence | No | No | REFACTOR | Test discovery and assertion scan |
| `src/components/evaluation-v1/evaluationV1FormModel.ts` | Reusable frontend component: evaluationV1FormModel.ts | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation-v1/OverallRatings.tsx` | Reusable frontend component: OverallRatings.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation-v1/RatingControl.tsx` | Reusable frontend component: RatingControl.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation-v1/ScorePreviewCard.tsx` | Reusable frontend component: ScorePreviewCard.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation-v1/SkillMatrix.tsx` | Reusable frontend component: SkillMatrix.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation-v1/skillPresentation.ts` | Reusable frontend component: skillPresentation.ts | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation-v1/SkillStatusControl.test.tsx` | Automated verification for SkillStatusControl.test.tsx | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/components/evaluation-v1/SkillStatusControl.tsx` | Reusable frontend component: SkillStatusControl.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/evaluation-v1/TextFeedbackPanel.tsx` | Reusable frontend component: TextFeedbackPanel.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | KEEP | Component import/reference scan |
| `src/components/layout/AppShell.test.tsx` | Automated verification for AppShell.test.tsx | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/components/layout/AppShell.tsx` | Reusable frontend component: AppShell.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/layout/PageContainer.tsx` | Reusable frontend component: PageContainer.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/motion/GsapScore.tsx` | Reusable frontend component: GsapScore.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/motion/MotionCard.tsx` | Reusable frontend component: MotionCard.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/motion/motionConfig.ts` | Reusable frontend component: motionConfig.ts | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/motion/MotionList.tsx` | Reusable frontend component: MotionList.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/motion/MotionPage.tsx` | Reusable frontend component: MotionPage.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/motion/ScoreOrb.tsx` | Reusable frontend component: ScoreOrb.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/states/EmptyState.tsx` | Reusable frontend component: EmptyState.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/states/ErrorState.tsx` | Reusable frontend component: ErrorState.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/states/LoadingState.tsx` | Reusable frontend component: LoadingState.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/ui/AppSelect.test.tsx` | Automated verification for AppSelect.test.tsx | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/components/ui/AppSelect.tsx` | Reusable frontend component: AppSelect.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/ui/Dialog.test.tsx` | Automated verification for Dialog.test.tsx | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/components/ui/Dialog.tsx` | Reusable frontend component: Dialog.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/ui/SectionHeader.tsx` | Reusable frontend component: SectionHeader.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/components/ui/StoreMultiSelect.tsx` | Reusable frontend component: StoreMultiSelect.tsx | Frontend import graph | Yes | No evidence | No | Potential UI boundary | REFACTOR | Component import/reference scan |
| `src/components/ui/ToastProvider.tsx` | Reusable frontend component: ToastProvider.tsx | Frontend import graph | Yes | No evidence | No | No | KEEP | Component import/reference scan |
| `src/lib/evaluationNavigation.test.ts` | Automated verification for evaluationNavigation.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/lib/evaluationNavigation.ts` | Frontend shared helper: evaluationNavigation.ts | Page/component imports | Yes | No evidence | No | Yes: safe return path | KEEP | Import and behavior tests |
| `src/lib/format.ts` | Frontend shared helper: format.ts | Page/component imports | Yes | No evidence | No | No | KEEP | Import and behavior tests |
| `src/lib/mutationFeedback.ts` | Frontend shared helper: mutationFeedback.ts | Page/component imports | Yes | No evidence | No | No | KEEP | Import and behavior tests |
| `src/lib/presentation.ts` | Frontend shared helper: presentation.ts | Page/component imports | Yes | No evidence | No | No | KEEP | Import and behavior tests |
| `src/main.tsx` | Frontend runtime/config asset: main.tsx | Vite/frontend entry graph | Yes | No evidence | No | No | KEEP | Entry/import scan |
| `src/pages/AccountManagementPage.test.tsx` | Automated verification for AccountManagementPage.test.tsx | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `src/pages/AccountManagementPage.tsx` | Frontend route/page: AccountManagementPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/DashboardPage.test.tsx` | Automated verification for DashboardPage.test.tsx | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/pages/DashboardPage.tsx` | Frontend route/page: DashboardPage.tsx | src/App.tsx route table | Yes | No evidence | No | No | KEEP | Router and import search |
| `src/pages/EmployeeDetailPage.test.tsx` | Automated verification for EmployeeDetailPage.test.tsx | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `src/pages/EmployeeDetailPage.tsx` | Frontend route/page: EmployeeDetailPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/EmployeeManagementPage.test.tsx` | Automated verification for EmployeeManagementPage.test.tsx | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `src/pages/EmployeeManagementPage.tsx` | Frontend route/page: EmployeeManagementPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/EvaluationAnalyticsPage.test.tsx` | Automated verification for EvaluationAnalyticsPage.test.tsx | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/pages/EvaluationAnalyticsPage.tsx` | Frontend route/page: EvaluationAnalyticsPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/EvaluationEntryPage.tsx` | Frontend route/page: EvaluationEntryPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/EvaluationHistoryIndexPage.test.tsx` | Automated verification for EvaluationHistoryIndexPage.test.tsx | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `src/pages/EvaluationHistoryIndexPage.tsx` | Frontend route/page: EvaluationHistoryIndexPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/EvaluationRoundDetailPage.test.tsx` | Automated verification for EvaluationRoundDetailPage.test.tsx | Vitest discovery | Test-only | No evidence | No | No | REFACTOR | Test discovery and assertion scan |
| `src/pages/EvaluationRoundDetailPage.tsx` | Frontend route/page: EvaluationRoundDetailPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/EvaluationV1Page.tsx` | Frontend route/page: EvaluationV1Page.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/LiveEvaluationPage.tsx` | Frontend route/page: LiveEvaluationPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/LoginPage.tsx` | Frontend route/page: LoginPage.tsx | src/App.tsx route table | Yes | No evidence | No | No | KEEP | Router and import search |
| `src/pages/RosterSkillBoardPage.test.tsx` | Automated verification for RosterSkillBoardPage.test.tsx | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/pages/RosterSkillBoardPage.tsx` | Frontend route/page: RosterSkillBoardPage.tsx | src/App.tsx route table | Yes | No evidence | No | No | KEEP | Router and import search |
| `src/pages/StoreEmployeeTypeSelectionPage.test.tsx` | Automated verification for StoreEmployeeTypeSelectionPage.test.tsx | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `src/pages/StoreEmployeeTypeSelectionPage.tsx` | Frontend route/page: StoreEmployeeTypeSelectionPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/StoreEvaluationPage.test.tsx` | Automated verification for StoreEvaluationPage.test.tsx | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/pages/StoreEvaluationPage.tsx` | Frontend route/page: StoreEvaluationPage.tsx | src/App.tsx route table | Yes | No evidence | No | Yes: role/data rendering | KEEP | Router and import search |
| `src/pages/StoreManagementPage.tsx` | Frontend route/page: StoreManagementPage.tsx | src/App.tsx route table | Yes | No evidence | No | No | KEEP | Router and import search |
| `src/services/apiClient.test.ts` | Automated verification for apiClient.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/services/apiClient.ts` | Frontend API repository/client: apiClient.ts | Page/component repositories | Yes | No evidence | No | No | KEEP | Repository import and endpoint search |
| `src/services/authRepository.ts` | Frontend API repository/client: authRepository.ts | Page/component repositories | Yes | No evidence | No | Yes: API boundary | KEEP | Repository import and endpoint search |
| `src/services/employeeRepository.test.ts` | Automated verification for employeeRepository.test.ts | Vitest discovery | Test-only | No evidence | No | Yes: security/data contract | KEEP | Test discovery and assertion scan |
| `src/services/employeeRepository.ts` | Frontend API repository/client: employeeRepository.ts | Page/component repositories | Yes | No evidence | No | Yes: API boundary | KEEP | Repository import and endpoint search |
| `src/services/evaluationRepository.test.ts` | Automated verification for evaluationRepository.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/services/evaluationRepository.ts` | Frontend API repository/client: evaluationRepository.ts | Page/component repositories | Yes | No evidence | No | Yes: API boundary | KEEP | Repository import and endpoint search |
| `src/services/performanceNoteRepository.test.ts` | Automated verification for performanceNoteRepository.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/services/performanceNoteRepository.ts` | Frontend API repository/client: performanceNoteRepository.ts | Page/component repositories | Yes | No evidence | No current page consumer | No | REVIEW | Repository import and endpoint search |
| `src/services/storeRepository.test.ts` | Automated verification for storeRepository.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/services/storeRepository.ts` | Frontend API repository/client: storeRepository.ts | Page/component repositories | Yes | No evidence | No | No | KEEP | Repository import and endpoint search |
| `src/styles.css` | Frontend runtime/config asset: styles.css | Vite/frontend entry graph | Yes | No evidence | No | No | KEEP | Entry/import scan |
| `src/types/analyticsV1.ts` | Shared frontend DTO/domain types | Repositories/pages/components | Compile-time | No evidence | No | No | KEEP | Type import search |
| `src/types/evaluation.ts` | Shared frontend DTO/domain types | Repositories/pages/components | Compile-time | No evidence | Contains legacy PerformanceNote compatibility | No | REFACTOR | Type import search |
| `src/utils/rosterSkillUtils.test.ts` | Automated verification for rosterSkillUtils.test.ts | Vitest discovery | Test-only | No evidence | No | No | KEEP | Test discovery and assertion scan |
| `src/utils/rosterSkillUtils.ts` | Frontend runtime/config asset: rosterSkillUtils.ts | Vite/frontend entry graph | Yes | No evidence | No | No | KEEP | Entry/import scan |
| `src/vite-env.d.ts` | Frontend runtime/config asset: vite-env.d.ts | Vite/frontend entry graph | Yes | No evidence | No | No | KEEP | Entry/import scan |
| `tailwind.config.js` | Build/deployment/tooling configuration | Build/deploy commands | Build/deploy | No evidence | No | No | KEEP | Successful build/config inspection |
| `tsconfig.app.json` | Build/deployment/tooling configuration | Build/deploy commands | Build/deploy | No evidence | No | No | KEEP | Successful build/config inspection |
| `tsconfig.json` | Build/deployment/tooling configuration | Build/deploy commands | Build/deploy | No evidence | No | No | KEEP | Successful build/config inspection |
| `tsconfig.node.json` | Build/deployment/tooling configuration | Build/deploy commands | Build/deploy | No evidence | No | No | KEEP | Successful build/config inspection |
| `vite.config.ts` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | vite.config.ts |
| `vitest.config.ts` | Project artifact | Direct path/reference scan | No | No evidence | No | No | KEEP | vitest.config.ts |

## Ignored/generated inventory

- `node_modules/`, `backend/node_modules/`: GENERATED dependencies, excluded.
- `dist/`, `backend/dist/`, coverage/log output: GENERATED and ignored; no tracked artifacts found.
- `backend/src/generated/prisma/`: GENERATED, approximately 26 MB locally, ignored, no current runtime import found outside old reports.
- `.env`, `backend/.env`, `LOCAL_ACCOUNT_CREDENTIALS.md`: ignored sensitive local files; contents excluded from this matrix.

## Classification totals

- Files classified: 241
- Runtime source/config files: retained unless a specific REFACTOR/REVIEW finding is recorded.
- Historical migrations: always LEGACY-RETAIN; never delete.
- Detailed deletion risks: see `DEAD_CODE_CANDIDATES.md`.
