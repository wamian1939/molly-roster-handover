# Deployed to Sites ? 2026-11-15

Live public URL:
https://molly-tea-roster-migration-20261115.light-lyric-6601.chatgpt.site

Site ID: appgprj_6af98e9230748191a14644151c6dc1e5. Audience is public, as explicitly requested.
Initial production release succeeded. Final release removes the migration
secret and includes the verification evidence. Use existing Evaluate manager
credentials on the application login page. Employee demo:
/employee/availability (fictional identities, isolated reports).

## Cutover and data

Both local backend writers were stopped at approximately 22:43 Australia/Sydney
on 2026-11-15. A fresh backup and read-only export were taken. Export contents
matched the earlier snapshot exactly; no intervening source changes were found.
The local databases remain intact and local writes remain stopped to avoid
splitting new work between two systems.

Imported to hosted D1: 530 Roster rows across 12 tables, all 1,416 Evaluate
archive records, 6 original accounts and 30 employee projections. Every Roster
field and every Evaluate archive record matched the private source export by
checksum. Foreign-key violations: 0. Import is sealed. Raw records, hashes,
service access tokens and migration credentials are not in Git/build artifacts.
The one-time migration secret is removed in the final runtime configuration.

Final verified backups:
.local/backups/20261115T114345Z/
Both archives were fully restored into fresh disposable PostgreSQL databases
and record counts were verified. Earlier backups also remain retained.

## Behavior and validation

Implemented through the existing RosterService and route validators: existing
manager login and store scopes, workforce/CLOSED-score reads, roles, settings,
templates, Availability/script import, manual shifts, draft commits, batch/copy,
calendar/history, publish/reopen, employee-safe and manager CSV/print.

Local workerd/D1 E2E passed 15 checks including concurrent writes, invalid
multi-change rollback, injected publication failure/recovery, idempotency,
cross-store access and immutable publication snapshots. Cloud API smoke passed
9 checks: healthy database/workforce, React login document, anonymous/CSRF
rejection, the imported Argon2id verification path, mock login/code preview,
durable mock reporting, duplicate rejection, reload and logout. Formal data
was unchanged by those mock tests.

Browser automation was stopped because the tool could not verify whether the
current browser URL was allowed. No browser restriction was bypassed. Visual
acceptance and a real manager's interactive login/draft/publish/export flow
remain UNVERIFIED. Local E2E does not substitute for that acceptance.

The four pre-existing frontend TemplatesPage test failures remain in the
original repository. Frontend build passes; original backend 324/324 passed on
isolated PostgreSQL. Production dependencies: npm audit --omit=dev found 0
vulnerabilities. Local-only Miniflare test tooling still has development audit
findings and is not bundled into the Worker.

## Deliberate limits

Employee login is MOCK, as explicitly requested, and never writes formal
employee Availability. Managers still use real Evaluate credentials.
Automatic scheduling is not available: native OR-Tools needs an HTTPS container
host, which is not available. The prepared container was tested locally. Solver
API failure does not affect manual roster operations.

Evaluate's separate editor is not deployed. Its data and histories are retained
read-only, with workforce and CLOSED scores derived by its original service.
Do not edit the local Evaluate database and expect live synchronization.

The D1 adapter commits an entire request diff with a global revision CAS in one
batch. Current verified bounds are 20,000 Roster rows and 800 changed rows per
operation; it rejects excess operations without partial writes. Store dates
remain dates, instants use UTC, and Australia/Sydney interpretation is retained.

## Rollback

The original local source and databases are retained. Restore backups only into
new databases, validate, then point backends there if needed. The easiest
pre-cloud-write rollback is restarting the existing local stack. After any
cloud write, first export and preserve those changes before reopening local
writes. A Worker version rollback does not roll back D1 data.

Original base: master / 5d2c9f6ba13d159acc99835e7970b1539dce45b3 plus user changes.
Sites source has independent Git history. The final source commit and Site
version are returned by publishing and reported in the conversation.


## Evaluate service release

Evaluate is available under /evaluate/ in the same public Site; its protected
API is /api/evaluate/. Existing Evaluate accounts and original Argon2 hashes
are retained. Both applications share the same session cookie and D1 authority.
The previous 1,416-row archive is now the canonical mutable Evaluate model,
with SQL unique indexes, FK and shape guards, CLOSED history protection and
append-only skill confirmations. This release adds schema guards only and
never reimports or overwrites cloud business records.

Existing Evaluate business services and React pages are copied into the
independent Sites checkout. Every successful business mutation updates the
Roster workforce projection and account permission cache in the same D1 batch.
A shared revision guard prevents lost updates across both applications.
Original source repositories, local databases and rollback backups are retained.
Both local backend writers remain stopped after the original cutover.

Disposable workerd/D1 validation: evidence/evaluate-e2e.json. It covers the
existing dashboard, employee/history/analytics/skill/account reads, employee
and position creation, stale edits, open and closed round transfers, scoring,
admin-only close, duplicate close, direct SQL immutability, atomic projection
failure recovery, account creation/login/disable and default store jobs.
Roster regression and smoke checks pass separately. No test accounts or test
employees are inserted into the production database by these tests.

Existing local DeepSeek configuration was copied to Sites server secrets.
The provider's live response and a real manager's browser workflow have not
been accepted interactively. The OR-Tools automatic roster solver remains
unhosted; this does not prevent Evaluate scoring or manual Roster workflows.

Code rollback: redeploy the previous saved Sites version. Additive database
guards can remain; version 3 does not modify Evaluate canonical rows. Before
returning to the retained local applications, export and reconcile all new
cloud Evaluate and Roster writes. Restoring the original PostgreSQL backup
alone would discard post-cutover cloud work.
