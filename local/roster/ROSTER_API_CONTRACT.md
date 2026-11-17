# Molly Roster API Contract

Base path: `/api`

All routes except `GET /health` and `POST /auth/login` require a valid Evaluate Molly HttpOnly session. Every store-specific read/write is server scoped.

## Foundation and session

```text
GET  /health
POST /auth/login
GET  /auth/me
POST /auth/logout
```

## Period and calendar

```text
GET   /roster/periods?storeId=&from=&to=
POST  /roster/periods
GET   /roster/periods/:periodId
PATCH /roster/periods/:periodId
GET   /roster/calendar?storeId=&from=&to=
```

GET routes never create periods or any other state.

## Shift mutations

```text
POST   /roster/shifts
PATCH  /roster/shifts/:shiftId
DELETE /roster/shifts/:shiftId?version=
POST   /roster/shifts/:shiftId/assignments
DELETE /roster/shifts/:shiftId/assignments/:assignmentId?version=
```

Create/update validates current employee active/store state through Evaluate before committing. `version` is mandatory for update/delete. Stale changes return `409`.

## Availability, roles, templates and settings

```text
GET  /roster/availability?storeId=&from=&to=&employeeId=
PUT  /roster/availability
GET  /roster/roles?storeId=
POST /roster/roles
PATCH /roster/roles/:roleId
GET  /roster/templates?storeId=
POST /roster/templates
PATCH /roster/templates/:templateId
GET  /roster/availability-templates?storeId=
POST /roster/availability-templates
PATCH /roster/availability-templates/:templateId
GET  /roster/settings?storeId=
PUT  /roster/settings/:storeId
```

Saved settings drive calendar week start, operating window and slot size. Shift create/update enforces the configured minimum duration and same-day operating window on the server; stale settings/template/role updates return `409`.

## Batch, publication and export

```text
POST /roster/batch/copy
POST /roster/batch/update
POST /roster/batch/delete
POST /roster/periods/:periodId/publish
POST /roster/periods/:periodId/reopen
GET  /roster/export.csv?storeId=&periodId=&audience=employee|manager
GET  /roster/print?storeId=&periodId=&audience=employee|manager
```

## Error shape

```ts
type ApiError = {
  message: string; // actionable Chinese text
  code?: string;   // stable non-sensitive application code
  issues?: Array<{ field?: string; message: string }>;
};
```

Expected statuses: 400 validation, 401 expired session, 403 store/role denial, 404 scoped not found, 409 stale/conflict, 422 publish blockers, 503 Evaluate/database unavailable.

Responses never contain raw database messages, stack traces, secret values, employee HR PII, individual evaluator scores, or AI evidence.
