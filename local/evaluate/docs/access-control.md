# Authentication and Access Control

Production and local development use database-backed `UserAccount` sessions. Browser-controlled role or store headers are not trusted. Protected API requests without a valid session return `401`.

## Roles

Only two authentication roles exist:

| Role | Store scope | Evaluation access | Administration |
| --- | --- | --- | --- |
| `ADMIN` | All stores | Score, view aggregate and individual submissions, close rounds | Accounts, stores, employee profile and HR fields |
| `STORE_EVALUATOR` | Assigned `storeId` only | Score own latest submission and view progress; no peer scores | No account/store administration and no sensitive employee profile |

An active employee can be scored only by ADMIN or an active evaluator assigned to that employee's store. Archived employees remain history-readable but cannot receive new submissions.

## Evaluation enforcement

- GET round, aggregate, employee, and evaluation routes are read-only.
- A store evaluator may update only their own OPEN-round submission.
- ADMIN scoring uses its own evaluator identity and is excluded from store progress and aggregate.
- Only ADMIN may close a round.
- CLOSED rounds, Evaluations, skill snapshots, AI rows, and evaluator snapshots are immutable.
- Store scope is checked from persisted account data, never from request headers.

## Employee privacy boundary

Employee list/search, evaluation, dashboard, analytics, history, and Skill Board responses use the summary identity (`id`, `displayName`, `storeId`, employee type/status). They do not return legal name, date of birth, contact, address, visa, banking, tax, or superannuation data.

The full employee profile endpoint is ADMIN-only. Search is limited to non-sensitive summary fields and must not reveal a match through protected name fields. Logs and error metadata use the safe logging layer and must not include credentials or HR PII.

## Authentication operations

Initial ADMIN creation is performed by the explicit bootstrap command with environment-provided values. Passwords are stored as one-way hashes, never returned by an API, and never committed to the repository. Login rate limiting and session invalidation apply independently of evaluation permissions.
