# Employee master data contract

## Local Hurstville catalog alignment, 2026-10-21

Following the user's explicit decision and read-only BHS Job Info observation, local Evaluate Hurstville now defines 带训员 (`trainer`), 莉小白 (`li-xiaobai`), 前台 (`front-counter`), 培训 (`training`), 后厨 (`back-kitchen`) and 全岗 (`full-role`). Only the original two jobs retain their original employee assignment rows; the four added jobs have no employee grants. A job definition is not a formal employee authorization, skill or Roster Shift Role. Green Square was not changed. This was catalog data only, with no schema or integration DTO change; source script and pre-write backup are recorded in `GOAL_MODE_PROGRESS.md`.

## Lifecycle write serialization, 2026-10-09

Evaluate rechecks the current target store while holding a PostgreSQL `FOR SHARE` row lock inside employee create, transfer, restore and promotion transactions. Store archival updates the same row and therefore cannot commit between this check and the employee write. Restore requires an archived employee at the version initially read; promotion requires an active TRAINING employee at that version. A conflicting state or version returns 409 without changing the employee. Explicit canonical ID collisions during concurrent creation also return 409. These rules apply to current master data only; no historical evaluation or published roster snapshot is rewritten.

## Employee edit concurrency, 2026-10-09

`PUT /api/employees/:employeeId` accepts optional `expectedUpdatedAt` in ISO UTC form. The ADMIN editor sends the version returned by the full employee profile. Evaluate compares that version and updates the employee row only if it still matches; a stale edit returns HTTP 409 and asks the manager to reopen the profile. Position replacement and employee transfer use the same database transaction, so a rejected edit rolls back assignment changes. Older API clients that omit the field remain compatible and still get within-request conflict detection, but should send the version to protect an edit form left open across requests. This does not change the canonical ID or historical records.

## Current position maintenance, 2026-10-09

Creating an employee with selected formal positions uses Prisma's nested relation to inherit the employee's current store ID. A transfer that also selects destination-store positions deletes old-store assignments, updates the same canonical employee row, then inserts destination-store assignments in one transaction; the response reloads the current assignments. An invalid destination job is rejected before mutation. A fresh isolated PostgreSQL test reproduced both previous failures and now verifies create and transfer with no duplicate employee ID.

A read-only local development audit found two active stores, four active formal job definitions (`full-role` and `trainer` in each store), two assignments belonging to one of 27 active employees, and 13 active skills across BackKitchen, Bar, Front and Operations categories. These categories are not automatically formal positions. Expanding formal definitions remains a business taxonomy decision; no employee was silently assigned a new position.

The 2026-10-09 read-only rerun confirmed the same counts and ownership: Green Square and Hurstville each have `full-role` and `trainer`; Green Square has zero formal assignments, Hurstville has two assignments held by one employee. The 13 active skill definitions divide into BackKitchen 2, Bar 4, Front 4 and Operations 3. Roster has distinct shift roles named 后厨, 水吧 and 前场 whose required skill codes refer to those categories, plus an all-rounder role. Those shift role labels and skill groups provide a review list for managers; they are not evidence that employees have formal category qualifications. The current `StoreJobDefinition` and employee assignment relation already support multiple explicit positions per employee once category codes and qualification rules are approved; no new position table is needed solely for this decision.

## Historical name provenance addendum, 2026-10-09

For CLOSED evaluation rounds, `identitySources.employeeName` and `.storeName` separately report `ROUND_CLOSE_SNAPSHOT`, `EVALUATION_SNAPSHOT`, or `CURRENT_PROFILE_FALLBACK`. A unanimous completed personal-evaluation label is evidence of the label at submission, not proof of the label at Round close. Missing or conflicting personal labels fall back to the current master profile with an explicit UI warning. Legacy job snapshots remain null; jobs are never inferred from current assignments. New Round closes persist name and job snapshots transactionally. No legacy employee identity or historical score is rewritten by this read policy.

Verified 2026-10-08 against the local Evaluate and Roster repositories and databases.

## Authority and identity

Evaluate `employees.id` is the canonical employee ID. Roster stores that string in `shift_assignments.employeeId` and `employee_availability.employeeId`; it has no Employee master table. A name is never an identity key. Rename, transfer, promotion from TRAINING to REGULAR, and archive retain the ID. Historical evaluation and published roster snapshots retain their recorded names, types, scores and store context.

Transfer and archive are rejected while an EvaluationRound is OPEN. They serialize with creation of a new OPEN round on the canonical employee ID, so the current store/status and OPEN round cannot commit in contradictory states. Close the round first, then repeat the transfer or archive.

`employees.storeId` is the one current store, with a restrictive FK to `stores.id`. `status` is `Active` or `Archived`; `archivedAt` records archive timing. A PostgreSQL check requires `Active` to have no `archivedAt` and `Archived` to have one; an inconsistent legacy row blocks the migration rather than being guessed or deleted. `employeeType` is `TRAINING` or `REGULAR`; `employmentType` is FullTime, PartTime or Casual. Identity fields include displayName, givenName, surname and englishName. Employment commencement, contact, address, visa, bank, tax and superannuation fields stay in Evaluate's ADMIN profile surface. They are absent from Roster integration selects.

Local development completeness check (2026-10-09): 29 employees have a stable ID and nonblank display name; none has an employment commencement date, given name or English name, and 28 lack surname. The operational `tenureMonths` value is therefore null for this dataset. Zero duplicate display-name groups were found, but names are never an identity key. No name or start date was inferred from Roster, evaluation text or other fields. ADMIN HR review with primary evidence is needed before using tenure or legal-name fields for decisions. Re-run the read-only, count-only `backend/scripts/audit-employee-master-completeness.ts` against the guarded local development database after approved corrections.

## Four distinct role concepts

| Concept | Owner | Current storage | Meaning |
|---|---|---|---|
| Account role | Evaluate | `user_accounts.role` | ADMIN or STORE_EVALUATOR authorization |
| Formal store position | Evaluate | `store_job_definitions` and `employee_job_assignments` | Explicit current manager assignment; multiple per employee |
| Skill state | Evaluate | `skill_definitions` and `employee_skills` | Current status per specific skill, including Unknown |
| Shift role | Roster | `shift_roles`, `shifts.shiftRoleId` | Actual role for a scheduled shift |

The active Evaluate position list is transmitted as `positions` in integration contract 1.3.0. Existing data has only the confirmed `full-role` and `trainer` definitions; back of house, water bar and front of house are currently **skill categories**, not proven formal position assignments. A manager must create and explicitly assign any new formal position. Neither a high skill status nor a Roster shift role changes formal qualification.

## Scores and history

Official score and Tier come from the newest valid CLOSED EvaluationRound aggregate. A CLOSED round without a scored evaluator submission has no aggregate; the previous valid official score remains current under the project's present PRODUCT.md rule. OPEN rounds and individual evaluations remain separate. `employee_skills` are current official skill state; `evaluation_skill_snapshots` belong to individual historical submissions. Evaluator submissions do not overwrite current official skills. Existing CLOSED history remains immutable. Round scoring policy is snapshotted per round, so employee type or rule changes cannot recalculate old history.

Round detail returns employee ID and display name without joining current `employee_skills`. CLOSED historical skill categories are derived from frozen `evaluation_skill_snapshots`; a later ADMIN current-skill confirmation cannot appear as a historical skill fact in that Round DTO.

The official score follows `employees.id` through a store transfer. Current-store authorization determines whether an employee may be read; it does not discard the employee's prior-store CLOSED rounds when selecting the latest official score. Prior-store evaluator details and review history retain their original store permission boundary. Employee detail returns only a minimal cross-store official score summary when the historic round is outside the caller's store scope.

ADMIN confirms current skills explicitly from the employee detail page or `PATCH /api/employees/:employeeId/current-skills/:skillDefinitionId` with `{status, expectedUpdatedAt, reason}`. The trimmed reason is required (3–500 characters). `GET /api/employees/:employeeId/current-skills` lists active definitions and returns `Unknown` for a missing current record. Unknown is distinct from NotTrained/CannotDo. The backend rejects a status inconsistent with the definition's progressive/binary mode and returns 409 for a stale update. Even when the confirmed status is unchanged, the transaction writes an immutable `current_skill_confirmations` event with previous/confirmed status, administrator ID, reason and time. This is an approval record, not proof that older unreviewed rows were authoritative. Confirming a current skill does not recompute an OPEN or CLOSED round. No aggregation rule has been approved for converting conflicting evaluator skill judgments into official current skills, so ADMIN close freezes those judgments without changing `employee_skills`.

ADMIN may read one skill's approval history with `GET /api/employees/:employeeId/current-skills/:skillDefinitionId/confirmations?page=1&pageSize=5` (page size 1–50). The response has `{items, page, pageSize, total, totalPages}`; each item contains `id`, `previousStatus`, `confirmedStatus`, `confirmedByAccountId`, `confirmedByName`, `reason` and ISO `confirmedAt`. A missing prior current status is `null`; older direct confirmations may have a null reason. The employee detail dialog shows the selected skill's history with pagination, empty and error states. STORE_EVALUATOR receives 403 before an employee or approval record is read. This audit endpoint is not part of the Roster contract and exposes no HR profile fields.

Current scoring policy is `REGULAR_V3` and `TRAINING_V2`; older policies remain in historical snapshots. Tier v2 thresholds are T5 below 40, T4 40 to below 60, T3 60 to below 70, T2 70 to below 85, T1 from 85. Historical Tier v1 is preserved where snapshotted.

## Ownership and privacy

Evaluate owns Employee, Store, authentication, employee type, employment status, positions, current skills, evaluation rounds and official results. Roster owns availability, shifts, shift roles, assignments, templates, publications and their snapshots. Only Evaluate can write the former. Roster reads the authenticated versioned API and cannot write official scores or HR data.
