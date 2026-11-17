# Molly Roster Audit Remediation Report

日期：2026-09-28  
范围：关闭既有 audit findings；未扩展 Payroll、Timesheet、Leave、Notification、AI 排班或新权限角色。

## 1. Audit finding status table

| Finding | Severity | Status | Verification |
|---|---:|---|---|
| AVAIL-01 multi-slot loss | P1 | **VERIFIED** | unit/service tests + mobile browser save/reload/template round-trip |
| HIST-01 unreadable publication snapshot | P1 | **VERIFIED** | real PostgreSQL #1/#2 invariance + API/UI/export |
| DEPLOY-01 no Git baseline | P1 | **VERIFIED** | secret-safe baseline and remediation checkpoints |
| QA-01 evaluator acceptance | P1 | **OPEN** | waiting for user to manually establish a legal STORE_EVALUATOR session |
| CONC-01 overlapping period race | P2 | **VERIFIED** | DB exclusion constraint + real concurrent PostgreSQL test |
| START-01 false-ready | P2 | **VERIFIED** | four-part readiness gate + live 200/healthy check |
| CAL-READ-01 Month hides employee | P2 | **VERIFIED** | desktop/mobile card measurements and visible employee/time |
| RESP-01 mobile Settings clipping | P2 | **VERIFIED** | 390/1366/1920 browser width checks |
| STATE-01 stale Calendar request | P2 | **VERIFIED** | sequence guard + rapid view/date/store runtime test |
| FEEDBACK-01 role double-submit | P2 | **VERIFIED** | one POST/PATCH under real double-click |
| PERF-01 Staff scale | P2 | **VERIFIED** | employee-scoped availability + 500-person browser fixture |
| DRAG-QA-01 pointer gap | P3 | **VERIFIED** | real 09:00→10:00 drag, cancel no-write, isolated save |
| TOOL-01 Prisma config warning | P3 | **OPEN / non-blocking** | dependency-maintenance item; no major upgrade performed |

## 2. Availability fix

The frontend state is now `date -> slots[]`, implemented in `src/lib/availability.ts` and rendered by `src/components/staff/AvailabilityEditor.tsx`. A day can contain zero, one, two, three or more rows; each row can be added or removed independently. Staff fetches availability only for the selected employee.

Save sends all slots plus explicit affected dates, allowing zero-slot days to clear correctly. Backend replacement takes an employee-scoped advisory lock, validates time order and rejects same-day overlap inside its transaction. Adjacent rows such as 09:00–13:00 and 13:00–17:00 remain legal.

The shift picker now evaluates all rows for an employee/date. A shift inside the first or second available slot is accepted; a shift between slots is warned; an UNAVAILABLE overlap takes precedence.

Browser verification used 09:00–13:00 and 17:00–22:00 on mobile. Save, reload, template save and template apply all retained both rows. Overlap 09:00–14:00 plus 13:00–17:00 displayed a conflict and disabled Save. Exact test rows were removed after verification.

## 3. Publication history

Every publish now creates an immutable schema-v1 snapshot containing store, period, publisher, shifts, assignments, employee names/types, role names/colours, times, break, public note and the manager-only snapshot fields. Legacy snapshot normalization keeps the four existing revisions readable.

Added APIs:

- `GET /api/roster/periods/:periodId/publications?storeId=...`
- `GET /api/roster/publications/:publicationId?storeId=...&audience=employee|manager`
- Existing CSV/print endpoints now accept exactly one of `periodId` or `publicationId`.

The Export page offers current live data or a selected published revision, lists revision time/publisher/shift count/assignment count/hours, and opens a read-only revision view. Employee audience strips score, tier, internal notes and round metadata. Manager audience remains ADMIN-only.

The real PostgreSQL test publishes #1, mutates employee/role/colour/store/shift live data, then publishes #2. Revision #1 remains unchanged and exports its original bytes/content; #2 contains the new values. Cross-store lookup does not expose the snapshot.

## 4. Git baseline

Before committing, `.gitignore` and the repository were scanned for `.env`, credentials, database URLs/passwords, tokens, logs, builds, `node_modules` and reference screenshots. The Docker password is now required from the environment and the backend env example contains no credential-bearing DB URL.

Checkpoints:

- `a77d6c1 chore: establish audited Molly Roster baseline`
- `783cbbc fix: close roster audit integrity findings`
- final documentation/verification checkpoint recorded after this report

No remote push was performed.

## 5. Evaluator acceptance

**Pending user-assisted login.** The previous evaluator credentials return 401, and no password has been requested in chat. The browser will be left on the Molly Roster login page so the user can manually sign in with a legal STORE_EVALUATOR account.

After login, the remaining acceptance matrix is:

- own-store Calendar, Staff, Availability, role list, shift view and employee picker;
- official CLOSED score, Tier and skill summary;
- employee-safe export subset;
- direct other-store URLs and API resources return 403 or a safe redirect;
- DevTools Network contains no TFN, BSB, bank account, DOB, address, visa, super or private evaluation text;
- 1366×768 and 390 layouts, with zero uncaught application console errors.

This is the sole remaining Internal Pilot gate.

## 6. Startup readiness

`scripts/start-dev.ps1` now verifies native command exit codes and waits for all four conditions: backend listening, database healthy, Evaluate integration healthy and frontend reachable. It prints `WAITING`/`UNHEALTHY` until all pass and only then prints `READY`.

Live result: frontend HTTP 200; backend health HTTP 200 with `{"ok":true,"services":{"database":true,"evaluateMolly":true}}`. Backend health returns 503 when either dependency is unhealthy.

## 7. Month readability

Compact Month cards now show `岗位 · 员工 [+N]` and time, with ellipsis plus a full tooltip. Desktop measurement was approximately 116×30 px; mobile measurement approximately 105×30 px. Both displayed `前场 · HandoverEmployee001` and `09:00–10:00` without shrinking text into an unusable size.

On mobile the Month grid scrolls within the calendar surface at a stable 770 px internal width. The page document itself does not overflow.

## 8. Settings responsive

Settings grids, cards, inputs, role rows and actions now have shrink-safe and wrapping behavior. At the requested 390 browser viewport (354 px measured content viewport), `document.scrollWidth=354`; the workspace measured `scrollWidth=clientWidth=323`, and no element extended beyond the viewport. Requested 1366 and 1920 runs likewise had no document overflow.

## 9. Calendar request race

Calendar main loads and dialog loads have independent monotonically increasing request sequences. Only the newest store/range request can commit state or clear loading/error state.

Runtime verification rapidly switched Next/Next/Back/Month/Week/Day/Today and then Hurstville→Green Square. Final title, date column, roles and events all matched the last selection; no late response overwrote it.

## 10. Feedback locking

Role create/toggle uses an immediate `useRef` single-flight lock in addition to disabled/loading UI. Both paths provide success/error toast and authoritative refetch.

A real browser double-click created exactly one POST and one role. A toggle double-click generated exactly one PATCH. The UI updated and showed success feedback; the isolated role was removed after exact identity/count verification.

## 11. Period concurrency

Migration `backend/prisma/migrations/20260928010000_prevent_overlapping_roster_periods/migration.sql` installs `btree_gist` and a store/date-range exclusion constraint. Create/copy also take a store-scoped advisory transaction lock for deterministic application behavior. Constraint violations map to HTTP 409.

The real PostgreSQL integration test issued two concurrent overlapping creates. Exactly one succeeded, one returned 409, and only one database row existed. The migration is deployed locally and Prisma reports all three migrations up to date.

## 12. Staff performance

Staff no longer keeps store-wide availability loaded; it requests only the selected employee's range. Role matching uses stable memoized derived data. The directory and Employee Picker render in windows of 60, with filter changes resetting the window and an explicit load-more path.

With an isolated 500-employee browser response fixture:

- Staff became ready in 1,555 ms;
- 60 cards were initially mounted, not 500;
- measured JS heap was approximately 33.3 MB with 2,299 DOM nodes;
- search returned 11 matches in 201 ms;
- load-more produced 120 cards;
- Employee Picker reported 500/500 but mounted only 60 buttons; search returned 11 buttons in 167 ms.

No synthetic employee was written to the database.

## 13. Drag E2E

In real Chrome Day view, a pointer drag from the 09:00 slot to the corrected 10:00 boundary opened Add Shift with start `09:00` and end `10:00`. Cancel closed the dialog and left counts unchanged at periods=2, shifts=10, assignments=18.

The same gesture was repeated in an isolated test period, an employee was selected and Save succeeded. The persisted shift had the exact 09:00–10:00 interval. The period and shift were then removed by exact IDs as test-only fixture cleanup.

## 14. Tests

Final automated results:

- Frontend: 13 files / 77 passed.
- Backend including PostgreSQL integrations: 6 files / 44 passed.
- ESLint: passed.
- Frontend production build/typecheck: passed.
- Backend production build/typecheck: passed.
- Prisma validate: passed.
- Prisma migrate status: 3 migrations, up to date.
- Frontend and backend `npm audit`: 0 vulnerabilities.

## 15. Browser QA

ADMIN browser verification completed Calendar Month/Week/Day, Staff, Settings, Export/publication history, Availability multi-slot, role mutation locking, drag create/cancel/save and responsive widths. Application console had zero uncaught errors; extension-only warnings were excluded.

Network inspection of the roster workforce response found only `id`, `displayName`, employee/employment type, store id/name, active state, official score and skill summary. Recursive scans found zero TFN/BSB/bank/DOB/address/visa/super/private/evaluator/evaluation-text keys. Employee publication detail likewise had zero score/tier/internal-note/round/PII paths.

STORE_EVALUATOR browser QA remains pending as stated in section 5.

## 16. Migration

The new migration adds the database-level overlap invariant without resetting or pushing the schema. `prisma migrate deploy` completed and `prisma migrate status` confirms the schema is current. No business data was deleted; only exact, isolated test fixtures created during this remediation were removed.

## 17. Remaining issues

1. **QA-01 / P1:** manual STORE_EVALUATOR login and the full own-store/cross-store/PII browser matrix.
2. **TOOL-01 / P3:** Prisma seed configuration deprecation warning; intentionally deferred to a dependency-maintenance task.
3. Non-blocking infrastructure: repository-local Playwright/axe/visual-regression suites would convert the current real-browser evidence into repeatable CI checks.

## 18. Final verdict

**NOT READY FOR INTERNAL PILOT**

All code/data remediation gates requested in this round are implemented and verified, but the stated readiness policy explicitly requires real STORE_EVALUATOR browser acceptance. The verdict may change to `READY FOR INTERNAL PILOT` only after the manual login session passes store scope, PII, export and responsive checks with zero uncaught application errors.
