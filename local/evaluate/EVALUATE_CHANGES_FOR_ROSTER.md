# Evaluate Molly Changes for Molly Roster

Date: 2026-09-07

## Scope

Added one isolated read-only integration service and four authenticated routes:

```text
GET /api/roster-integration/contract-version
GET /api/roster-integration/stores
GET /api/roster-integration/stores/:storeId/employees
GET /api/roster-integration/employees/:employeeId
```

The service exposes only active store identity, minimum employee scheduling identity, latest valid CLOSED round aggregate score/Tier, and current EmployeeSkill summaries. Store scope is enforced by existing authenticated server helpers. Archived employees are omitted from store picker lists but can be resolved by scoped ID for assignment validation/history warnings.

## Explicitly unchanged

- No Prisma schema or migration change.
- No Employee, Store, Account, Session, Evaluation, Round, Tier, scoring, skill mutation, or UI behavior change.
- No roster-owned data is stored in Evaluate Molly.
- No HR PII, evaluation text, evaluator detail, individual score, AI analysis, or evidence is returned.

## Reason existing API was insufficient

`GET /api/roster-skill-board` is intended for Evaluate's internal board. ADMIN discovery can include OPEN provisional aggregates and its store response contains fields Molly Roster does not need. The dedicated contract is CLOSED-only and minimal for both roles.

