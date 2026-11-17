# PostgreSQL schema inventory

Generated 2026-10-08T19:16:28.717Z from the local development database, schema `public`. Schema metadata only; no employee values or credentials are included.

This is direct PostgreSQL catalog evidence for the database audit. Foreign-key definitions include ON DELETE and ON UPDATE when they differ from PostgreSQL defaults. Index listings include primary and unique indexes.

## `ai_analysis_runs`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `employeeId` | `text` | NO |  |
| `storeId` | `text` | NO |  |
| `evaluationPeriod` | `text` | NO |  |
| `evaluationId` | `text` | YES |  |
| `triggeredByUserId` | `text` | YES |  |
| `provider` | `text` | NO |  |
| `model` | `text` | NO |  |
| `status` | `text` | NO |  |
| `textReviewSnapshot` | `text` | NO |  |
| `includedRecentNotes` | `boolean` | NO | `false` |
| `recentNotesCount` | `integer` | NO | `0` |
| `aiTextScore` | `integer` | YES |  |
| `aiRiskScore` | `integer` | YES |  |
| `summary` | `text` | YES |  |
| `strengths` | `jsonb` | YES |  |
| `improvementAreas` | `jsonb` | YES |  |
| `dimensionSignals` | `jsonb` | YES |  |
| `errorMessage` | `text` | YES |  |
| `latencyMs` | `integer` | YES |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |

**Constraints**

- FK `ai_analysis_runs_employeeId_fkey`: `FOREIGN KEY ("employeeId") REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- FK `ai_analysis_runs_storeId_fkey`: `FOREIGN KEY ("storeId") REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- PK `ai_analysis_runs_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `ai_analysis_runs_createdAt_idx`: `CREATE INDEX "ai_analysis_runs_createdAt_idx" ON public.ai_analysis_runs USING btree ("createdAt")`
- `ai_analysis_runs_employeeId_idx`: `CREATE INDEX "ai_analysis_runs_employeeId_idx" ON public.ai_analysis_runs USING btree ("employeeId")`
- `ai_analysis_runs_employeeId_storeId_evaluationPeriod_idx`: `CREATE INDEX "ai_analysis_runs_employeeId_storeId_evaluationPeriod_idx" ON public.ai_analysis_runs USING btree ("employeeId", "storeId", "evaluationPeriod")`
- `ai_analysis_runs_evaluationId_idx`: `CREATE INDEX "ai_analysis_runs_evaluationId_idx" ON public.ai_analysis_runs USING btree ("evaluationId")`
- `ai_analysis_runs_evaluationPeriod_idx`: `CREATE INDEX "ai_analysis_runs_evaluationPeriod_idx" ON public.ai_analysis_runs USING btree ("evaluationPeriod")`
- `ai_analysis_runs_pkey`: `CREATE UNIQUE INDEX ai_analysis_runs_pkey ON public.ai_analysis_runs USING btree (id)`
- `ai_analysis_runs_status_idx`: `CREATE INDEX ai_analysis_runs_status_idx ON public.ai_analysis_runs USING btree (status)`
- `ai_analysis_runs_storeId_idx`: `CREATE INDEX "ai_analysis_runs_storeId_idx" ON public.ai_analysis_runs USING btree ("storeId")`

## `auth_audit_events`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `accountId` | `text` | YES |  |
| `eventType` | `AuthAuditEventType` | NO |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `metadata` | `jsonb` | YES |  |

**Constraints**

- FK `auth_audit_events_accountId_fkey`: `FOREIGN KEY ("accountId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL`
- PK `auth_audit_events_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `auth_audit_events_accountId_createdAt_idx`: `CREATE INDEX "auth_audit_events_accountId_createdAt_idx" ON public.auth_audit_events USING btree ("accountId", "createdAt")`
- `auth_audit_events_eventType_createdAt_idx`: `CREATE INDEX "auth_audit_events_eventType_createdAt_idx" ON public.auth_audit_events USING btree ("eventType", "createdAt")`
- `auth_audit_events_pkey`: `CREATE UNIQUE INDEX auth_audit_events_pkey ON public.auth_audit_events USING btree (id)`

## `auth_sessions`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `userId` | `text` | NO |  |
| `tokenHash` | `text` | NO |  |
| `expiresAt` | `timestamp without time zone` | NO |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `lastUsedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |

**Constraints**

- FK `auth_sessions_userId_fkey`: `FOREIGN KEY ("userId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE`
- PK `auth_sessions_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `auth_sessions_expiresAt_idx`: `CREATE INDEX "auth_sessions_expiresAt_idx" ON public.auth_sessions USING btree ("expiresAt")`
- `auth_sessions_pkey`: `CREATE UNIQUE INDEX auth_sessions_pkey ON public.auth_sessions USING btree (id)`
- `auth_sessions_tokenHash_key`: `CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON public.auth_sessions USING btree ("tokenHash")`
- `auth_sessions_userId_idx`: `CREATE INDEX "auth_sessions_userId_idx" ON public.auth_sessions USING btree ("userId")`

## `current_skill_confirmations`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `employeeId` | `text` | NO |  |
| `skillDefinitionId` | `text` | NO |  |
| `previousStatus` | `SkillStatus` | YES |  |
| `confirmedStatus` | `SkillStatus` | NO |  |
| `confirmedByAccountId` | `text` | NO |  |
| `reason` | `character varying` | YES |  |
| `confirmedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |

**Constraints**

- FK `current_skill_confirmations_confirmedByAccountId_fkey`: `FOREIGN KEY ("confirmedByAccountId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- FK `current_skill_confirmations_employeeId_fkey`: `FOREIGN KEY ("employeeId") REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- FK `current_skill_confirmations_skillDefinitionId_fkey`: `FOREIGN KEY ("skillDefinitionId") REFERENCES skill_definitions(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- PK `current_skill_confirmations_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `current_skill_confirmations_employeeId_confirmedAt_idx`: `CREATE INDEX "current_skill_confirmations_employeeId_confirmedAt_idx" ON public.current_skill_confirmations USING btree ("employeeId", "confirmedAt")`
- `current_skill_confirmations_pkey`: `CREATE UNIQUE INDEX current_skill_confirmations_pkey ON public.current_skill_confirmations USING btree (id)`
- `current_skill_confirmations_skillDefinitionId_confirmedAt_idx`: `CREATE INDEX "current_skill_confirmations_skillDefinitionId_confirmedAt_idx" ON public.current_skill_confirmations USING btree ("skillDefinitionId", "confirmedAt")`

**Triggers**

- `current_skill_confirmations_immutable`: `CREATE TRIGGER current_skill_confirmations_immutable BEFORE DELETE OR UPDATE ON public.current_skill_confirmations FOR EACH ROW EXECUTE FUNCTION prevent_current_skill_confirmation_mutation()`

## `employee_job_assignments`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `employeeId` | `text` | NO |  |
| `jobId` | `text` | NO |  |
| `assignedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `assignedByAccountId` | `text` | YES |  |
| `storeId` | `text` | NO |  |

**Constraints**

- FK `employee_job_assignments_assignedByAccountId_fkey`: `FOREIGN KEY ("assignedByAccountId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL`
- FK `employee_job_assignments_employeeId_storeId_fkey`: `FOREIGN KEY ("employeeId", "storeId") REFERENCES employees(id, "storeId") ON UPDATE CASCADE ON DELETE CASCADE`
- FK `employee_job_assignments_jobId_storeId_fkey`: `FOREIGN KEY ("jobId", "storeId") REFERENCES store_job_definitions(id, "storeId") ON UPDATE CASCADE ON DELETE RESTRICT`
- PK `employee_job_assignments_pkey`: `PRIMARY KEY ("employeeId", "jobId")`

**Indexes**

- `employee_job_assignments_assignedByAccountId_idx`: `CREATE INDEX "employee_job_assignments_assignedByAccountId_idx" ON public.employee_job_assignments USING btree ("assignedByAccountId")`
- `employee_job_assignments_jobId_idx`: `CREATE INDEX "employee_job_assignments_jobId_idx" ON public.employee_job_assignments USING btree ("jobId")`
- `employee_job_assignments_jobId_storeId_idx`: `CREATE INDEX "employee_job_assignments_jobId_storeId_idx" ON public.employee_job_assignments USING btree ("jobId", "storeId")`
- `employee_job_assignments_pkey`: `CREATE UNIQUE INDEX employee_job_assignments_pkey ON public.employee_job_assignments USING btree ("employeeId", "jobId")`

## `employee_skills`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `employeeId` | `text` | NO |  |
| `skillDefinitionId` | `text` | NO |  |
| `status` | `SkillStatus` | NO |  |
| `updatedBy` | `text` | YES |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |

**Constraints**

- FK `employee_skills_employeeId_fkey`: `FOREIGN KEY ("employeeId") REFERENCES employees(id) ON UPDATE CASCADE ON DELETE CASCADE`
- FK `employee_skills_skillDefinitionId_fkey`: `FOREIGN KEY ("skillDefinitionId") REFERENCES skill_definitions(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- PK `employee_skills_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `employee_skills_employeeId_skillDefinitionId_key`: `CREATE UNIQUE INDEX "employee_skills_employeeId_skillDefinitionId_key" ON public.employee_skills USING btree ("employeeId", "skillDefinitionId")`
- `employee_skills_employeeId_status_idx`: `CREATE INDEX "employee_skills_employeeId_status_idx" ON public.employee_skills USING btree ("employeeId", status)`
- `employee_skills_pkey`: `CREATE UNIQUE INDEX employee_skills_pkey ON public.employee_skills USING btree (id)`
- `employee_skills_skillDefinitionId_status_idx`: `CREATE INDEX "employee_skills_skillDefinitionId_status_idx" ON public.employee_skills USING btree ("skillDefinitionId", status)`

## `employees`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `storeId` | `text` | NO |  |
| `displayName` | `text` | NO |  |
| `employmentType` | `EmploymentType` | NO |  |
| `status` | `EmployeeStatus` | NO | `'Active'::"EmployeeStatus"` |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp without time zone` | NO |  |
| `archivedAt` | `timestamp without time zone` | YES |  |
| `employeeType` | `EmployeeType` | NO | `'REGULAR'::"EmployeeType"` |
| `surname` | `text` | YES |  |
| `givenName` | `text` | YES |  |
| `englishName` | `text` | YES |  |
| `gender` | `Gender` | YES |  |
| `dateOfBirth` | `date` | YES |  |
| `emailAddress` | `text` | YES |  |
| `mobileTelephoneNumber` | `text` | YES |  |
| `addressLine` | `text` | YES |  |
| `suburb` | `text` | YES |  |
| `state` | `text` | YES |  |
| `postcode` | `text` | YES |  |
| `employmentCommencementDate` | `date` | YES |  |
| `bankAccountName` | `text` | YES |  |
| `bsbNumber` | `text` | YES |  |
| `bankAccountNumber` | `text` | YES |  |
| `taxFileNumber` | `text` | YES |  |
| `abn` | `text` | YES |  |
| `holdsWorkingHolidayVisa` | `boolean` | YES |  |
| `visaType` | `text` | YES |  |
| `superannuationCompany` | `text` | YES |  |
| `superannuationAccountNumber` | `text` | YES |  |
| `uniqueSuperannuationIdentifier` | `text` | YES |  |

**Constraints**

- CHECK `employees_archive_state_check`: `CHECK ((((status = 'Active'::"EmployeeStatus") AND ("archivedAt" IS NULL)) OR ((status = 'Archived'::"EmployeeStatus") AND ("archivedAt" IS NOT NULL))))`
- FK `employees_storeId_fkey`: `FOREIGN KEY ("storeId") REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- PK `employees_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `employees_displayName_idx`: `CREATE INDEX "employees_displayName_idx" ON public.employees USING btree ("displayName")`
- `employees_englishName_idx`: `CREATE INDEX "employees_englishName_idx" ON public.employees USING btree ("englishName")`
- `employees_id_storeId_key`: `CREATE UNIQUE INDEX "employees_id_storeId_key" ON public.employees USING btree (id, "storeId")`
- `employees_pkey`: `CREATE UNIQUE INDEX employees_pkey ON public.employees USING btree (id)`
- `employees_status_idx`: `CREATE INDEX employees_status_idx ON public.employees USING btree (status)`
- `employees_storeId_idx`: `CREATE INDEX "employees_storeId_idx" ON public.employees USING btree ("storeId")`
- `employees_storeId_status_employeeType_idx`: `CREATE INDEX "employees_storeId_status_employeeType_idx" ON public.employees USING btree ("storeId", status, "employeeType")`
- `employees_storeId_status_idx`: `CREATE INDEX "employees_storeId_status_idx" ON public.employees USING btree ("storeId", status)`

## `evaluation_ai_evidence`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `aiRunId` | `text` | NO |  |
| `type` | `EvaluationAiEvidenceType` | NO |  |
| `dimension` | `text` | YES |  |
| `skillCode` | `text` | YES |  |
| `message` | `text` | NO |  |
| `confidence` | `numeric` | YES |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |

**Constraints**

- FK `evaluation_ai_evidence_aiRunId_fkey`: `FOREIGN KEY ("aiRunId") REFERENCES evaluation_ai_runs(id) ON UPDATE CASCADE ON DELETE CASCADE`
- PK `evaluation_ai_evidence_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `evaluation_ai_evidence_aiRunId_type_idx`: `CREATE INDEX "evaluation_ai_evidence_aiRunId_type_idx" ON public.evaluation_ai_evidence USING btree ("aiRunId", type)`
- `evaluation_ai_evidence_pkey`: `CREATE UNIQUE INDEX evaluation_ai_evidence_pkey ON public.evaluation_ai_evidence USING btree (id)`

**Triggers**

- `evaluation_ai_evidence_closed_round_immutable`: `CREATE TRIGGER evaluation_ai_evidence_closed_round_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.evaluation_ai_evidence FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_ai_evidence_mutation()`

## `evaluation_ai_runs`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `evaluationId` | `text` | NO |  |
| `status` | `EvaluationAiRunStatus` | NO |  |
| `provider` | `text` | NO |  |
| `model` | `text` | NO |  |
| `textFeedbackSnapshot` | `text` | NO |  |
| `textScore` | `numeric` | NO |  |
| `rawResponse` | `jsonb` | YES |  |
| `errorMessage` | `text` | YES |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `completedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |

**Constraints**

- FK `evaluation_ai_runs_evaluationId_fkey`: `FOREIGN KEY ("evaluationId") REFERENCES evaluations(id) ON UPDATE CASCADE ON DELETE CASCADE`
- PK `evaluation_ai_runs_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `evaluation_ai_runs_evaluationId_createdAt_idx`: `CREATE INDEX "evaluation_ai_runs_evaluationId_createdAt_idx" ON public.evaluation_ai_runs USING btree ("evaluationId", "createdAt")`
- `evaluation_ai_runs_pkey`: `CREATE UNIQUE INDEX evaluation_ai_runs_pkey ON public.evaluation_ai_runs USING btree (id)`
- `evaluation_ai_runs_status_idx`: `CREATE INDEX evaluation_ai_runs_status_idx ON public.evaluation_ai_runs USING btree (status)`

**Triggers**

- `evaluation_ai_runs_closed_round_immutable`: `CREATE TRIGGER evaluation_ai_runs_closed_round_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.evaluation_ai_runs FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_ai_run_mutation()`

## `evaluation_round_evaluators`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `roundId` | `text` | NO |  |
| `evaluatorAccountId` | `text` | YES |  |
| `evaluatorDisplayNameSnapshot` | `text` | NO |  |
| `excludedAt` | `timestamp without time zone` | YES |  |
| `exclusionReason` | `text` | YES |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |

**Constraints**

- FK `evaluation_round_evaluators_evaluatorAccountId_fkey`: `FOREIGN KEY ("evaluatorAccountId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL`
- FK `evaluation_round_evaluators_roundId_fkey`: `FOREIGN KEY ("roundId") REFERENCES evaluation_rounds(id) ON UPDATE CASCADE ON DELETE CASCADE`
- PK `evaluation_round_evaluators_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `evaluation_round_evaluators_evaluatorAccountId_roundId_idx`: `CREATE INDEX "evaluation_round_evaluators_evaluatorAccountId_roundId_idx" ON public.evaluation_round_evaluators USING btree ("evaluatorAccountId", "roundId")`
- `evaluation_round_evaluators_pkey`: `CREATE UNIQUE INDEX evaluation_round_evaluators_pkey ON public.evaluation_round_evaluators USING btree (id)`
- `evaluation_round_evaluators_roundId_evaluatorAccountId_key`: `CREATE UNIQUE INDEX "evaluation_round_evaluators_roundId_evaluatorAccountId_key" ON public.evaluation_round_evaluators USING btree ("roundId", "evaluatorAccountId")`
- `evaluation_round_evaluators_roundId_excludedAt_idx`: `CREATE INDEX "evaluation_round_evaluators_roundId_excludedAt_idx" ON public.evaluation_round_evaluators USING btree ("roundId", "excludedAt")`

**Triggers**

- `evaluation_round_evaluators_closed_round_immutable`: `CREATE TRIGGER evaluation_round_evaluators_closed_round_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.evaluation_round_evaluators FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_membership_mutation()`

## `evaluation_rounds`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `employeeId` | `text` | NO |  |
| `storeId` | `text` | NO |  |
| `employeeTypeSnapshot` | `EmployeeType` | NO |  |
| `scoringVersion` | `text` | NO |  |
| `scoringPolicySnapshot` | `jsonb` | NO |  |
| `skillBaselineSnapshot` | `jsonb` | NO |  |
| `status` | `EvaluationRoundStatus` | NO | `'OPEN'::"EvaluationRoundStatus"` |
| `createdByAccountId` | `text` | YES |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `closedAt` | `timestamp without time zone` | YES |  |
| `roundNumber` | `integer` | NO | `1` |
| `openedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `closedEligibleCount` | `integer` | YES |  |
| `closedSubmittedCount` | `integer` | YES |  |
| `finalAggregateOverall` | `numeric` | YES |  |
| `finalAggregateTier` | `TierV1` | YES |  |
| `finalAggregateComponents` | `jsonb` | YES |  |
| `finalAggregateSkillCoverage` | `numeric` | YES |  |
| `employeeJobsSnapshot` | `jsonb` | YES |  |
| `employeeDisplayNameSnapshot` | `text` | YES |  |
| `storeNameSnapshot` | `text` | YES |  |

**Constraints**

- CHECK `evaluation_rounds_closed_timestamp_check`: `CHECK ((((status = 'OPEN'::"EvaluationRoundStatus") AND ("closedAt" IS NULL)) OR ((status = 'CLOSED'::"EvaluationRoundStatus") AND ("closedAt" IS NOT NULL))))`
- FK `evaluation_rounds_createdByAccountId_fkey`: `FOREIGN KEY ("createdByAccountId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL`
- FK `evaluation_rounds_employeeId_fkey`: `FOREIGN KEY ("employeeId") REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- FK `evaluation_rounds_storeId_fkey`: `FOREIGN KEY ("storeId") REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- PK `evaluation_rounds_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `evaluation_rounds_employeeId_status_createdAt_id_idx`: `CREATE INDEX "evaluation_rounds_employeeId_status_createdAt_id_idx" ON public.evaluation_rounds USING btree ("employeeId", status, "createdAt" DESC, id DESC)`
- `evaluation_rounds_employeeId_status_idx`: `CREATE INDEX "evaluation_rounds_employeeId_status_idx" ON public.evaluation_rounds USING btree ("employeeId", status)`
- `evaluation_rounds_employeeJobsSnapshot_idx`: `CREATE INDEX "evaluation_rounds_employeeJobsSnapshot_idx" ON public.evaluation_rounds USING gin ("employeeJobsSnapshot" jsonb_path_ops)`
- `evaluation_rounds_employee_round_number_key`: `CREATE UNIQUE INDEX evaluation_rounds_employee_round_number_key ON public.evaluation_rounds USING btree ("employeeId", "roundNumber")`
- `evaluation_rounds_id_employeeId_storeId_key`: `CREATE UNIQUE INDEX "evaluation_rounds_id_employeeId_storeId_key" ON public.evaluation_rounds USING btree (id, "employeeId", "storeId")`
- `evaluation_rounds_one_open_per_employee_idx`: `CREATE UNIQUE INDEX evaluation_rounds_one_open_per_employee_idx ON public.evaluation_rounds USING btree ("employeeId") WHERE (status = 'OPEN'::"EvaluationRoundStatus")`
- `evaluation_rounds_pkey`: `CREATE UNIQUE INDEX evaluation_rounds_pkey ON public.evaluation_rounds USING btree (id)`
- `evaluation_rounds_status_createdAt_idx`: `CREATE INDEX "evaluation_rounds_status_createdAt_idx" ON public.evaluation_rounds USING btree (status, "createdAt")`
- `evaluation_rounds_storeId_status_idx`: `CREATE INDEX "evaluation_rounds_storeId_status_idx" ON public.evaluation_rounds USING btree ("storeId", status)`

**Triggers**

- `evaluation_rounds_closed_immutable`: `CREATE TRIGGER evaluation_rounds_closed_immutable BEFORE DELETE OR UPDATE ON public.evaluation_rounds FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_mutation()`

## `evaluation_skill_snapshots`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `evaluationId` | `text` | NO |  |
| `skillDefinitionId` | `text` | YES |  |
| `skillCode` | `text` | NO |  |
| `skillNameZh` | `text` | NO |  |
| `skillNameEn` | `text` | NO |  |
| `category` | `text` | NO |  |
| `status` | `SkillStatus` | NO |  |
| `statusFactor` | `numeric` | NO |  |
| `weight` | `numeric` | NO |  |
| `contribution` | `numeric` | NO |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `skillMode` | `SkillMode` | NO | `'PROGRESSIVE'::"SkillMode"` |

**Constraints**

- FK `evaluation_skill_snapshots_evaluationId_fkey`: `FOREIGN KEY ("evaluationId") REFERENCES evaluations(id) ON UPDATE CASCADE ON DELETE CASCADE`
- PK `evaluation_skill_snapshots_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `evaluation_skill_snapshots_evaluationId_idx`: `CREATE INDEX "evaluation_skill_snapshots_evaluationId_idx" ON public.evaluation_skill_snapshots USING btree ("evaluationId")`
- `evaluation_skill_snapshots_evaluationId_skillCode_key`: `CREATE UNIQUE INDEX "evaluation_skill_snapshots_evaluationId_skillCode_key" ON public.evaluation_skill_snapshots USING btree ("evaluationId", "skillCode")`
- `evaluation_skill_snapshots_pkey`: `CREATE UNIQUE INDEX evaluation_skill_snapshots_pkey ON public.evaluation_skill_snapshots USING btree (id)`

**Triggers**

- `evaluation_skill_snapshots_closed_round_immutable`: `CREATE TRIGGER evaluation_skill_snapshots_closed_round_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.evaluation_skill_snapshots FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_skill_snapshot_mutation()`

## `evaluations`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `employeeId` | `text` | NO |  |
| `storeId` | `text` | NO |  |
| `evaluatorId` | `text` | YES |  |
| `evaluationPeriod` | `text` | YES |  |
| `attitudeScore` | `integer` | YES |  |
| `attendanceScore` | `integer` | YES |  |
| `skillScore` | `integer` | YES |  |
| `pressureHandlingScore` | `integer` | YES |  |
| `teamworkScore` | `integer` | YES |  |
| `executionScore` | `integer` | YES |  |
| `serviceQualityScore` | `integer` | YES |  |
| `growthPotentialScore` | `integer` | YES |  |
| `manualWeightedScore` | `numeric` | YES |  |
| `textReview` | `text` | NO | `''::text` |
| `aiTextScore` | `integer` | YES |  |
| `aiRiskScore` | `integer` | YES |  |
| `riskLevel` | `RiskLevel` | YES |  |
| `finalScore` | `numeric` | YES |  |
| `grade` | `Grade` | YES |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp without time zone` | NO |  |
| `completedAt` | `timestamp without time zone` | YES |  |
| `scoringVersion` | `text` | NO | `'legacy-v0'::text` |
| `speedRating` | `integer` | YES |  |
| `initiativeRating` | `integer` | YES |  |
| `attitudeRating` | `integer` | YES |  |
| `availabilityRating` | `integer` | YES |  |
| `skillScoreV1` | `numeric` | YES |  |
| `speedScoreV1` | `numeric` | YES |  |
| `initiativeScoreV1` | `numeric` | YES |  |
| `attitudeScoreV1` | `numeric` | YES |  |
| `availabilityScoreV1` | `numeric` | YES |  |
| `textScoreV1` | `numeric` | YES |  |
| `overallScoreV1` | `numeric` | YES |  |
| `tierV1` | `TierV1` | YES |  |
| `skillCoverageV1` | `numeric` | YES |  |
| `textFeedback` | `text` | YES |  |
| `textScoreSourceV1` | `V1TextScoreSource` | YES |  |
| `selectedAiRunId` | `text` | YES |  |
| `employeeNameSnapshot` | `text` | YES |  |
| `employeeRoleSnapshot` | `text` | YES |  |
| `storeNameSnapshot` | `text` | YES |  |
| `evaluatorNameSnapshot` | `text` | YES |  |
| `version` | `integer` | NO | `0` |
| `evaluatorAccountId` | `text` | YES |  |
| `employeeTypeSnapshot` | `EmployeeType` | NO |  |
| `scoringPolicySnapshot` | `jsonb` | NO |  |
| `roundId` | `text` | NO |  |
| `evaluatorRoleSnapshot` | `AccountRole` | YES |  |
| `submittedAt` | `timestamp without time zone` | YES |  |
| `evaluationStatus` | `EvaluationStatus` | NO |  |

**Constraints**

- CHECK `evaluations_v1_component_ranges`: `CHECK (((("skillScoreV1" IS NULL) OR (("skillScoreV1" >= (0)::numeric) AND ("skillScoreV1" <= (60)::numeric))) AND (("speedScoreV1" IS NULL) OR (("speedScoreV1" >= (0)::numeric) AND ("speedScoreV1" <= (15)::numeric))) AND (("initiativeScoreV1" IS NULL) OR (("initiativeScoreV1" >= (0)::numeric) AND ("initiativeScoreV1" <= (25)::numeric))) AND (("attitudeScoreV1" IS NULL) OR (("attitudeScoreV1" >= (0)::numeric) AND ("attitudeScoreV1" <= (25)::numeric))) AND (("availabilityScoreV1" IS NULL) OR (("availabilityScoreV1" >= (0)::numeric) AND ("availabilityScoreV1" <= (10)::numeric))) AND (("textScoreV1" IS NULL) OR (("textScoreV1" >= (0)::numeric) AND ("textScoreV1" <= (15)::numeric))) AND (("overallScoreV1" IS NULL) OR (("overallScoreV1" >= (0)::numeric) AND ("overallScoreV1" <= (100)::numeric))) AND (("skillCoverageV1" IS NULL) OR (("skillCoverageV1" >= (0)::numeric) AND ("skillCoverageV1" <= (1)::numeric)))))`
- CHECK `evaluations_v1_rating_ranges`: `CHECK (((("speedRating" IS NULL) OR (("speedRating" >= 1) AND ("speedRating" <= 5))) AND (("initiativeRating" IS NULL) OR (("initiativeRating" >= 1) AND ("initiativeRating" <= 5))) AND (("attitudeRating" IS NULL) OR (("attitudeRating" >= 1) AND ("attitudeRating" <= 5))) AND (("availabilityRating" IS NULL) OR (("availabilityRating" >= 1) AND ("availabilityRating" <= 5)))))`
- FK `evaluations_employeeId_fkey`: `FOREIGN KEY ("employeeId") REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- FK `evaluations_evaluatorAccountId_fkey`: `FOREIGN KEY ("evaluatorAccountId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL`
- FK `evaluations_roundId_employeeId_storeId_fkey`: `FOREIGN KEY ("roundId", "employeeId", "storeId") REFERENCES evaluation_rounds(id, "employeeId", "storeId") ON UPDATE CASCADE ON DELETE RESTRICT`
- FK `evaluations_storeId_fkey`: `FOREIGN KEY ("storeId") REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- PK `evaluations_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `evaluations_employeeId_evaluationPeriod_idx`: `CREATE INDEX "evaluations_employeeId_evaluationPeriod_idx" ON public.evaluations USING btree ("employeeId", "evaluationPeriod")`
- `evaluations_employeeId_idx`: `CREATE INDEX "evaluations_employeeId_idx" ON public.evaluations USING btree ("employeeId")`
- `evaluations_employeeId_scoringVersion_evaluationStatus_complete`: `CREATE INDEX "evaluations_employeeId_scoringVersion_evaluationStatus_complete" ON public.evaluations USING btree ("employeeId", "scoringVersion", "evaluationStatus", "completedAt")`
- `evaluations_employeeId_storeId_evaluationPeriod_key`: `CREATE UNIQUE INDEX "evaluations_employeeId_storeId_evaluationPeriod_key" ON public.evaluations USING btree ("employeeId", "storeId", "evaluationPeriod")`
- `evaluations_evaluationPeriod_idx`: `CREATE INDEX "evaluations_evaluationPeriod_idx" ON public.evaluations USING btree ("evaluationPeriod")`
- `evaluations_evaluationStatus_idx`: `CREATE INDEX "evaluations_evaluationStatus_idx" ON public.evaluations USING btree ("evaluationStatus")`
- `evaluations_evaluatorAccountId_idx`: `CREATE INDEX "evaluations_evaluatorAccountId_idx" ON public.evaluations USING btree ("evaluatorAccountId")`
- `evaluations_finalScore_idx`: `CREATE INDEX "evaluations_finalScore_idx" ON public.evaluations USING btree ("finalScore")`
- `evaluations_pkey`: `CREATE UNIQUE INDEX evaluations_pkey ON public.evaluations USING btree (id)`
- `evaluations_riskLevel_idx`: `CREATE INDEX "evaluations_riskLevel_idx" ON public.evaluations USING btree ("riskLevel")`
- `evaluations_roundId_evaluationStatus_completedAt_idx`: `CREATE INDEX "evaluations_roundId_evaluationStatus_completedAt_idx" ON public.evaluations USING btree ("roundId", "evaluationStatus", "completedAt")`
- `evaluations_roundId_evaluatorAccountId_key`: `CREATE UNIQUE INDEX "evaluations_roundId_evaluatorAccountId_key" ON public.evaluations USING btree ("roundId", "evaluatorAccountId")`
- `evaluations_scoringVersion_evaluationStatus_completedAt_idx`: `CREATE INDEX "evaluations_scoringVersion_evaluationStatus_completedAt_idx" ON public.evaluations USING btree ("scoringVersion", "evaluationStatus", "completedAt")`
- `evaluations_storeId_evaluationPeriod_idx`: `CREATE INDEX "evaluations_storeId_evaluationPeriod_idx" ON public.evaluations USING btree ("storeId", "evaluationPeriod")`
- `evaluations_storeId_idx`: `CREATE INDEX "evaluations_storeId_idx" ON public.evaluations USING btree ("storeId")`
- `evaluations_storeId_scoringVersion_evaluationStatus_completedAt`: `CREATE INDEX "evaluations_storeId_scoringVersion_evaluationStatus_completedAt" ON public.evaluations USING btree ("storeId", "scoringVersion", "evaluationStatus", "completedAt")`

**Triggers**

- `evaluations_closed_round_immutable`: `CREATE TRIGGER evaluations_closed_round_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.evaluations FOR EACH ROW EXECUTE FUNCTION prevent_closed_round_evaluation_mutation()`

## `login_rate_limits`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `keyHash` | `character` | NO |  |
| `attemptCount` | `integer` | NO |  |
| `startedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |

**Constraints**

- CHECK `login_rate_limits_attempt_count_check`: `CHECK ((("attemptCount" >= 1) AND ("attemptCount" <= 11)))`
- PK `login_rate_limits_pkey`: `PRIMARY KEY ("keyHash")`

**Indexes**

- `login_rate_limits_pkey`: `CREATE UNIQUE INDEX login_rate_limits_pkey ON public.login_rate_limits USING btree ("keyHash")`
- `login_rate_limits_startedAt_idx`: `CREATE INDEX "login_rate_limits_startedAt_idx" ON public.login_rate_limits USING btree ("startedAt")`

## `performance_notes`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `employeeId` | `text` | NO |  |
| `storeId` | `text` | NO |  |
| `authorId` | `text` | YES |  |
| `noteDate` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `noteType` | `PerformanceNoteType` | NO |  |
| `dimensions` | `ARRAY` | NO | `ARRAY[]::text[]` |
| `scoreImpact` | `integer` | YES |  |
| `noteText` | `text` | NO |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp without time zone` | NO |  |

**Constraints**

- FK `performance_notes_employeeId_fkey`: `FOREIGN KEY ("employeeId") REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- FK `performance_notes_storeId_fkey`: `FOREIGN KEY ("storeId") REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- PK `performance_notes_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `performance_notes_employeeId_idx`: `CREATE INDEX "performance_notes_employeeId_idx" ON public.performance_notes USING btree ("employeeId")`
- `performance_notes_employeeId_noteDate_idx`: `CREATE INDEX "performance_notes_employeeId_noteDate_idx" ON public.performance_notes USING btree ("employeeId", "noteDate")`
- `performance_notes_noteDate_idx`: `CREATE INDEX "performance_notes_noteDate_idx" ON public.performance_notes USING btree ("noteDate")`
- `performance_notes_noteType_idx`: `CREATE INDEX "performance_notes_noteType_idx" ON public.performance_notes USING btree ("noteType")`
- `performance_notes_pkey`: `CREATE UNIQUE INDEX performance_notes_pkey ON public.performance_notes USING btree (id)`
- `performance_notes_storeId_idx`: `CREATE INDEX "performance_notes_storeId_idx" ON public.performance_notes USING btree ("storeId")`
- `performance_notes_storeId_noteDate_idx`: `CREATE INDEX "performance_notes_storeId_noteDate_idx" ON public.performance_notes USING btree ("storeId", "noteDate")`

## `skill_definitions`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `code` | `text` | NO |  |
| `nameZh` | `text` | NO |  |
| `nameEn` | `text` | NO |  |
| `category` | `text` | NO |  |
| `weight` | `numeric` | NO |  |
| `displayOrder` | `integer` | NO |  |
| `isActive` | `boolean` | NO | `true` |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `skillMode` | `SkillMode` | NO | `'PROGRESSIVE'::"SkillMode"` |

**Constraints**

- CHECK `skill_definitions_weight_positive`: `CHECK ((weight > (0)::numeric))`
- PK `skill_definitions_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `skill_definitions_code_key`: `CREATE UNIQUE INDEX skill_definitions_code_key ON public.skill_definitions USING btree (code)`
- `skill_definitions_isActive_category_displayOrder_idx`: `CREATE INDEX "skill_definitions_isActive_category_displayOrder_idx" ON public.skill_definitions USING btree ("isActive", category, "displayOrder")`
- `skill_definitions_pkey`: `CREATE UNIQUE INDEX skill_definitions_pkey ON public.skill_definitions USING btree (id)`

## `store_job_definitions`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `storeId` | `text` | NO |  |
| `name` | `text` | NO |  |
| `code` | `text` | YES |  |
| `colorToken` | `text` | NO | `'slate'::text` |
| `displayOrder` | `integer` | NO | `0` |
| `isActive` | `boolean` | NO | `true` |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |

**Constraints**

- FK `store_job_definitions_storeId_fkey`: `FOREIGN KEY ("storeId") REFERENCES stores(id) ON UPDATE CASCADE ON DELETE RESTRICT`
- PK `store_job_definitions_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `store_job_definitions_id_storeId_key`: `CREATE UNIQUE INDEX "store_job_definitions_id_storeId_key" ON public.store_job_definitions USING btree (id, "storeId")`
- `store_job_definitions_pkey`: `CREATE UNIQUE INDEX store_job_definitions_pkey ON public.store_job_definitions USING btree (id)`
- `store_job_definitions_storeId_isActive_displayOrder_idx`: `CREATE INDEX "store_job_definitions_storeId_isActive_displayOrder_idx" ON public.store_job_definitions USING btree ("storeId", "isActive", "displayOrder")`
- `store_job_definitions_storeId_name_key`: `CREATE UNIQUE INDEX "store_job_definitions_storeId_name_key" ON public.store_job_definitions USING btree ("storeId", name)`

## `stores`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `name` | `text` | NO |  |
| `region` | `text` | NO |  |
| `managerName` | `text` | NO |  |
| `city` | `text` | NO |  |
| `isActive` | `boolean` | NO | `true` |
| `archivedAt` | `timestamp without time zone` | YES |  |

**Constraints**

- PK `stores_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `stores_isActive_name_idx`: `CREATE INDEX "stores_isActive_name_idx" ON public.stores USING btree ("isActive", name)`
- `stores_pkey`: `CREATE UNIQUE INDEX stores_pkey ON public.stores USING btree (id)`

## `user_account_store_accesses`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `accountId` | `text` | NO |  |
| `storeId` | `text` | NO |  |
| `assignedAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `assignedByAccountId` | `text` | YES |  |

**Constraints**

- FK `user_account_store_accesses_accountId_fkey`: `FOREIGN KEY ("accountId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE CASCADE`
- FK `user_account_store_accesses_assignedByAccountId_fkey`: `FOREIGN KEY ("assignedByAccountId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL`
- FK `user_account_store_accesses_storeId_fkey`: `FOREIGN KEY ("storeId") REFERENCES stores(id) ON UPDATE CASCADE ON DELETE CASCADE`
- PK `user_account_store_accesses_pkey`: `PRIMARY KEY ("accountId", "storeId")`

**Indexes**

- `user_account_store_accesses_assignedByAccountId_idx`: `CREATE INDEX "user_account_store_accesses_assignedByAccountId_idx" ON public.user_account_store_accesses USING btree ("assignedByAccountId")`
- `user_account_store_accesses_pkey`: `CREATE UNIQUE INDEX user_account_store_accesses_pkey ON public.user_account_store_accesses USING btree ("accountId", "storeId")`
- `user_account_store_accesses_storeId_accountId_idx`: `CREATE INDEX "user_account_store_accesses_storeId_accountId_idx" ON public.user_account_store_accesses USING btree ("storeId", "accountId")`

## `user_accounts`

| Column | PostgreSQL type | Nullable | Default |
|---|---|---|---|
| `id` | `text` | NO |  |
| `username` | `text` | NO |  |
| `displayName` | `text` | NO |  |
| `passwordHash` | `text` | NO |  |
| `role` | `AccountRole` | NO |  |
| `isActive` | `boolean` | NO | `true` |
| `lastLoginAt` | `timestamp without time zone` | YES |  |
| `createdAt` | `timestamp without time zone` | NO | `CURRENT_TIMESTAMP` |
| `updatedAt` | `timestamp without time zone` | NO |  |
| `deletedAt` | `timestamp without time zone` | YES |  |
| `deletedByAccountId` | `text` | YES |  |

**Constraints**

- FK `user_accounts_deletedByAccountId_fkey`: `FOREIGN KEY ("deletedByAccountId") REFERENCES user_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL`
- PK `user_accounts_pkey`: `PRIMARY KEY (id)`

**Indexes**

- `user_accounts_deletedAt_role_isActive_idx`: `CREATE INDEX "user_accounts_deletedAt_role_isActive_idx" ON public.user_accounts USING btree ("deletedAt", role, "isActive")`
- `user_accounts_pkey`: `CREATE UNIQUE INDEX user_accounts_pkey ON public.user_accounts USING btree (id)`
- `user_accounts_role_isActive_idx`: `CREATE INDEX "user_accounts_role_isActive_idx" ON public.user_accounts USING btree (role, "isActive")`
- `user_accounts_username_key`: `CREATE UNIQUE INDEX user_accounts_username_key ON public.user_accounts USING btree (username)`
