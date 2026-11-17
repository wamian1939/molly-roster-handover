# Xero Payroll AU integration

This extension belongs to the existing `/export` page. Actual source architecture
is React 19/Tailwind, Express 5, Prisma 6/PostgreSQL, with an existing Sites Worker
and D1 deployment. No .NET, EF Core or MUI was introduced. The existing download
is Excel-readable CSV, not an XLSX workbook; its button and print flow remain.
An appended Paid Hours column uses the same paid-minute function as payroll.

## Files and storage

- `backend/src/payroll/`: SQL store, OAuth/token encryption, official API client,
  shared payroll preparation, source adapter, preview/confirmation, reconciliation,
  Draft synchronization and HTTP routes.
- `src/components/payroll/PayrollPanel.tsx`: extension inside `ExportPage.tsx`.
- Prisma models `PayrollDocument`, `PayrollLock`, `PayrollAudit` and migration
  `20261117010000_xero_payroll/migration.sql`.
- Sites migration `sites/roster/drizzle/0003_xero_payroll.sql` and Worker mount.
- Tests: `backend/tests/payroll.test.ts`,
  `src/components/payroll/PayrollPanel.test.tsx`, and the existing export regressions.
- PostgreSQL adapter verification: `backend/scripts/verify-payroll-postgres.ts`.

Three additive tables hold integration data only:
`payroll_documents` contains versioned typed documents (connection, hashed OAuth
state, per-tenant reference cache/mappings, previews, jobs and target ledgers);
`payroll_locks` contains owner-fenced renewable leases;
`payroll_audit` contains insert-only application audit events. Existing employees,
shifts and historical publications are not migrated or rewritten by this feature.
Target IDs hash tenant + Xero employee + calendar + exact payroll period; the
primary key, compare-and-swap writes and database lease prevent duplicate jobs
and overlapping writers. This intentionally avoids a second employee master.

## Developer App and server configuration

Create a Xero OAuth Web App. The authorizing person must have access to the
Australian Payroll organization. Register the exact callback below; avoid mixing
localhost and 127.0.0.1, since the initiating Roster session is required at callback.

Local callback (via the existing Vite API proxy):
`http://localhost:5176/api/payroll/oauth/callback`

Existing Sites callback:
`https://molly-tea-roster-migration-20261115.light-lyric-6601.chatgpt.site/api/payroll/oauth/callback`

Required server-only environment variables:

```dotenv
XERO_CLIENT_ID=
XERO_CLIENT_SECRET=
XERO_REDIRECT_URI=http://localhost:5176/api/payroll/oauth/callback
XERO_TOKEN_KEY=
XERO_ENABLE_TRACKING=0
```

Generate the encryption key with
`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`.
Keep it in `backend/.env` locally and a Sites runtime secret in production.
Use separate development/production credentials and encryption keys. Never set
VITE_ variables for these secrets. Back up the key securely: changing it requires
decrypting/re-encrypting old tokens with the old key, or reconnecting Xero. Tokens
use AES-256-GCM with authenticated context and fresh nonces; neither token nor
client secret is returned to React or written into logs/audit.

Scopes: `offline_access payroll.timesheets payroll.employees.read
payroll.settings.read`. No OpenID scope is needed because Xero is not the Roster
identity provider. Optional store tracking requires `XERO_ENABLE_TRACKING=1` and
adds `accounting.settings.read`, followed by reauthorization. Tracking options
are read from the category selected in Payroll Settings; arbitrary IDs cannot
be saved. Core operation requires no Accounting write scope.

For local PostgreSQL, review `prisma migrate status` and apply the checked-in
migration using the normal Prisma migration workflow. The live status check
found only this migration pending. It was applied after a fresh backup was
fully restored into a separate database; existing roster records are retained.
Additional SQL adapter/lease verification uses a separate disposable database.
For Sites, the checked-in Drizzle journal applies the additive D1 migration at
deployment. SQL integration state is accessed directly in the Worker; it is
excluded from the legacy Roster snapshot adapter.

## Admin workflow / first real synchronization

1. Sign in with a real Evaluate ADMIN account. Open Roster → Export.
2. Configure the server secrets above; click Connect to Xero and complete Xero
   login/MFA/consent yourself. Select the correct Organization (name and tenant ID).
3. Choose the current roster period or an immutable publication. Add other store
   periods when needed. A canonical store/period may have only one chosen version.
4. Open Sync to Xero → Preview. Refresh Xero employees/settings when necessary.
   Manually select each Xero Employee ID and save mappings. Names never finalize
   matching automatically. Xero Employee Number, Email, employment status and
   calendar are displayed when supplied by the API.
5. Map only real, appropriate hourly Earnings Rates to your own categories.
   Saturday/Sunday/Public Holiday/Overtime labels are examples, not wage rules.
   No Award, penalty, employment-type or overtime rule is inferred. MULTIPLE
   rates require the employee's ordinary rate to be hourly.
6. Review each employee/day/store. Confirm actual minutes and unpaid breaks, or
   adjust with a reason. A cross-midnight break has no stored break timestamps:
   the preview clearly requires confirming its allocation across local days.
   Save edits, then Validate. Unsaved rows/mappings cannot be confirmed or synced.
7. Verify exact employee payroll-calendar periods and existing remote Draft
   hours. Explicitly opt in before adopting/updating matching manual Draft lines.
   Confirm and lock the actual-hours snapshot. Future corrections require a new
   preview, preserving the original confirmation and audit history.
8. Click Sync to Xero. Each request processes one employee-period, and progress
   is durable. The UI continues through the batch. If the browser closes, reopen
   Sync History and Continue unfinished. Retry failed employees resets only
   failed records; successful records are retained.
9. Check successful/skipped/failed records, confirmed hours, Timesheet IDs and
   correlation IDs. In Xero Payroll, inspect those Draft timesheets and compare
   dates/rates/units before using Xero's own approval process. This app exposes
   no approval, pay-run finalization, payment, or STP operation.

Real synchronization requires actual Client ID/Secret and manual OAuth consent.
No test hours may be written to a production organization to test configuration.
Use a separately authorized Xero demo/test organization for external acceptance.

## Hours, calendars, and safe updates

Paid minutes = actual UTC elapsed minutes minus the original recorded unpaid
break. No flat one-hour deduction is added. Store-local date splitting uses Luxon
IANA zones, including Sydney/Melbourne daylight saving transitions. Multiple
segments/stores merge by canonical employee and actual Xero calendar. Calculations
remain integer minutes; only after aggregation are units converted to hours with
four decimal places. Remote read-back must match the submitted units and total.
This is this application's conversion policy, not a claim that every Xero API
resource uses four decimals. Excel-readable CSV uses the same minute calculation.
The existing roster CSV remains scheduled hours; Xero uses separately confirmed
actuals. Their differences are intentional and audited.

WEEKLY/FORTNIGHTLY/FOURWEEKLY periods derive from the actual Xero Calendar StartDate;
cross-period exports split and create oldest first. MONTHLY/TWICEMONTHLY/QUARTERLY
are explicitly blocked because reliable boundaries are not available from the
currently implemented calendar model. Do not guess those dates.

For each sync, the API queries existing remote timesheets even without a local
record. Only Drafts may change, and each line update/deletion targets its actual
TimesheetLineID. Unrelated remote lines remain. Previously exported contributions
from other stores/weeks in the same payroll period remain in the local target
ledger and are merged with the new confirmation. Removing an employee's final
shift produces an explicit zero-minute reconciliation row, not silent stale pay.

Mapping/calendar destination changes for an already synced source are blocked to
avoid paying both old and new targets. For a legitimate correction, first reconcile
the old Draft in Xero manually. The Export UI's old-target section can verify
that its corresponding hours are gone and release the local association, with
an audit event. It cannot delete an employee's timesheet or bypass history limits.

Before each external operation, leases are renewed and ownership is checked.
Refresh rotation uses a separate shared lease, saving both encrypted tokens.
An intent with before/after values and line-ownership keys is persisted before
every write. After timeouts, the remote object is read first; only a proven state
can continue. Unknown or externally modified states fail closed. Every successful
write is read back and checked (employee, calendar, dates, Draft status, lines and
total), so HTTP 200 alone is insufficient. Stable per-operation Idempotency-Key
headers add provider protection. 429 uses Retry-After with bounded exponential
backoff; long delays return an actionable error instead of holding a request open.
Upstream Xero 401/invalid-grant becomes a local reauthorization error (409), not
a Roster logout. Partial failures and correlation IDs remain in Sync History.

Automatic scheduled synchronization is unavailable and off. This project has no
reliable server scheduler; adding browser-based timers would not meet the stated
requirements. Manual durable synchronization is implemented without a new queue
or microservice. Scheduling can be added only after real manual acceptance and
reliable hosting task configuration. No fake connection is offered in production.

To avoid immediately repeating a full tenant preflight, confirmation can reuse
a result for up to 60 seconds only when preview version, mapping hash, reference
version, source data and selected connection all still match. Every write still
performs live remote-state and payroll-setting checks; the cache never authorizes
an overwrite of changed or approved data. Saved corrections retain immutable
before-images through the revisions API and detailed audit events.

## APIs

All routes below are under `/api/payroll`, ADMIN-only, with origin checks on
mutations. OAuth callback also requires the initiating authenticated session,
one-use hashed state and expiry. Existing Roster auth/store boundaries remain.

| Method | Path | Purpose |
|---|---|---|
| GET | /status | Configuration, connection, organizations and timestamps |
| POST | /connect | Start server Authorization Code flow |
| GET | /oauth/callback | Exchange code, encrypted persistence, list tenants |
| POST | /tenant | Explicit tenant selection with expected-current-tenant check |
| POST | /disconnect | Remove granted Xero connections and clear local token |
| GET / POST | /references / /references/refresh | Real employees, calendars, rates, tracking |
| GET / PUT | /mappings | Versioned, per-tenant confirmed mappings |
| POST | /previews | Prepare selected roster sources |
| GET / PUT | /previews/:id | Read / save actual-hours corrections with audit |
| GET | /previews/:id/revisions, /previews/:id/revisions/:version | Immutable correction before-images |
| POST | /previews/:id/validate | Source, mapping, period and remote-state validation |
| POST | /previews/:id/confirm | Confirm and lock |
| POST | /previews/:id/sync | Durable idempotent job creation |
| GET | /jobs, /jobs/:id | History / detailed results |
| POST | /jobs/:id/process | Process/resume one employee-period |
| POST | /jobs/:id/retry | Reset failed records only |
| GET | /targets | Existing integration targets for current tenant |
| POST | /targets/:id/reconcile | Verify old Draft cleared before changing destination |

## Verification and limits

```text
npm ci
npm --prefix backend ci
npm --prefix backend run build
npm run build
npm --prefix backend test -- --run tests/payroll.test.ts tests/rosterRoutes.test.ts tests/app.test.ts
npm test -- --run src/components/payroll/PayrollPanel.test.tsx src/pages/ExportPage.test.tsx
```

Mock HTTP exists exclusively in automated tests. The core tests use disposable
workerd/D1 with the actual migration and store. PostgreSQL verification additionally
executes the real migration/adapter/CAS/leases/audit in an explicitly named disposable
database; no production employee, shift or payroll data is touched by tests.
Preview input is bounded to 20 sources/1,000 rows. API reference pagination fails
closed beyond 5,000 rows. Schema/data backups and existing Sites versions remain
the rollback path. Code rollback does not undo external Xero writes; reconcile
those by their recorded IDs in Xero and retain the integration ledger/audit.

Official contracts consulted:
[AU Timesheets](https://developer.xero.com/documentation/api/payrollau/timesheets),
[AU v2 OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-au-v2.yaml),
[AU v1 OpenAPI](https://github.com/XeroAPI/Xero-OpenAPI/blob/master/xero-payroll-au.yaml),
[OAuth scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/),
[OAuth token refresh](https://developer.xero.com/faq/oauth2).
