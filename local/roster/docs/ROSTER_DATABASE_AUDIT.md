# Roster database audit — 2026-10-09

## 2026-10-21 Calendar and export with unknown legacy timezone

Calendar previously filtered previous-day carryover with an implicit Sydney midnight. A store with Shifts but no settings now receives 409 until its timezone is reconciled; an empty unconfigured store may still display a read-only UTC grid. Copy Day/Week with source Shifts and publication require settings before wall-clock calculations. Current draft CSV/print returns 409 before export headers; published snapshots use the stored timezone, while a legacy snapshot without one is exported in UTC with an explicit warning. A fresh migrated disposable PostgreSQL schema passed **238/238** backend tests, including a directly inserted legacy Shift whose Calendar and Copy previews/commit rejected without changing Shift or period counts. The schema was cleaned. No migration was added; normal Hurstville Shift, period, publication and Availability digests are unchanged. Residual: a legacy store with existing data and no settings needs a supervised timezone reconciliation; the application does not infer its historical clock.

Read-only normal PostgreSQL confirmed Green Square has two Shifts and two published snapshots but no store settings; both snapshots have no frozen timezone. The current browser disables live export yet still offers the immutable #1/#2 snapshot exports. The backend renders those legacy exports in labelled UTC without modifying the snapshots. Counts after the browser pass remained two Shifts, seven Availability rows and two publications.

## 2026-10-21 no implicit Sydney in scheduling writes

`validateShiftAgainstSettings` now rejects missing `RosterStoreSettings` instead of validating a Shift as Sydney. The guard covers its service callers, including Day creation, editing, batch operations, copy and publication. `replaceAvailability` now requires a saved timezone before any new timed or UNKNOWN row; an empty replacement remains possible for legacy cleanup. The Script import guard from the previous checkpoint remains in place. Disposable PostgreSQL integration tests verified that missing-settings attempts left Shift, period and Availability counts at zero; all 235 backend tests passed. Normal Hurstville already has explicit Sydney settings and its Shift/Availability/publication digests were unchanged. Remaining read/export timezone fallbacks and legacy stores with data but no settings require a separate migration decision; no database migration was made here.

## 2026-10-21 current formal-job catalog recheck

Fresh read-only queries of local Evaluate and Roster confirm six active Hurstville formal definitions: 带训员 (`trainer`, one authorized employee), 莉小白 (`li-xiaobai`, zero), 前台 (`front-counter`, zero), 培训 (`training`, zero), 后厨 (`back-kitchen`, zero), and 全岗 (`full-role`, one). The four formerly missing definitions were added in an earlier authorized step; this check made no catalog or employee changes. Roster has corresponding scheduling-role definitions, including store-scoped `li-xiaobai` and `front-counter`. Its `qa-role` / 验收岗 remains inactive but referenced by eight historical DRAFT Shifts; `front` / 前场 and `water-bar` / 水吧 remain historical roles and are not automatically equated with the formal BHS jobs. Sections below that say Evaluate currently had only two jobs record **earlier snapshots**, before the authorized catalog addition.

## 2026-10-21 Script import timezone prerequisite

Script Preview and Commit formerly defaulted a store without `RosterStoreSettings` to `Australia/Sydney`. They now require an explicit saved timezone and return HTTP 409 otherwise. `RosterService.commitPresetTimeSlots` checks again inside the PostgreSQL transaction, so direct service calls cannot bypass the route guard. A disposable real PostgreSQL test verified zero Availability and import-audit writes after rejection. This does not establish timezone safety for all other Shift/Availability mutations; audit their remaining Sydney fallbacks separately. No schema migration or Evaluate data change was made.

## 2026-10-21 current read-only formal-job recheck

Guarded local reads reconfirmed Evaluate Hurstville's active formal jobs as `全岗/full-role` and `带训员/trainer`, with one employee assignment each. Roster `验收岗/qa-role` remains inactive with eight DRAFT Shift references and no PUBLISHED reference. `前场/front` has two DRAFT and one PUBLISHED reference; other historical global roles are still present. These historical rows were not deleted or rewritten. Calendar and Settings use Evaluate's current formal catalog for new role choices, and backend Shift mutations/publication require a verified association. BHS Hurstville's previously observed six Job Info entries do not yet have an authoritative Evaluate mapping. This is a master-data readiness gap, not permission to mint official positions or rewrite publication history.

## 2026-10-21 legacy Shift Role usage by publication state (read only)

`npx tsx backend/scripts/audit-legacy-role-usage.ts` was run against the guarded local `molly_roster` public schema. The script reads Role, Shift and Template references without writing either database. Counts are Shift records, not employee assignments. They explain why historical Role rows cannot simply be deleted while simplifying the Calendar's new-Shift choices.

| Roster Role | Scope / active | DRAFT | PUBLISHED | Store usage | Templates linked |
|---|---|---:|---:|---|---:|
| `qa-role` / 验收岗 | Hurstville / no | 8 | 0 | Hurstville 8 | 0 |
| `all-rounder` / 全岗 | global / yes | 1 | 0 | Green Square 1 | 0 |
| `back-kitchen` / 后厨 | global / yes | 0 | 0 | none | 0 |
| `front` / 前场 | global / yes | 2 | 1 | Green Square 1; Hurstville 2 | 0 |
| `trainer` / 带训 | global / yes | 1 | 0 | Hurstville 1 | 0 |
| `training` / 培训 | global / yes | 1 | 0 | Hurstville 1 | 0 |
| `water-bar` / 水吧 | global / yes | 1 | 0 | Hurstville 1 | 0 |

Current Evaluate Hurstville formal definitions remain only `full-role` / 全岗 and `trainer` / 带训员. The verified-role code path admits those two matches for new Hurstville scheduling; the other Roster Roles remain historical metadata, even if active in Roster. The one published `front` Shift and any published snapshot must be preserved. Inactive `qa-role` still has eight draft references to review. BHS's `前台` was not equated with Roster `前场`, and no formal qualification was inferred from a label. Focused frontend verified-role tests passed 3/3 and backend formal-role tests passed 2/2. No BHS, Evaluate or local business data changed in this recheck.

## 2026-10-21 current catalog recheck (read only)

The signed-in BHS Hurstville Job Info page was freshly observed: 带训员 (4 staff), 莉小白 (25), 前台 (0), 培训 (3), 后厨 (0), 全岗 (8). `node scripts/audit-evaluate-store-jobs.mjs` read the separate current Evaluate PostgreSQL database and returned only two active Hurstville formal Jobs: `full-role`/全岗 and `trainer`/带训员, one formal assignment each. `npx tsx scripts/audit-role-provenance.ts` read Roster PostgreSQL: Hurstville `qa-role`/验收岗 is **inactive** at version 2 and still has eight historical DRAFT Shifts; active global `front`, `water-bar`, `back-kitchen` and `training` are not current Evaluate formal Jobs. `all-rounder`/全岗 has the one existing scoped alias to `full-role`; `trainer` matches by code. BHS `前台` and Roster `前场` were **not** inferred equivalent. No database row was changed.

| Reference BHS Job | Evaluate Hurstville formal Job | Roster role status | Safe current action |
|---|---|---|---|
| 全岗 | `full-role` / 全岗 | `all-rounder` active, scoped approved alias | Available for new scheduling after current workforce validation |
| 带训员 | `trainer` / 带训员 | `trainer` active; display name `带训` overridden by formal name | Available for new scheduling after current workforce validation |
| 莉小白, 前台, 培训, 后厨 | No current formal Job definitions | Some similarly named or related historical roles exist | Do not grant formal eligibility or infer a code mapping |
| No BHS 验收岗 | No formal Job | Hurstville `qa-role` inactive; eight DRAFT Shifts retained | Historical draft review only; do not auto-delete/reassign |

## 2026-10-21 code-gated formal Job association

Frontend and backend now require the active Evaluate Job code to match the Roster role code, except the scoped existing `full-role`/全岗 ↔ `all-rounder`/全岗 compatibility alias. A shared name is insufficient. Paired disposable PostgreSQL/Chrome seeded Evaluate `official-front` and preserved Roster `qa-front`/QA Front with two draft and one published Shift. Settings required explicit association; old-role Shift creation returned 422. Guarded SQL verifier found all three Shift role references/versions, one publication and both period versions unchanged after the rejected write. Real PostgreSQL integration suite passed 29 files/217 tests in a separate disposable schema; both QA schemas were cleaned. No schema migration and no normal Evaluate/BHS data mutation.

## 2026-10-21 Hurstville default break, guarded local update

Read-only BHS Day Add showed Break Time 0 in both an initial 08:00–08:30 draft and an unsaved 08:00–10:00 edit; Cancel discarded it. The local `molly_roster` public schema Hurstville settings had default break 30, minimum Shift 60, opening 09:00 and closing 22:00 at version 1. `backend/scripts/align-hurstville-bhs-default-break.ts` checked the exact local target and settings baseline, wrote an exclusive backup at `docs/evidence/hurstville-bhs-default-break-before-2026-10-21.json`, then used versioned `updateMany` to set only default break 0 and version 2. The updater's first verification falsely failed because `updatedAt` is automatic. `backend/scripts/verify-hurstville-bhs-default-break.ts` read the backup and current DB and passed: every other stable setting unchanged, newer `updatedAt`, 13 Shifts before/after and 2 publications before/after. No migration or Evaluate/BHS write. Hurstville minimum duration and opening time were not changed; their BHS parity needs business confirmation.

## 2026-10-21 current formal-job divergence, read-only

Read-only local Evaluate PostgreSQL audit: Hurstville currently has only two active formal job definitions, `full-role`/全岗 and `trainer`/带训员, with one assignment each and one distinct active employee with a formal position across both stores. Green Square has the same two definitions with zero assignments. Signed-in BHS Hurstville Job Info shows six jobs: 带训员, 莉小白, 前台, 培训, 后厨, 全岗. These are two different catalogs; BHS labels alone do not grant an Evaluate formal position. A separate read-only Roster role audit found `qa-role`/验收岗 inactive at version 2 with eight historical draft Shifts still linked. No catalog, Shift, Evaluate, publication or BHS row was changed in this audit. Store pilot readiness still needs authoritative job definitions/employee assignments and an explicit decision on historical draft role repair.

## 2026-10-21 unsupported Hurstville QA role

`shift_roles.id=cmtq01x14000nivg0inbcx8yq` was still an active, store-scoped `qa-role`/`验收岗` at version 1, referenced by 8 historical draft Shifts and 0 templates. It is absent from the current Evaluate-confirmed Hurstville formal choices. The guarded local-public-schema script [deactivate-hurstville-qa-role.ts](../backend/scripts/deactivate-hurstville-qa-role.ts) wrote [the exact before-state backup](evidence/hurstville-legacy-qa-role-before-2026-10-21.json) and versioned compare-and-swap changed only `isActive=true→false`, version 1→2. Readback retained 8 linked Shifts, 15 linked assignments, Hurstville Shift count 13, publication count 2, Availability count 14 and import-audit count 0. Old Shift role references and snapshots remain intact; no Evaluate/BHS write or migration. Other global legacy roles remain active pending cross-store formal-job provenance review, so this is an exact-role cleanup, not a claim that the whole catalog is reconciled.

## 2026-10-21 Hurstville observed Shift presets

The local public Roster database already contained version-1 Hurstville Availability Script shortcuts AA 10:00–22:00, BB 10:00–17:00, CC 16:00–22:00, while its only Shift template was inactive `验收早班`. Signed-in BHS Hurstville Day Add showed AA/BB/CC Shift presets with 60/30/0-minute breaks, and unsaved AA application filled both time and break. `backend/scripts/add-hurstville-bhs-shift-presets.ts` guards the exact local database, existing shortcut values/version and inactive template baseline, writes [the exact pre-change backup](evidence/hurstville-bhs-shift-presets-before-2026-10-21.json) exclusively, then creates only those three active `shiftRoleId=null` time templates in one transaction. Readback found exact 10:00–22:00/60, 10:00–17:00/30 and 16:00–22:00/0, Shift count 13→13 and publication count 2→2. Existing Availability shortcuts, legacy `验收岗` role, historical templates and Evaluate data were unchanged. No Prisma migration. The templates are reversible via their three recorded IDs and backup, but deleting them would be a separate deliberate action.

## 2026-10-21 Green Square legacy QA template

Read-only public Roster PostgreSQL found `shift_templates.id=cmtpzzm9f000divg07fqgh76q`, Green Square `QA 早班`, 09:00–17:00, 30-minute break, null role, active/version 1. It was still offered by Calendar Add despite current Evaluate-confirmed formal jobs being 全岗 and 带训员. The guarded `backend/scripts/deactivate-greensquare-qa-template.ts` requires the exact local public database, ID/store/name/time/break/version and an absent role; it backs up the original row to [JSON](evidence/greensquare-legacy-qa-template-before-2026-10-21.json) with exclusive create, then versioned `updateMany` changes only `isActive=false, version=2`. Verification found Green Square Shifts 2→2 and publications 2→2; Hurstville's previously deactivated QA template was untouched. The row is recoverable. Normal local Chrome refreshed Day Add and no longer showed the QA template. No Prisma migration, Evaluate edit, BHS write or historical Shift/publication rewrite.

## 2026-10-21 overnight Script Import integrity

Name-first script shortcuts may now span midnight, with store-local end date calculated independently of a fixed 24-hour UTC offset. The parser and locked Commit require a positive interval ending by the next local date with at most 24 actual elapsed hours; invalid or ambiguous DST clocks block import. Preview and Commit inspect existing Availability through the next day and now query the next day's assigned Shifts when an imported window crosses midnight. A disposable real-PostgreSQL test verified Sunday→Monday conflict rejection before any row/audit write, then one SCRIPT row and one audit after removing the conflicting fixture Shift, followed by idempotent replay. No schema migration; Evaluate remains the employee authority and its independent-database race remains a residual risk.

## 2026-10-20 Availability Script reviewed-row identity

The script import's count-only concurrency check allowed an equal-count swap of CREATE and UNCHANGED rows after Preview. `slotStatusHash` now captures each proposed slot's canonical employee/date/UTC time/status and any reviewed existing row ID/version. The Preview hash binds it; Commit recomputes the slot statuses from locked current Roster rows and rejects a mismatch with HTTP 409 before `employeeAvailability.createMany` or `availabilityScriptImport.create`. A real disposable PostgreSQL regression first reproduced the silent swapped write, then passed after the fix; browser/API and guarded DB verification found no stale import audit or partial write. This changes the API contract but needs no schema migration. Evaluate remains a separate database, so its workforce can still change between its API read and the Roster transaction; that cross-system race remains documented.

## 2026-10-20 UNKNOWN template definition consistency

Availability template create/update previously allowed one day containing both a clockless `UNKNOWN` slot and timed slots, or multiple `UNKNOWN` slots. Staff application then discarded UNKNOWN, silently changing the meaning of the saved definition. The shared route schema now returns 400 for those shapes before a template write, while preserving a single UNKNOWN day and timed slots on different days. A red-green route test, isolated browser/API no-write check, and full 202-test backend suite verified the change. Existing stored contradictory templates are preserved; Staff blocks applying one and retains the current draft. No schema migration or Evaluate change.

## 2026-10-20 UNKNOWN Availability day integrity

The manual Availability service previously accepted one employee/date containing both `UNKNOWN` and timed rows, repeated `UNKNOWN` rows, or an `UNKNOWN` row with clock timestamps that it silently erased. Staff's established semantics use **no time slots** for Unknown. `replaceAvailability` now rejects those contradictory API inputs with 400 before starting its replace transaction; one clockless UNKNOWN row remains valid for existing clients. A red unit test, isolated PostgreSQL integration, all 201 backend tests, and authenticated Chromium/API validation confirmed existing row ID/version/content are unchanged after rejection. No schema migration or Evaluate change.

## 2026-10-20 DST elapsed-time Availability validation

`replaceAvailability` now accepts a next-local-date end clock later than the start clock when an Australian spring-forward transition makes the actual interval no longer than 24 hours. It still requires `startAt < endAt`, the start to match the row's store-local date, the end to fall on that date or the next, and actual elapsed time at most 86,400,000 ms. A real-PostgreSQL red-green test saved Sydney 2027-10-03 01:00 to next-day 01:30 (23.5 elapsed hours) and rejected the 24.5-hour alternative without altering the row. Current-source Chromium and direct isolated PostgreSQL verification matched the exact UTC instants. No schema or migration changed.

## 2026-10-20 reviewed import counts inside the locked transaction

The script Preview digest now covers its CREATE and UNCHANGED counts. Commit requires those counts and forwards them to `commitPresetTimeSlots`, which compares them with current Availability rows after store/employee locks and before any row or audit insertion. An identical row inserted by another administrator between Preview and Commit now yields 409 instead of silently changing the reviewed import outcome. The exact-source import replay branch retains its idempotent response. Red-green disposable PostgreSQL integration, full 197/197 backend tests and paired-schema browser/API QA passed. No migration or real-data change was needed. The final Evaluate read-to-Roster transaction interval remains a cross-database residual race.

## 2026-10-20 preview configuration version coverage

The Availability Script review hash now includes `AvailabilityScriptShortcuts.version` and `RosterStoreSettings.version` (or null), so a configuration edit after Preview returns 409 before entering the append transaction, even if the effective slots are unchanged. The transaction still compares the versions read at Commit after taking the store lock. The import audit's `sourceHash` remains content-based and does not change on unrelated configuration edits. Route regressions reproduced the former 200; full disposable PostgreSQL suite passed 196/196 and Chromium confirmed no additional rows or audit after a stale shortcut Commit. No schema migration or real-data change was needed.

## 2026-10-20 script preview and import identity

Availability Script now has two distinct digests. The reviewed preview fingerprint includes the current Evaluate Workforce Revision and resolved employee names; a change between Preview and Commit returns 409 before calling the import transaction. The stored `availability_script_imports.sourceHash` still represents the canonical store/week/timezone/slot content so an unrelated employee change does not create a new identity for a previously imported script. Within Roster, the append transaction still locks the store and employees, rechecks shortcut/settings versions and existing Availability, then writes rows and one audit atomically. Full isolated PostgreSQL suite passed 193/193 after this adapter change. Because Evaluate and Roster use independent databases, a change after the final Evaluate read remains an explicit residual race; there is no claimed cross-database transaction. No schema migration was needed.

## 2026-10-20 live Hurstville role/template readback

Read-only Evaluate `storeJobDefinition` returned active `全岗` and `带训员` for Hurstville. Read-only Roster audit found old `验收岗` role with 8 Shifts and `前场` role with 2 Shifts; these historical Shift/role records were not changed or mapped to new formal jobs. Roster's only Hurstville time preset was `验收早班` (09:00–17:00, no role, active, version 1). The exact row was backed up to `docs/evidence/hurstville-legacy-qa-template-before-2026-10-20.json`; a guarded version-1 compare-and-swap set only that template inactive/version 2. Reread confirmed Shift count unchanged at 13. The preset remains recoverable in the Templates history, while Calendar Add omits it. No migration or Evaluate application change occurred.

## 2026-10-17 draft role deactivation integrity

The follow-up race regressions confirm both writers use the store lock. Creation first commits and rejects deactivation with 409; deactivation first commits and rejects creation with 422 `INACTIVE_SHIFT_ROLE`. The losing operation leaves no partial write. Focused 7/7 and full backend 163/163 real-PostgreSQL tests passed on a cleaned disposable schema.

The role update route previously allowed `isActive=false` even when a DRAFT Shift still referenced the role. That could block later publication without an obvious recovery path. A real PostgreSQL red test reproduced the write. `updateRole` now checks for draft references inside the same store-locked transaction used by Shift creation and returns 409 without changing role version or Shift. Published snapshots remain historical records. Focused 5/5 and full backend 161/161 real-PostgreSQL tests passed; no schema migration or Evaluate change.

## 2026-10-17 local catalog recheck

Read-only local scripts reconfirmed Evaluate's active formal jobs in Hurstville and Green Square as `全岗` / `full-role` and `带训员` / `trainer`. Roster retains historical `验收岗` / `qa-role` (eight Hurstville DRAFT Shifts) and `前场` / `front` (three Shifts). The current Calendar loader calls `verifiedShiftRoles`, which returns only active Evaluate job matches for new Shift choices. Existing unsupported rows remain for historical/draft review; no data was rewritten. BHS Settings could not be compared because its live page asks for re-login.

## 2026-10-17 Copy Day/Week/Repeat current employee snapshots

The execution routes already fetched Evaluate's active store workforce, but their new Shift assignment rows copied name, employee type, employment type, official score, Tier and closed-round provenance from the source Shift. A source publication or old draft could therefore seed stale fields into a new DRAFT. Execution now passes current `AssignmentSnapshot` values from the Evaluate adapter into the Copy Day, Copy Period and Repeat transactions. New DRAFT role color snapshots use the current Roster role color instead of an older source Shift color. Missing employee snapshot data fails closed; the source Shift and immutable publication stay unchanged. Real-PostgreSQL tests exercise changed and cleared current scores, names, types, round IDs and role colors. Separate Evaluate and Roster databases still leave the documented post-read employee-change race. No database migration or Evaluate source change.

## 2026-10-17 disposable legacy publication integrity

Current-source paired PostgreSQL/browser fixture placed two DRAFT Shifts under a Roster-only `验收岗` while Evaluate had only `QA Front`. The authorized Publish route returned 422 `UNVERIFIED_SHIFT_ROLE`; readback found both Shift records, the DRAFT period/version and earlier publication unchanged. The normal Hurstville `验收岗` drafts were not remapped. The current BHS Settings list remains unreadable, so its actual mapping must not be inferred.

## 2026-10-17 live read-only role recheck

Create/activation interleaving follow-up: `RosterService.createRole` previously had no store lock or in-transaction formal-job mapping check. Even though the route rejected duplicates observed at preflight, a competing activation could commit before the insert. A red disposable PostgreSQL test reproduced a second active role after the old role was activated. Creation now shares the store lock with role activation and checks the current Roster role mapping under that lock against the forwarded Evaluate job catalog. The post-fix test returned 409 with zero new role rows and the prior role active. This does not make two independent databases a single transaction; an Evaluate catalog change after its read remains possible.

Follow-up: PATCH reactivation of an inactive store role also could replace an existing global role matched to the same Evaluate formal job. Route and transaction checks now reject this with 409. The transaction re-reads active/inactive store and global roles after the store lock, so concurrent reactivations cannot both acquire one formal job. A disposable real-PostgreSQL race test observed one success and one rejection with the rejected row's version unchanged. This does not alter historical Shift or publication snapshots.

Current Evaluate Hurstville active formal jobs remain 全岗 (`full-role`) and 带训员 (`trainer`), one assigned employee each. Current Roster `qa-role` / 验收岗 remains active and owns eight DRAFT Shifts; global `front` / 前场 owns three historical Shifts. These roles were not created or changed by this audit. Settings' current role list is limited to Evaluate matches, while the read-only legacy inventory exposes DRAFT usage. Mapping historical Shift Roles to formal jobs still needs a business-approved equivalence; current BHS Settings could not be read.

Duplicate-association audit found that POST `/roster/roles` previously accepted a new store role even when the same Evaluate job was already mapped to a global role. The store role would win mapping priority and leave older drafts under the global role unverified. The route now checks the full current mapping and rejects a second association with 409 before insertion; the Settings button also stays disabled for a manually re-entered linked job. Isolated Chromium plus API confirmed no role row change. Historical role rows and publication snapshots were not rewritten.

## 2026-10-17 read-only legacy draft-role usage

`RosterService.listDraftRoleUsage(storeId)` groups the selected store's DRAFT Shifts by Roster role and returns counts plus the earliest shift date. It reads no Evaluate tables, creates no roster rows, does not include assignments or employee identity, and leaves PUBLISHED Shift/publication snapshots untouched. Route access requires the authenticated store. Isolated real-PostgreSQL integration covered store isolation, inactive roles and exclusion of PUBLISHED Shifts; Settings compares the result with live Evaluate-verified role IDs. Normal Hurstville legacy mappings were not altered.

## 2026-10-17 normal-database role provenance

Read-only Prisma queries found Evaluate has active formal `全岗` (`full-role`) and `带训员` (`trainer`) jobs at both Green Square and Hurstville. Roster has historical active `验收岗` (`qa-role`) with eight Hurstville DRAFT Shifts and `前场` (`front`) with two Hurstville DRAFT Shifts plus one Green Square PUBLISHED Shift; neither is a current Evaluate formal job. Roster also retains global `水吧`, `后厨` and `培训` roles, while `全岗` and code-matched `带训` correspond to current formal jobs. No database row was changed. Current seed no longer inserts default roles, and verified-role matching excludes unmatched roles from new scheduling choices. Existing PUBLISHED snapshots must remain stable; historical DRAFTs require deliberate reassignment to an authorized formal job before normal mutation or publication.

## 2026-10-17 replay validation order

The existing `shift_create_requests` ledger is read before new-create role/settings validation. A previously committed, account/store/payload-matching ID returns its one saved Shift without another period increment or Evaluate mutation. Unknown IDs still pass all current employee, formal-job, availability, conflict and period checks before the atomic insert. The transaction repeats the ledger check under the store lock to handle concurrent first attempts. An integration red-green case retired the local role after the first commit; exact replay succeeded after the fix. No schema or migration change in this follow-up.

## 2026-10-17 durable create ledger migration

Additive migration `20261017010000_shift_create_request_ledger` creates Roster table `shift_create_requests` with UUID primary key, unique Shift ID, store/account, SHA-256 payload hash and creation time. It deliberately has no foreign key to `shifts`: request history must survive a Shift delete. The create-with-period transaction inserts both records and increments the period once. Replayed same request returns the current saved Shift; mismatched owner/content or deleted Shift returns 409 without insert. Existing callers without `clientShiftId` retain the prior path. Local public-schema migration was deployed after a validated pg_dump backup at `%TEMP%/molly-roster-pre-shift-ledger-20261017-0042.dump`; Prisma reports 7/7 applied, with 15 existing Shifts and zero ledger rows after deployment. Evaluate database unchanged.

## 2026-10-16 formal-role alias selection

No schema migration or data rewrite was made. Existing global and store-specific Shift Role rows, Shift snapshots, templates and publication snapshots remain intact. Backend writes now use a unique current Evaluate-job-to-Roster-role selection: an active store-specific role shadows an active global role with the same formal job code. Hidden aliases are excluded from write allowlists for direct Shifts, templates, Copy, Publish and Batch; historical rows remain readable and require explicit role repair before another write. The independent Evaluate read and Roster transaction still leave a cross-database workforce/job change window, as documented elsewhere in this audit.

Read-only queries of the current Hurstville databases found two active Evaluate formal jobs (`全岗` / `full-role`, `带训员` / `trainer`) and one matching Roster global role for each. No duplicate store/global alias currently shadows those two roles. A store-local `验收岗` / `qa-role` still owns eight DRAFT Shifts but has no current Evaluate formal-job match. The rows were not deleted or rewritten; they must be reviewed and explicitly reassigned to a real formal job before publication.

## Legacy Shift Role provenance (2026-10-16)

Read-only `backend/scripts/audit-role-provenance.ts` found active Roster roles that do not reflect the current Evaluate Hurstville formal job list. The store-local `qa-role` / `验收岗` is referenced by eight DRAFT Shifts; global `front` / `前场` is referenced by three, `all-rounder` / `全岗` by one, `water-bar` / `水吧` by one, `training` / `培训` by one, and `trainer` / `带训` by one. The separate read-only Evaluate audit found active Hurstville formal jobs `full-role` / `全岗` and `trainer` / `带训员`. This explains why invented jobs appeared: the old Roster seed inserted a global scheduling-role list independently of Evaluate. The seed is now a no-op; UI choices and key write paths use Evaluate's active store jobs. Existing Shift/role rows were not deleted or rewritten, preserving drafts and published snapshots for review. No migration was made. Current matching uses the formal Job code, with only the scoped `full-role`/全岗 → `all-rounder`/全岗 legacy alias. Historical unmatched roles need explicit review; matching display names alone do not authorize them.

## Legacy publication timezone audit (2026-10-16)

The local public database has four publication snapshots without `snapshot.timezone`, across two stores. One affected store has no current settings; at least one publication predates current settings creation/update. Current settings therefore cannot prove the original publication timezone. The read-only `backend/scripts/audit-publication-timezone-snapshots.ts` reports aggregate counts without employee data. No public snapshot was rewritten. Historical detail/CSV/print now identify the missing provenance and show UTC instants with UTC dates. A source-backed recovery process remains necessary if original store-local wall times are required. The immutable snapshot format for new publications already includes timezone. No migration was made.

## 2026-10-16 stable-ID deletion reconciliation

The prior browser reconciliation inferred a deleted Shift from its absence on the old date. A concurrent versioned move could leave the same ID alive on another date. A store-scoped read now checks the Shift ID directly; only an authoritative 404 is treated as absent. Route and service tests cover scope and 404 behavior. In disposable PostgreSQL, a concurrent fixture moved the Shift and incremented its version before DELETE returned a deliberately hidden 409. Browser GET found version 2 on the target date; direct DB verification found no unintended deletion and one unchanged publication. This is a read-path correction; no migration or Evaluate schema change. The production Roster database was not modified by QA.

## 2026-10-16 current PostgreSQL gate

An empty disposable `codex_roster_backend_test_*` schema on local PostgreSQL 5433 received all six current Prisma migrations. `RUN_DATABASE_TESTS=1` passed 22 files/135 tests with one worker. Prisma validation and migration status passed on the disposable schema, and a read-only normal `public` schema status check found all six migrations applied. Transaction review confirmed Copy Day/Week, Repeat and Publish commits use PostgreSQL transactions with store-period locks and version/eligibility checks. Evaluate workforce is fetched before those Roster transactions; the cross-database state-change window remains an explicit residual risk. The disposable schema was dropped by a name- and URL-guarded cleanup script; no normal-data mutation was performed.

The initial audit paragraph below records the four-migration baseline from 2026-10-09; the current count is six.

Local `molly_roster.public` on PostgreSQL port 5433 reports all four Prisma migrations applied; `prisma validate` passed. Existing schema models periods, shifts, assignments, roles, availability, templates, settings and immutable publication records. Shift assignment has a unique `(shiftId, employeeId)` key; publication has unique `(rosterPeriodId, periodVersion)`.

Service code uses store-period advisory locking, version checks and transactions for critical mutations. Reposition checks shift version, draft status, current active employee IDs, time range and assignment constraints before saving. Publication reads and freezes snapshots in a locked transaction. Copy Day uses preview versions and all-or-nothing execution.

No migration was added in this pass. The current development catalog and production target are separate: this check does not establish staging or production drift. The Evaluate and Roster databases cannot share an atomic transaction; current workforce revision checks reduce, but cannot eliminate, the race after the last Evaluate read.

Publication now bulk reads Availability for the period plus the following date inside its store-locked transaction, then checks every assignment against the complete shift interval. It locks assigned employee IDs in stable order, bulk reads their shifts in other periods/stores, and scans for both external and same-period overlaps before updating the period or writing a snapshot. A migrated isolated PostgreSQL regression confirmed missing Availability and directly inserted same-store/cross-store overlapping shifts leave the period DRAFT at the same version with zero publication records. Repairing the data permits publication. A separate valid synthetic 500-employee/5,000-shift/2,500-Availability service test published a complete snapshot in 1,283 ms locally with the final checks. Direct database writers that bypass these locks and the cross-database Evaluate post-read race remain residual risks. No schema migration was required.

## Calendar overnight query boundary — 2026-10-10

The prior `calendar` read filtered `Shift.date` strictly to the requested range, so a prior-day overnight shift disappeared from a next-day or next-week query. The read now examines the immediately preceding start date (writes permit at most a next-day end), compares `endAt` with the requested start at store-local midnight, and returns the source period metadata only when a carryover shift needs it. This is a read-path change with no migration or data rewrite. A PostgreSQL integration regression covers both next-day and adjacent-week reads; backend database-enabled suite passed 103/103. The frontend explicitly chooses the period covering the visible start date, so an added source period cannot silently replace the current period summary.

## Copy Week transaction capacity — 2026-10-10

The initial 5,000-shift `copyPeriod` attempt exceeded Prisma's five-second interactive transaction timeout during sequential nested shift writes and rolled back the target. The validated plan is now inserted as 500-row `Shift.createMany` and `ShiftAssignment.createMany` batches in one bounded 30-second transaction, after store and employee locks, target-period and source-version checks, target Availability and conflict checks. A subsequent local run created 5,000 shifts and 5,000 assignments in a DRAFT target in 1,761 ms while retaining the PUBLISHED source and its one immutable publication. The backend still cannot atomically lock Evaluate's separate database; the existing workforce revision and write-time checks remain the cross-system boundary. No migration was added.

## Copy Day transaction capacity — 2026-10-10

The same guarded fixture used 1,000 Monday shifts across 500 employees. Before optimization, preview took one 4,879 ms run; execution exceeded the default five-second Prisma transaction window and rolled back with no target period. Copy Day now bulk reads employee Availability and existing overlaps, validates each candidate against those rows and its own batch, then writes validated shifts/assignments in 500-row batches in one 30-second transaction. One subsequent local preview took 99 ms and execution took 753 ms. Direct counts confirmed 1,000 target shifts/assignments with a DRAFT period and an unchanged PUBLISHED source. A 42-target Repeat Shift completed under the existing transaction in 705 ms. No schema migration or Evaluate application change was made.


## 2026-10-14 store-local export formatting

CSV and printable roster routes previously formatted UTC shift timestamps with a fixed Australia/Sydney timezone. For an Adelaide shift crossing midnight this could show the wrong start clock time and omit or misplace the next-day marker. Both routes now read Roster's persisted store timezone after authorization and use it for start time, end time and end-date comparison. A route regression uses 2026-10-05T13:00Z–16:00Z and asserts Adelaide 23:30–02:30 next day in both formats. Current store settings cannot change once roster shifts or Availability exist (`STORE_TIMEZONE_LOCKED`); a legacy publication made before that guard may lack a frozen timezone and remains a historical-format caveat. No migration was made.

## 2026-10-14 publication timezone snapshot

New publication revisions now record the Roster store timezone in their immutable JSON snapshot during the store-locked publication transaction. CSV and print for a selected publication use that frozen timezone ahead of live settings. A PostgreSQL regression published Adelaide revision #1, changed only the disposable fixture's settings directly to Sydney, then published revision #2; each revision and `exportPublication` retained its respective timezone. A route regression verified that both historical CSV and print continue to render Adelaide overnight time when live settings show Sydney. Older publications without the field fall back to current settings; their original timezone cannot be reconstructed automatically. No migration or Evaluate database change.

## 2026-10-15 Atomic row/date move

The versioned reposition route now accepts a paired source/target employee ID for a single-assignment move. It first scopes and validates the target against Evaluate's current authorized store workforce, then passes its snapshot to Roster. One Roster transaction locks both employees, validates target Availability and all-store overlap, and atomically updates the Shift date/period/time and assignment. The source may be a former employee when being repaired; the target must be current and active. Wrong source, published period, stale version, multi-assignment date move, unavailable target and conflicts fail without partial write. PostgreSQL integration and local Chrome plus direct DB checks passed. Separate Evaluate/Roster databases still have a post-read workforce race; no distributed transaction or new authoritative employee table was introduced. No schema migration.
2026-10-15 Month blank-create follow-up: no schema or backend mutation path changed. Month creation uses the existing versioned create service and current Evaluate/Availability checks. In the disposable QA schema, direct PostgreSQL found exactly one new HandoverEmployee006 shift/assignment, DRAFT version 2 and untouched PUBLISHED version 1 after save/reload/edit/navigation/published-click checks. This is local fixture evidence, not target database acceptance.

2026-10-15 invalid row drop: the frontend now suppresses a request for a locally known overlap. The existing server checks remain unchanged. A guarded direct read after an isolated browser drag from Bob to an overlapping HandoverEmployee006 shift found four shifts, source/target assignments and Shift versions 1, DRAFT version 1 and PUBLISHED version 1. No migration or Evaluate database change.

2026-10-15 overnight-template follow-up: no schema or service rule changed. In a disposable 18:00–03:00 store, the existing create path saved one Cindy shift from a 22:00–02:00 template. Direct PostgreSQL confirmed source date 2026-10-09, UTC 2026-10-09T11:00Z–15:00Z, one canonical assignment, DRAFT version 2 and unchanged PUBLISHED version 1. The next-day Calendar read displayed its carryover. The exact schemas/account/services were cleaned.
2026-10-15: `EmployeeAvailability.startAt/endAt` already store UTC instants, so overnight Staff support needed no migration. `replaceAvailability` now compares new timed intervals against each other and retained neighboring-date rows inside the existing transaction and employee advisory lock, before deletion. Real PostgreSQL confirms rejected overlap is atomic and adjacent intervals succeed. The row key remains the store-local start date. `AvailabilityTemplate.slots` JSON carries optional `endNextDay`; old templates default to same-day.

Direct API writes now enforce the same Staff next-day/24 wall-clock-hour bound with structured `INVALID_AVAILABILITY_RANGE`. The database integration test attempts a two-day interval, an overlong next-day interval and Sydney's fall-back repeated-hour interval with a wall-clock end before its start; none inserts a row. This prevents Staff from later truncating a stored interval it cannot represent.

## 2026-10-15 cross-midnight coverage
Availability rows are keyed to their local start date, while a Shift is keyed to its own local start date. A previous-day AVAILABLE row can therefore cover a next-day 00:00-02:00 Shift. Roster service now fetches D-1..D+1 for Shift validation, previous-to-next windows for Copy Day/Week, and periodStart-1..periodEnd+1 for Publish. replaceAvailability validates Shifts starting one day before or after a changed row and runs in one PostgreSQL transaction. An isolated regression proved prior-day row deletion returns EMPLOYEE_UNAVAILABLE without deleting it. Four existing migrations remain current; none added.
## 2026-10-15 overnight operating hours
For an 18:00-03:00 setting, backend validation now accepts a Shift starting 00:00-02:00 on its own local date when the end remains at or before 03:00; it rejects 03:00-04:00 and still requires the Shift date to equal the local start date. Isolated PostgreSQL create, Copy Day and Publish regression passed; no schema migration.

## 2026-10-15 unset-settings structural invariant
When a store has no settings row, Shift writes now still require the roster date to match the Australia/Sydney local start date, an end no later than the next local date, and elapsed duration no longer than 24 hours. This uses the existing backend default timezone. Previously a wrong-date Shift could commit, making Calendar date lookup inconsistent. Configured minimum duration and opening/closing checks remain conditional on an explicit settings row; no new default operating policy was introduced. Isolated PostgreSQL reproduced the bug before the fix and accepted the corrected 5/5 focused and 115/115 full backend tests. No schema migration.

## 2026-10-15 deactivated role on copied Shifts
Existing source Shifts retain role snapshots for history. Copy Day, Repeat Shift and Copy Week now verify the linked Shift Role remains active and scoped to the current store before creating new Shifts. Day/Repeat use the same preview/execute inspection; Week rechecks within its write transaction. A disposable PostgreSQL test verified rejection without target rows or period, and no migration was required.

## 2026-10-15 role/settings transaction synchronization
Role deactivation now uses the same per-store PostgreSQL advisory transaction lock as Shift mutation and Copy. Shift create/update/with-period and batch role updates re-read active role under that lock; create/update recheck current store hours and timezone before commit, and snapshots use the current role name/color. A disposable integration test forced role deactivation and store-hours changes after create preflight but before lock acquisition. Both attempted creates failed without Shift or period-version changes; role edit waited for the store lock. No schema migration. An existing historical-publication test permits republishing a reopened inactive-role Shift; that policy remains unchanged pending a business decision.

## 2026-10-15 inactive role on reposition

A draft Shift whose role had become inactive could still pass `repositionShift` even though normal Edit and Copy rejected that role. Disposable PostgreSQL reproduced an actual date-plus-employee write before the fix. Reposition now rechecks the current active, store-scoped role inside the per-store advisory-lock transaction and updates accepted draft role name/color snapshots from that row. The regression confirms rejection leaves Shift/period versions and assignment unchanged, while reactivation permits one move with current snapshots. No migration or Evaluate database change. Reopening and republishing an existing inactive-role Shift remains governed by the existing separate publication policy.

## 2026-10-15 Batch Update current-state validation

Batch Update previously used Evaluate's active employee IDs but did not revalidate those employees' Roster Availability. A Shift with a directly removed Availability row could therefore receive a new role or note, contrary to Create/Edit/Publish. The store-locked batch transaction now fetches all selected employees' relevant D-1/D/D+1 Availability rows in one query and rejects any uncovered assignment before the first update. It also rejects unchanged inactive/out-of-store source roles when no replacement role is selected; replacing with a current active role remains a repair path. PostgreSQL red-green confirmed atomic rejection and a valid note/role update after coverage was restored. No schema or Evaluate change.
## 2026-10-15 Publish versus changed settings

`publishPeriod` previously validated current employees, Availability and conflicts but did not recheck current store hours or minimum Shift duration. A draft could become invalid after `saveSettings` and still publish. The store-locked publication transaction now validates every Shift with the same settings rule used by Create/Edit/Move before status and snapshot writes. Isolated PostgreSQL proved duration and hours refusals leave the period and publication table unchanged; valid settings permit publication. No migration or cross-database write.
## 2026-10-15 Batch Update versus changed settings

After a settings change, Batch Update could still update an existing draft Shift that no longer met store hours or minimum duration, while Publish now rejected it. `batchUpdate` now reads current settings and validates every selected Shift under the store lock before writing any row. Isolated PostgreSQL red-green verifies too-short and out-of-hours refusals leave Shift and period versions unchanged; valid settings restore normal batch writes. No migration or Evaluate change.
## 2026-10-15 Shift/period store integrity migration

Original `Shift.rosterPeriodId` referenced only `RosterPeriod.id`; a direct or legacy write could attach a foreign-store Shift to a period, and Publish copied it into the period owner's immutable snapshot. Disposable PostgreSQL reproduced this. Migration `20261015160000_enforce_shift_period_store` adds unique `(id, storeId)` on `roster_periods`, validates a compound `(rosterPeriodId, storeId)` foreign key on `shifts`, then drops the old FK inside one SQL transaction. It does not rewrite Shift rows. The dirty fixture failed validation and rolled back; clean fixture migrated 5/5 and cross-store insert returned P2003. A separate service gate rejects out-of-period `Shift.date`, which cannot be enforced by this FK. Local public preflight was 14 Shifts, wrongStore=0, outsidePeriod=0; a checked pg_dump backup was retained in `%TEMP%/molly-roster-public-before-shift-fk-20261015.dump`. Local public deploy succeeded, status 5/5, postflight 14/0/0 and `compoundStoreForeignKey=true`. Target environment migration/data state remains unverified.
## 2026-10-15 Copy Day/Repeat source date integrity

The compound FK enforces Shift/period store equality but cannot enforce `Shift.date` inside the linked period. `inspectDayCopy` previously found a source Shift by store/date and paired it with the period covering that date, even when its actual `rosterPeriodId` pointed elsewhere. That yielded an incorrect source version and an apparently valid Copy Day/Repeat preview. The shared inspection now includes the linked period and rejects missing/different source-period identity or out-of-period dates with SHIFT_PERIOD_MISMATCH before creating any copy plan. PostgreSQL red-green verifies Copy Day and Repeat preflight/commit refusal and no target period. No new migration.

## 2026-10-15 Batch Update linked-period guard

A legacy Shift can have a date outside its linked period because the compound store FK enforces store ownership but cannot check date containment. Batch Update does not change date or period and previously could mutate such a Shift, preserving corruption and incrementing versions. It now checks every selected Shift against its linked period within the store-locked transaction, before writing, and returns SHIFT_PERIOD_MISMATCH (409). Isolated PostgreSQL red-green proves no Shift/period version or note change, and full backend 120/120 passed. No migration or Evaluate edit.

## 2026-10-15 nonexistent calendar date guard

The shared `dateString` parser previously checked only text shape. JavaScript could normalize 2026-02-30 into March, so date-based Roster reads and writes could target a different day. The parser and direct `dateOnly` helper now require an exact Gregorian round trip; Repeat Shift target validation uses the same predicate. Isolated PostgreSQL Copy Day regression verifies invalid targets leave period/Shift counts unchanged. No schema migration was required.
## 2026-10-15 malformed source-period length

`createPeriod` already requires exactly 7 days for WEEK and 14 for FORTNIGHT. Copy Week and Publish previously trusted that historical invariant. A directly inserted one-day WEEK with a valid Shift was previewed as copyable in isolated PostgreSQL. Preview now reports INVALID_TIME_RANGE with zero ready shifts; copy and publish recheck within their transactions and return 409. Browser/API and guarded PostgreSQL confirmed no target period, source version change or publication. No database migration or Evaluate change.
## 2026-10-15 configured week boundary

Automatic Shift creation and reposition had accepted any seven-day target dates when opening a new period. The transaction now validates the start weekday against current store settings before a new period is written. A rejected request leaves the Shift, assignments, period count and versions unchanged; verified on a migrated disposable PostgreSQL schema and through the authenticated browser API. No schema migration. FORTNIGHT anchoring remains unresolved: current Settings permits FORTNIGHT, but automatic Calendar and copy paths still open WEEK periods. Do not treat this setting as production-ready until a fixed 14-day anchor and all writers are reconciled.

## 2026-10-15 Copy Day/Repeat malformed-period guard

A pre-existing malformed one-day WEEK could pass the shared Copy Day/Repeat preview even though Copy Week and Publish rejected it. `inspectDayCopy` now checks source and target period duration against the cycle type. Its preview blocks all copied Shifts, and both atomic commits reject with 409 before any write. Disposable PostgreSQL regressions cover malformed source and target, with Shift count and period version stable. No schema migration or Evaluate database change.

## 2026-10-15 malformed-period Shift write barrier

Direct Shift creation previously accepted a one-day WEEK target and committed a Shift. Explicit create, auto-period create, edit and reposition now validate destination period length against its WEEK/FORTNIGHT type. The explicit create path rechecks inside its store-locked transaction. A malformed source can still be moved to a valid destination for repair; deletion remains available. Disposable PostgreSQL regression and authenticated Chromium API checks proved rejected destination writes leave Shift and period versions unchanged. No migration.

## 2026-10-15 malformed-period batch mutation

Batch Update previously changed notes and versions on a malformed one-day WEEK despite single-Shift edit and Publish rejection. It now validates every selected period shape under the store transaction lock before any update. Disposable PostgreSQL checks cover one malformed Shift and a mixed valid/malformed batch with no partial write. Batch Delete stays available for repair. No migration.

## 2026-10-15 Copy Week target weekday integrity

The Copy Week API previously accepted a target start date outside configured `weekStartsOn` even though Calendar's automatic period creation rejected that boundary. Preview and the store-locked commit now use the same configured-weekday predicate. A misaligned target produces `INVALID_TIME_RANGE`, preview ready Shifts 0 and commit HTTP 400 before target creation. A Monday-aligned control remains free of that boundary issue. Red-green and full 130/130 backend tests used a migrated disposable PostgreSQL schema; authenticated browser-session API plus direct PostgreSQL confirmed zero target periods and stable prior publication. Existing FORTNIGHT start weekday is checked, but its 14-day anchor remains unresolved. No migration.

### Explicit period creation follows configured week start

The direct `POST /roster/periods` path was another bypass: a valid-length WEEK could start on the wrong weekday after store Settings chose Monday. Red isolated PostgreSQL proved creation; `createPeriod` now checks the configured weekday inside its store-locked transaction before any write. The expanded authenticated Chromium/API verifier got HTTP 400 `INVALID_TIME_RANGE`; direct PostgreSQL confirmed zero wrong-weekday periods and unchanged existing versions/publication. No schema migration.

## 2026-10-15 unsaved Settings weekday default

Frontend week calculation and Prisma Settings default both use Monday, but the shared backend boundary helper used to allow any weekday when the Settings row was absent. A red isolated PostgreSQL test proved Tuesday `createPeriod` succeeded for a newly configured store. The helper now defaults to weekday 1. This affects direct/automatic period creation, reposition into a new period and Copy Week preview/commit consistently. Authenticated Chromium first confirmed no Settings row, then received HTTP 400 for Tuesday creation; after saving Monday Settings, the Copy Week rejection remained. Direct PostgreSQL showed no new period or publication change. No migration.

## 2026-10-15 FORTNIGHT anchor migration and integrity

Migration `20261015170000_fortnight_anchor_date` adds nullable VARCHAR(10) `roster_store_settings.fortnightAnchorDate`; no existing row is rewritten. Settings save requires a valid date aligned to the store's week start for FORTNIGHT and rejects re-anchoring incompatible existing FORTNIGHT periods. Explicit period create and all implicit period writers validate/use the same 14-day phase; Copy Period preserves the source cycle, and Copy Day/Repeat use the store's selected cycle when a new period is needed. Existing target periods remain authoritative. The migrated disposable PostgreSQL test covered Create, Copy Day, Repeat, Move, Publish and Copy Period in one chain, with no WEEK period created. Browser/database evidence is recorded in `ROSTER_BROWSER_QA.md`. A verified pg_dump backup preceded additive migration deploy to the local public Roster database; Prisma migration status is current. Evaluate database untouched.

## 2026-10-15 cross-store employee race

Roster's employee advisory lock hashes canonical employee ID without store ID. A new isolated real-PostgreSQL integration test simultaneously submitted overlapping creates in two store transactions for that ID. One commit succeeded and the other returned CROSS_STORE_CONFLICT; only one DRAFT period/version 2, one Shift and one assignment remained. This is an integrity defense if stale or inconsistent cross-store workforce inputs reach Roster. It does not create a distributed transaction with Evaluate or eliminate changes after the last workforce read. No schema migration or production service edit was required.

## 2026-10-15 republish role validation

`publishPeriod` previously allowed a reopened draft to be published again after its referenced Shift Role was deactivated. An isolated PostgreSQL red test observed a second publication. The publish transaction now checks each Shift's current role `isActive` and store scope before changing period status or creating a snapshot. A failed publish returns `INACTIVE_SHIFT_ROLE`, leaves the DRAFT version and Shift versions intact, and retains the original immutable publication. The complete real-PostgreSQL backend suite passed 133/133. No schema migration or Evaluate write.

## 2026-10-15 fall-back Availability elapsed-duration bound

`replaceAvailability` enforced a next-local-day clock comparison but omitted an elapsed-time check. On Sydney's 5 April 2026 fall-back, first 02:30 to next-day 02:30 is 25 actual hours and previously committed despite the stated 24-hour limit. A red isolated PostgreSQL integration assertion observed the write; the store-locked transaction now rejects `endAt - startAt > 86,400,000 ms` with `INVALID_AVAILABILITY_RANGE` before replacing any row. The existing same-day repeated-clock refusal remains in place because Staff cannot round-trip that ambiguous input. Full backend real-PostgreSQL suite passed 133/133. No schema migration or Evaluate write.

## 2026-10-15 repeated-hour Availability round-trip

Staff now preserves which occurrence of an ambiguous local clock the UTC instant represents. Accordingly, `replaceAvailability` accepts same-day local end clocks equal to or earlier than local start clocks when the submitted UTC interval has positive duration. It still checks start store-local date, next-day shape, actual duration at most 24 hours, cross-row overlap and assigned-Shift coverage before the transactional replacement. Isolated PostgreSQL stored first 02:30 UTC+11 to second 02:30 UTC+10 as exactly one hour and retained three unrelated Shifts and one publication. Real-PostgreSQL suite passed 133/133; no migration or Evaluate write.

## 2026-10-15 Availability optimistic concurrency

The HTTP replacement request now carries `expectedRows: [{ id, version }]` for every current row in its requested employee/date range. The service compares this set with PostgreSQL rows after store and employee locks, before destructive replacement. A mismatch returns 409 `STALE_VERSION` and leaves all rows unchanged. This catches two editors who both saw an empty day as well as edits to existing rows, including deleted/recreated IDs. Existing internal service tests may omit the optional field; the public HTTP route requires it, so older HTTP callers need updating. Generated-ADMIN two-session browser and direct PostgreSQL checks passed; no migration or Evaluate write.
# 2026-10-16 legacy-role mutation addendum

Direct Shift reposition and note/break-only Batch Update now require the current Evaluate formal-job allowlist at the route boundary. The service checks it inside the Roster transaction before changing a Shift. A legacy role may be repaired by a Batch Update that explicitly selects a verified replacement role. An invalid role or unavailable Evaluate catalog prevents mutation; existing historical drafts and immutable publication snapshots are preserved. A disposable paired-database run observed 422 for legacy reposition and note-only batch change and identical Shift fields after both rejections. No schema migration was required.

## 2026-10-21 local QA availability templates

The `availability_templates` table contained two active QA-named reusable templates, with exact pre-change images in `docs/evidence/legacy-qa-availability-templates-before-2026-10-21.json`. This table has no employee Availability or Shift relation; applying a template copies slots into a draft. The guarded local-only script `backend/scripts/deactivate-legacy-qa-availability-templates.ts` marked Green Square `QA 标准全天` (version 1→2) and Hurstville `验收标准全天` (version 3→4) inactive in one transaction. Both rows and their seven slots remain recoverable. Before/after counts remained 15 Shifts, 21 employee Availability, 4 publications; import audits remained 0 after a cancelled browser preview. Evaluate and BHS databases were not touched.

