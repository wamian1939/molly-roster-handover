# Evaluate Molly Integration Contract

## 2026-10-21 Roster Shift Role association follow-up

The local Hurstville Roster catalog now contains store-scoped `li-xiaobai`/莉小白 and `front-counter`/前台 Shift Roles, completing code associations for all six Evaluate formal job definitions. These are Roster scheduling metadata only. The two new roles have zero Shifts/templates and no `requiredSkillCodes` until business skill rules are confirmed. No Evaluate employee assignment, official score, Tier or API contract was modified. Normal local ADMIN Chrome Day showed all six options after refreshing its previously cached catalog; a 09:00–10:30 blank-drag draft was cancelled without a Shift write.

## 2026-10-21 local Hurstville job catalog

Evaluate's local Hurstville formal `StoreJobDefinition` catalog now contains 带训员 (`trainer`), 莉小白 (`li-xiaobai`), 前台 (`front-counter`), 培训 (`training`), 后厨 (`back-kitchen`), 全岗 (`full-role`) in BHS observed order. The four added definitions each have **zero** `EmployeeJobAssignment` rows. No API DTO, workforce revision semantics, official score/Tier, or database schema was changed by this catalog update. Roster must continue to distinguish a formal definition, a confirmed employee assignment, an employee skill, and a Roster Shift Role. All six now have matching Roster scheduling codes. The new definitions and roles do not themselves authorize any employee for a formal job. Green Square's catalog remains unchanged.

## 2026-10-21 Scheduled Shift employee-Job filter correction

BHS read-only behavior confirms its Scheduled Shift Job checkboxes filter **employees**, while all of an included employee's Shift hours remain in the summary. Molly's panel now receives the active, store-scoped `StoreJobDefinition` catalog from the existing `GET /api/workforce/stores/:storeId/jobs` path and current employee `positions[].id` from Evaluate. Shift aggregation stays independent of the selected Job; the selection filters employee rows afterward. Historical Roster Shift roles cannot create formal Job options. The Calendar Shift editor still uses its separate `verifiedShiftRoles` list; published Worklog snapshots are unchanged. This corrects the older paragraph below that says panel checkboxes are matched to stored Shift role IDs. No Evaluate source/API/database or Roster backend contract changed.

Later read-only BHS date switching showed only the Jobs held by employees with Shifts in the selected date range. Molly now intersects the active Evaluate store catalog and current employee formal assignments with the selected-date Shift summaries to build the checkbox list. Employee-name search applies afterward and does not change the options. A newly appearing Job starts checked; explicit prior exclusions persist. Current employee assignments are read only; no qualification is inferred from a Shift role or skill.

## 2026-10-21 Scheduled Shift panel formal-job boundary

The Calendar loads Shift Role choices through `verifiedShiftRoles`, which matches active Roster scheduling metadata to Evaluate's current formal Job catalog and attaches `formalJobId`. The Scheduled Shift panel's Job checkboxes use Evaluate's active store Job catalog directly and filter employee `positions[].id` after full Shift aggregation; an old Roster role name alone cannot become a current Job filter. Historical draft Shifts remain visible with `旧岗位` in Worklog, while published role snapshots keep their frozen names. This is a frontend read/display change only; Evaluate ownership, API and database are unchanged.

## 2026-10-20 Roster-local preview configuration versions

Availability Script Preview now also hashes the Roster-owned store-settings and shortcut versions; the Staff editor refreshes shortcuts before Preview and must reconfirm any externally changed list. This is entirely within Roster and does not change Evaluate's API, authoritative employee data, or database. Evaluate Workforce Revision remains a separate input to the reviewed preview hash. The canonical-slot source hash remains stable for import idempotency. The independent-database read-to-write race after the final Evaluate read remains unresolved.

## 2026-10-20 script preview workforce checkpoint

For Availability Script, Roster's authenticated Evaluate 1.4 paged employee read now carries the verified `workforceRevision` into a preview-specific fingerprint. Commit refreshes the employee list and recomputes that fingerprint; a changed revision rejects the stale manager preview with HTTP 409, even when all script slots still resolve to the same canonical IDs. Resolved employee names are included so a legacy 1.3 contract rename also invalidates an explicitly mapped alias preview. The stored import `sourceHash` remains based on store/week/timezone/canonical slots and is independent of workforce revision, preserving duplicate-import semantics. This is a Roster adapter change; Evaluate code and its independent PostgreSQL database were untouched. A transfer after the final Evaluate read but before Roster commits remains a residual cross-system race.

## 2026-10-17 formal-job ID in Shift picker

The existing verified-role matcher now attaches the exact Evaluate `StoreJobDefinition.id` to each frontend scheduling role. The Shift editor checks that ID against an employee's Evaluate `positions[].id`, not against a skill percentage or the role label. This is frontend-only metadata, not a Roster database field or an Evaluate write. Missing assignment is labelled unconfirmed and remains advisory pending a documented blocking policy. A same-name but different-code job cannot falsely confirm another job ID.

## 2026-10-17 copy execution snapshot contract

Copy Day, Copy Period and Repeat execution fetch the current active employee list from Evaluate through the authenticated integration adapter. The Roster route forwards canonical IDs and current name, employee type, employment type, official CLOSED-round score/Tier and round provenance as assignment snapshots. New DRAFT assignments use those current values; old source Shifts and immutable publications retain their own snapshots. A missing current employee blocks the copy. Copy preview remains read-only and validates active membership, Availability, conflicts and formal roles. This changes only the Roster adapter/service, not Evaluate code or its database. The separate-database read-to-write race remains and is documented in the database audit.

## 2026-10-16 publication name contract

The Publish route supplies both the allowed Shift Role IDs and matched current formal names from Evaluate. The transaction validates IDs and freezes the corresponding Evaluate name in each new publication snapshot. Existing draft Shift snapshots and earlier publications remain unchanged. A paired disposable browser Publish and direct manager-history read verified this with source `QA Front` versus newly published `Official QA Front`. Because Evaluate and Roster use independent databases, a job rename after the Evaluate read but before commit remains a residual race; the stored publication is immutable once written.

## 2026-10-16 copied Shift name semantics

Copy Day, Copy Week and Repeat receive a current role-ID-to-name map from the authenticated Evaluate store-job catalog along with the allowed IDs. A newly created Shift freezes the matched formal job name; its source Shift and any older publication remain untouched. Batch role updates also freeze the matched formal name. The active Calendar card labels verified roles with the current formal name; source Shift snapshots are retained in normalized data. Exact formal Job code takes priority over the single scoped `full-role`/全岗 to `all-rounder`/全岗 alias; no arbitrary name fallback remains. A workforce or job change after the Evaluate read remains a cross-database race because the systems use independent databases.

## 2026-10-16 write-path checkpoint

Roster reads Evaluate's authenticated active store-job catalog before creating/reactivating a local scheduling role, creating/updating a Shift, choosing a template or batch role, publishing a period, and previewing/committing Copy Day, Copy Week or Repeat. New direct Shift role-name snapshots use the matched Evaluate job name; historical snapshots remain frozen. A Publish or copy containing a role outside that list returns or previews `UNVERIFIED_SHIFT_ROLE` / HTTP 422 before any publication or target-copy writes. Evaluate remains the formal-job authority; no Evaluate code or database migration changed in this checkpoint.

## Formal store jobs used by Roster (2026-10-16)

Evaluate owns `StoreJobDefinition` and employee assignments to those formal jobs. Its authenticated `GET /api/store-jobs?storeId=...` returns the current store's active job catalog; Roster proxies it through `GET /api/workforce/stores/:storeId/jobs` after its own store authorization, validates each returned store ID, and forwards only the Evaluate session cookie. Calendar and Settings role choices require matching formal Job and Roster role codes. The one scoped legacy compatibility alias is Evaluate `full-role`/“全岗” to Roster `all-rounder`/“全岗”; arbitrary exact display-name matches no longer grant a formal association. A Roster role creation request must match the active Evaluate code and name. Roster does not write Evaluate formal jobs or qualifications. Existing Shift and publication snapshots remain unchanged. The previously observed Hurstville Evaluate catalog had “全岗” and “带训员”, while a later signed-in, read-only BHS Job Info inspection listed six rows: 带训员, 莉小白, 前台, 培训, 后厨 and 全岗. This mismatch needs authoritative qualification mapping; BHS labels alone cannot create Evaluate formal positions.

## 2026-10-16 Repeat and Publish workforce drift

Repeat Shift preview is advisory. Its execute endpoint and Publish read the current Evaluate workforce again. A disposable-schema Chromium test transferred Bob after a copyable Repeat preview: execute returned 422 `ARCHIVED_EMPLOYEE`, the old preview was discarded and a fresh preview blocked. Publish also returned 422 and left the DRAFT period and existing publication unchanged. Evaluate application/API contract was not modified.

## 2026-10-16 copy preview workforce drift

Copy Day and Copy Week preview responses are advisory. Their execute endpoints fetch current active employees from Evaluate again and reject a transferred employee with `ARCHIVED_EMPLOYEE`; Roster then makes no target writes. The Calendar frontend now discards the old preview after such a rejected commit. A two-tab disposable-schema Chromium test observed initially copyable previews, subsequent 422 commit failures, newly blocked previews and unchanged PostgreSQL target/history. Evaluate application and API contract were unchanged.

## 2026-10-16 stale-workforce drag recovery

Roster's Move/Resize and employee-row mutations use current Evaluate workforce validation. After an `ARCHIVED_EMPLOYEE` rejection, Calendar now reloads the active workforce and authoritative Shift state. Separate Week-row and Day TimeGrid Chromium drags after a guarded Evaluate transfer each returned 422, left the Shift unchanged in PostgreSQL, and displayed the former employee as requiring reassignment. No Evaluate API or app change was made.

## 2026-10-16 mid-dialog departure recovery

Roster revalidates submitted assignment IDs against Evaluate on every Shift Create/Update. When a currently open Edit gets `ARCHIVED_EMPLOYEE`, the frontend now reloads Evaluate workforce and date Availability without discarding draft fields. A disposable-schema browser run moved Bob after Edit opened: the first PATCH returned 400, the dialog exposed his stale saved assignment for removal, and the replacement HandoverEmployee006 PATCH returned 200 with the note preserved. Published Roster history was unchanged; Evaluate code and contract were not modified.

## 2026-10-16 employee departure handling

Evaluate's store workforce list contains current Active employees. Roster may retain a former employee's canonical ID and name snapshot on a draft Shift and in immutable published history. The draft Shift editor now exposes a removal control for a selected assignment absent from the current workforce and blocks Save until it is replaced or removed. The versioned Roster update revalidates all submitted IDs against a fresh Evaluate read. A paired disposable-schema Chromium test moved `browser-regular` out of the store, repaired the draft assignment to `browser-HandoverEmployee006`, and verified the publication remained unchanged. No Evaluate API or employee master data model changed.

## 2026-10-16 formal-position picker verification

The Shift dialog now derives an independent formal-position filter from the current Evaluate workforce `positions[].id` and `positions[].name`. `UNCONFIRMED` selects employees without formal positions. Existing Shift Role skill filtering remains separate and does not grant or infer a formal qualification. A guarded disposable Evaluate schema assigned the QA Water position to canonical `browser-HandoverEmployee006` only; Chromium showed HandoverEmployee006 in QA Water, excluded HandoverEmployee006 from UNCONFIRMED, and saved a shift with the same canonical ID. No Evaluate application/API contract, official score, Tier, or production employee data changed. The fixture and temporary schemas were removed.

## 2026-10-09 isolated browser verification

A generated `STORE_EVALUATOR` logged in through current Roster source on temporary 4035 to the clean Evaluate candidate on 4010, backed by separate disposable schemas. Calendar writes used Evaluate's canonical `browser-regular` and `browser-HandoverEmployee006` IDs; a cross-row move changed only the Roster assignment ID. Publishing created immutable Roster snapshots, and a stale second browser tab could not overwrite a shift. No Evaluate employee, score, Tier, formal position or skill write was performed. Both schemas and temporary services were removed. The normal 4020 Roster backend was then rebuilt and restarted from current source; normal 4000 Evaluate still requires candidate release review. Target HTTPS and authorized real-account acceptance remain open.

Contract version: `1.4.0` (major version 1 remains compatible)

Roster also reads authenticated `GET /api/roster-integration/skill-definitions` to validate active `SkillDefinition.code` values before creating or activating a ShiftRole with required skills. Unknown or inactive codes return 400; catalog failure returns 503 without writing the role. Existing custom role requirements are not changed automatically.

Roster's authenticated `GET /api/workforce/skill-definitions` returns only the active catalog's code, Chinese name, category and mode to the Settings picker. The UI uses labelled checkboxes instead of manually entered comma-separated codes. The Roster backend still checks the live Evaluate catalog on write.

The Calendar staff picker filters against a ShiftRole's required skill codes. Its label and employee rows distinguish this skill match from Evaluate's explicitly assigned formal positions: an empty `positions` array is displayed as unconfirmed, and a skill match never declares formal position qualification. Managers can see both signals before assigning a shift; the shift assignment never edits Evaluate's positions.

Before publishing a draft, Roster re-reads the current Evaluate store workforce. Every saved assignment must still refer to an active employee in that store. Publication fails without changing the draft when an employee has been archived or transferred or when Evaluate is unavailable. A successful new revision freezes Evaluate's current name, employee type and CLOSED score/Tier in JSON; earlier revisions keep their original snapshots. The two databases do not share a transaction, so a simultaneous Evaluate change after the workforce read is a residual race.

Move/resize of an existing draft shift re-reads the current active store workforce too. Roster checks the saved assignment IDs inside the reposition transaction and returns `ARCHIVED_EMPLOYEE` for a missing/archived/transferred employee, or 503 if Evaluate is unavailable, without moving the shift. This closes a path that previously bypassed the new-assignment and publish guards.

Source audit date: 2026-10-08

## Boundary

Evaluate Molly is the only authority for account/session state, store identity, employee identity, employee type, employment type, active/archive state, the latest final closed-round score and Tier, and current employee skills. Molly Roster may read those values but cannot edit or persist an editable employee authority copy.

Molly Roster owns periods, shifts, assignments, availability, templates, publication state, roster settings, and published assignment snapshots.

## Session and authentication

Evaluate's shared PostgreSQL login limit allows ten attempts per Evaluate-visible IP and normalized username per 15 minutes. On proxied login that IP may be Roster's upstream address, grouping attempts for the same account. Roster returns Evaluate's 429 response and numeric `Retry-After` header without issuing a session cookie; it does not keep a second counter or trust a browser-supplied forwarded IP. Local production-mode network acceptance alternated ten bad attempts between both services, then received 429/`Retry-After: 900` through Roster; another disposable evaluator logged in and passed `/auth/me`. The test schema and services were cleaned. Evaluate migration `20261009190000_shared_login_rate_limit` must be deployed before the updated Evaluate service. Normal local services have not loaded this change; target HTTPS and load-balancer address behavior remain to be accepted.

- Roles are exactly `ADMIN` and `STORE_EVALUATOR`.
- Evaluate issues the `evaluate_molly_session` cookie with `HttpOnly`, `SameSite=Lax`, `Secure` in production, `Path=/`, and an explicit expiry.
- The browser never stores role, store scope, or a session token in local storage.
- Molly Roster's backend verifies the caller against Evaluate `GET /api/auth/me` by forwarding the request cookie.
- Roster forwards only the `evaluate_molly_session` cookie to Evaluate for session verification, integration reads and logout; other browser cookies are excluded.
- Login and logout are same-origin Roster backend proxy operations. Credentials are forwarded only to Evaluate, never logged or persisted by Roster.
- The Roster server sends Evaluate's configured site `Origin` on those two upstream POST requests to satisfy Evaluate's production CSRF guard. By default it uses the origin of `EVALUATE_API_BASE_URL`; set `EVALUATE_APP_ORIGIN` to Evaluate's exact `APP_ORIGIN` when the API base URL is an internal address. The browser's supplied Origin is never forwarded as this value.
- A `401` from Evaluate invalidates the Roster client session and returns the user to login.
- `STORE_EVALUATOR.storeIds` is the authoritative set of accessible stores. ADMIN has `canAccessAllStores: true` and may select an active store. The Roster backend checks every requested store against this set; the frontend offers a selector when more than one store is accessible.

Authenticated user DTO:

```ts
type AuthUser = {
  id: string;
  accountId: string;
  userId: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "STORE_EVALUATOR";
  storeIds: string[];
  stores: Array<{ id: string; name: string }>;
  canAccessAllStores: boolean;
};
```

## Implemented read-only Evaluate endpoints

The dedicated minimal API below is implemented in Evaluate and consumed by Roster. The older `GET /api/roster-skill-board` remains a separate discovery view: for ADMIN it can include an OPEN round aggregate, and its store payload includes fields Roster does not need. It is not the workforce contract.

```text
GET /api/roster-integration/contract-version
GET /api/roster-integration/stores
GET /api/roster-integration/stores/:storeId/employees
GET /api/roster-integration/employees/:employeeId
```

Every endpoint is authenticated by Evaluate. Store access is enforced before service data access.
The store employee endpoint accepts optional positive `page` and `pageSize` query parameters; pageSize is capped at 100. A paged response adds `{ pagination: { page, pageSize, total, hasMore } }`. Roster fetches up to 100 pages, validates the complete set, and returns a flattened workforce response without upstream page metadata. It refuses duplicate IDs, contract-version or pagination-mode changes, changed totals across pages, and incomplete final results. A changing workforce must be retried rather than used for assignments or publication. Unpaged older 1.x responses remain accepted.

For Evaluate 1.4.x, every paged response also contains `workforceRevision`, an opaque digest of the complete active employee identity and store-membership set. Each page is read with that digest in one repeatable-read transaction. Roster requires matching revisions across pages and performs one final revision check before using the list. A same-count transfer or rename during pagination returns 503; retry the read. Earlier 1.3.x paged responses remain compatible. The digest does not cover current skills, formal positions or official scores, which refresh on the next read. A change after the final check remains a cross-service race because the databases are separate.

The local acceptance harness at `backend/scripts/verify-workforce-revision-http.ts` uses Supertest against the candidate Roster app and a temporary Evaluate HTTP service on 4010. It requires Evaluate's disposable browser schema with 101 seeded store employees, verifies proxied STORE_EVALUATOR login, both dependency health checks, two workforce pages, the final revision recheck, and no HR-only fields in the Roster result. It does not start or reload the normal Roster service.

Contract metadata:

```ts
type ContractMetadata = {
  contractVersion: "1.4.0";
  generatedAt: string; // ISO-8601 UTC
  workforceRevision?: string; // paged store employee responses in 1.4.x
};
```

Store DTO:

```ts
type RosterStoreSummary = {
  id: string;
  name: string;
  isActive: boolean;
};
```

Employee DTO:

```ts
type RosterEmployeeSummary = {
  id: string;
  displayName: string;
  employeeType: "REGULAR" | "TRAINING";
  employmentType: "FullTime" | "PartTime" | "Casual" | null;
  storeId: string;
  storeName: string;
  isActive: boolean;
  positions?: Array<{ id: string; code: string | null; name: string }>;
  officialScore: {
    score: number;
    tier: "T1" | "T2" | "T3" | "T4" | "T5";
    roundId: string;
    closedAt: string;
  } | null;
  skillSummary: {
    overallPercent: number | null;
    backOfHousePercent: number | null;
    waterBarPercent: number | null;
    frontOfHousePercent: number | null;
    qualifiedSkillCodes: string[];
    skills: Array<{
      code: string;
      nameZh: string;
      category: "BACK_OF_HOUSE" | "WATER_BAR" | "FRONT_OF_HOUSE" | "OPERATIONS";
      mode: "PROGRESSIVE" | "BINARY";
      status: "NotTrained" | "Training" | "Independent" | "Proficient" | "Unknown" | "CannotDo" | "CanDo";
      updatedAt: string;
    }>;
    operations: {
      opening: "UNKNOWN" | "CAN_DO" | "CANNOT_DO";
      closing: "UNKNOWN" | "CAN_DO" | "CANNOT_DO";
      weeklyCleaning: "UNKNOWN" | "CAN_DO" | "CANNOT_DO";
    };
  };
};
```

`positions` comes only from active, store-matched Evaluate `EmployeeJobAssignment` records. It is an explicitly managed current assignment, separate from `skillSummary` and Roster's `ShiftRole`. An empty array means no formal position has been assigned; no skill score or shift assignment may infer one. The field is optional in the Roster parser for older 1.x responses.

## Official score rule

`officialScore` is derived only from the newest `CLOSED` `EvaluationRound` with a non-null final aggregate. It uses the round aggregate, never an individual evaluation, ADMIN submission, or OPEN provisional aggregate. The persisted closed fields are preferred: `finalAggregateOverall`, `finalAggregateTier`, and `closedAt`. Legacy closed rounds may use the existing aggregate calculation fallback. If no valid final aggregate exists, `officialScore` is null and the UI displays `未完成正式评分`.

## Current skill rule

- Current operational capability comes from `EmployeeSkill`, not historical evaluation snapshots.
- `Independent`, `Proficient`, and `CanDo` count as qualified.
- `Unknown` remains distinct from not trained and never counts as full category qualification.
- Canonical Evaluate skill codes are `tea-preparation`, `milk-bar`, `cup-labeling`, `code-scanning`, `ice-adding`, `cup-spinning`, `transfer-station`, `delivery-packing`, `drink-dispatch`, `order-taking`, `opening`, `closing`, and `weekly-cleaning`. The former Roster-only codes `order-scanning`, `ice-station`, `cup-finishing`, `handoff`, and `drink-handoff` are not Evaluate SkillDefinition codes and must not be used for built-in role requirements.
- Existing source categories map as follows: `Back Kitchen` or `BackKitchen` to `BACK_OF_HOUSE`, `Bar` to `WATER_BAR`, `Front` to `FRONT_OF_HOUSE`, and `Operations` to `OPERATIONS`.
- Category percentage is qualified active progressive skills divided by all active progressive skills in the category. No known skills produces null rather than zero.
- Overall percentage uses all active progressive skills. Binary operations are represented separately and are not blended into progressive percentages.

Built-in role requirements now use Evaluate codes: `front` requires `transfer-station`, `delivery-packing`, `drink-dispatch`, `order-taking`; `water-bar` requires `cup-labeling`, `code-scanning`, `ice-adding`, `cup-spinning`; `back-kitchen` requires `tea-preparation`, `milk-bar`. Roster migration `20261008140000_align_default_shift_role_skill_codes` updates only global roles whose arrays exactly match the old defaults, preserving store-specific/custom requirements and all publication snapshots. The seed creates missing default roles without overwriting configured roles.

## Active and archived employees

- Store employee lists return active employees only.
- Employee lookup by ID may return an archived employee so Roster can validate stale assignments and render management warnings.
- An Evaluate lookup that returns `employee: null` maps to HTTP 404 at the Roster API. Roster rejects a returned employee whose canonical ID differs from the requested URL ID with HTTP 503. Each employee in a store workforce page must have that requested `storeId`; an out-of-scope row fails the entire read with HTTP 503 before any roster write.
- An archived employee cannot be assigned to a future shift.
- Draft batch shift updates fetch the current Evaluate workforce and reject a saved assignment whose employee has been archived or moved to another store. If Evaluate cannot be read, the batch update fails without writing. Deleting a stale draft remains available for cleanup.
- Availability replacement fetches the current active Evaluate store workforce. Archived or transferred employees, and an unavailable Evaluate service, are rejected before the availability write; historical availability remains stored.
- Published history uses Roster-owned snapshots even if Evaluate is unavailable or the employee is later renamed or archived.
- Calendar draft shift cards and the grouped-shift picker resolve active employees' current Evaluate names by canonical ID after a successful Calendar refresh. This is display-only: saved assignment snapshots and immutable published revisions retain their stored names. If an employee is absent from the current workforce, the draft falls back to its saved name and the existing eligibility warning remains visible.

## Explicit PII denial list

No integration response may contain tax file number, bank account or BSB, date of birth, address, suburb, postcode, phone, email, visa, superannuation, ABN, evaluation text, evaluator identity/detail, individual scores, AI analysis, or evidence. Contract tests serialize the response and reject these field names.

## Failure semantics

| Condition | HTTP | Roster behavior |
|---|---:|---|
| Missing/expired session | 401 | Clear user state and show login |
| Cross-store access | 403 | Show `无权访问该门店` without leaking existence |
| Missing employee/store | 404 | Show a localized not-found state |
| Incompatible contract major version | 503 from Roster adapter | Preserve calendar; disable new assignments |
| Evaluate unavailable | 503 from Roster adapter | Preserve persisted roster views; show workforce outage and last success time |

Roster never substitutes stale workforce data as current official data. Both services send `Cache-Control: no-store, private` on `/api` responses so the browser or an intermediary does not reuse a workforce response after a session or store change. Short-lived in-memory cache can improve resilience, but cached responses are labelled with their successful fetch time and are not used to create unknown assignments after an integration outage.

The Staff page refreshes its Evaluate workforce on store change, when the page regains focus or visibility, every 60 seconds while visible, and on explicit request. The display shows the latest successful response time. A refresh updates name, current store membership, formal positions, skills, and official score under the same canonical ID without resetting the selected availability week or its unsaved draft. A failed read labels the visible list as potentially stale and disables availability submission until a successful refresh. The backend independently checks active current-store membership before accepting availability writes. Published roster revisions continue to render their frozen employee snapshots.

## Current skill authority

Evaluate `employee_skills` changes only after explicit ADMIN confirmation. OPEN-round evaluator skill judgments remain individual snapshots, and closing a round does not infer a consensus status. Roster reads only the confirmed current status on each workforce request; its ShiftRole and skill match never write Evaluate skills or formal positions.


## 2026-10-14 single-page workforce revision follow-up

For Evaluate 1.4.x, Roster now performs the final workforceRevision check even when all employees fit on one page. The previous implementation checked only multi-page lists. A route regression verifies that a revision change after a one-page list returns 503 before exposing the workforce. Paired HTTP acceptance against an isolated current Evaluate service verified three requests for a 101-person list and two for a one-person list, with generated STORE_EVALUATOR/ADMIN sessions respectively. The existing digest covers identity/store membership, not scores or skills; an Evaluate change after the final read remains a cross-database race. No Evaluate application code changed.

## 2026-10-15 Diagonal row move and Evaluate snapshot

A single-assignment reposition can now carry sourceEmployeeId and targetEmployeeId together. Before Roster writes, the route reads the current store-scoped Evaluate workforce and requires the target to be active in that store; it supplies the target's canonical employee ID and current name/type/official score/Tier snapshot to the Roster service. Roster never writes Evaluate data. The Roster transaction verifies the source assignment/version and applies the target snapshot only after Availability and conflict checks. As with other cross-database operations, a workforce change after the final Evaluate read is a residual race; the current revision check narrows but does not eliminate it.

## 2026-10-15 cycle configuration boundary

The FORTNIGHT anchor is owned solely by Roster store settings and stored only in the Roster PostgreSQL database. This change does not add or duplicate Employee, Position, Skill, score or Tier authority, does not change Evaluate API 1.4.0 and does not write to Evaluate. Current employee eligibility checks continue to use the existing versioned Evaluate integration before Shift writes and publication. Real STORE_EVALUATOR target-environment acceptance remains open.

## 2026-10-21 exact employee Job grant validation

The Roster adapter matches each current active Evaluate Job definition to a local scheduling Shift Role by canonical Job code (plus the previously approved legacy 全岗 alias). For every assigned employee, it now checks that the current workforce `positions[].id` contains that exact Evaluate Job ID. A matching Job name, code in a different Job ID, skill signal, score or Tier is insufficient. Missing `positions` means no grant. The public error is `UNQUALIFIED_EMPLOYEE_ROLE` (422), naming the employee and instructing a separate Evaluate confirmation. The check covers Create, Update, Draft Commit, Move, Copy previews and commits, Batch Update and Publish; the Roster database never creates a formal employee grant. Historical publication snapshots are unchanged. Current Evaluate 1.4 workforce revision protection is retained, but Job catalog and workforce are read from separate API calls, and there is no distributed transaction between Evaluate and Roster. A grant or catalog change after the final read remains a residual race; a future integration contract could supply a shared Job/workforce revision for stronger compare-and-swap semantics.
