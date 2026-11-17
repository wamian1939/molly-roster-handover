> 交接注：下文为原项目历史 README，部分状态可能早于当前生产 version 5。请以交接根 README、docs/PROVENANCE.json 和 FEATURE_STATUS.md 为准；不要直接运行指向既有服务的启动/部署脚本。

# Molly Tea Roster ? Sites

Independent deployment of the existing React UI, RosterService and API routes.
Original local files and databases are retained.

The Worker uses a consistent D1 snapshot per request and a global revision CAS
inside a transactional D1 batch to commit the complete mutation. Cross-store
employee conflicts and publication remain atomic. Conflicting requests retry
from fresh data, at most three times. Current verified limits are 20,000 Roster
rows and 800 changed rows per operation; excess operations fail without writing.

Manager login retains Evaluate accounts and Argon2id hashes. Roles and store
scopes are loaded from D1 on every request. Existing local sessions are not
reused; users sign in again. Password verification is Worker-compatible and
bounds memory and concurrent verification.

Employee login is explicitly MOCK, as requested. Fictional accounts and reports
use separate tables and never become formal employee availability. Existing
AA/BB/CC configuration and capacity rules are retained. Managers edit formal
Availability through the existing Staff workflow.

Canonical Evaluate data is retained as a read-only D1 archive. Workforce and
valid CLOSED-round scores are derived using the original Evaluate service at
cutover. The separate Evaluate editor is not replaced by this Roster Site.
Local master-data changes after cutover do not automatically synchronize.

Automatic scheduling needs an external HTTPS solver. Until connected, its API
returns an explicit unavailable response. Manual scheduling, publication,
history, CSV and print do not depend on it. The native container has been tested
locally and has not been hosted.

## Build and checks

Run npm ci, npm run build, then node tests/smoke.mjs and node tests/e2e.mjs.
E2E uses private ignored exports and a disposable local workerd/D1 instance.
The standalone checkout builds from its retained frontend/ and generated/
sources. No database or secret is required to build. Worker static assets are
embedded; no localhost runtime dependency is used.

## Data and recovery

Private exports, backup archives and migration chunks stay in ignored .local/.
A server-secret-protected import accepts bounded transactional hashed chunks,
then seals itself. Remove the secret through Sites after verification.
Cloud verification compares every Roster field and the full Evaluate archive,
counts and foreign keys. Only aggregate evidence is tracked.

Rollback uses the retained local system and verified PostgreSQL backups. Restore
into a new database, verify, then change connections. Preserve any cloud writes
before reopening local writes: code rollback does not undo database changes.

See MIGRATION_STATUS.md. The initial incomplete attempt is archived in
evidence/initial-migration-status.md.

Evaluate uses /evaluate/ and /api/evaluate/ on the same Site, session and D1.
Run node tests/evaluate-e2e.mjs for the disposable Evaluate workflow checks.
Existing Evaluate source is retained under generated/evaluate/ and
evaluate-frontend/; do not restore local source data over cloud writes.

Xero Payroll is available in /export for ADMIN users. Setup, API list,
confirmed-hour workflow and recovery are documented in docs/XERO_PAYROLL_INTEGRATION.md.
Real OAuth credentials and consent must be configured before connecting.
