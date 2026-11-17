# Molly Roster Architecture

Status: accepted implementation baseline for Phase 2+

## Decision summary

Molly Roster is an independent TypeScript application with its own repository boundary, frontend, Express backend, Prisma schema, PostgreSQL database, migrations, tests, and deployment unit. It integrates with Evaluate Molly only through authenticated HTTP contracts.

## Runtime topology

```text
Browser
  -> Molly Roster frontend
  -> Molly Roster /api
       -> Roster PostgreSQL (roster-owned data only)
       -> Evaluate Molly /api/auth/* and /api/roster-integration/*
            -> Evaluate PostgreSQL (account/workforce authority)
```

Production should expose both apps through HTTPS and a same-origin gateway or sibling subdomains that deliberately support the shared Evaluate session cookie. Local development uses `127.0.0.1` consistently so a host-only cookie can cross local ports.

## Selected stack

- Frontend: React 19, TypeScript 5.9, Vite 7, React Router 7, Tailwind 3, Radix Select, Framer Motion, Lucide React, Vitest, Testing Library.
- Calendar: open-source FullCalendar core with day grid, time grid, interaction, and React adapter. No premium scheduler/resource features.
- Backend: Node 20, Express 5, Zod 4, Prisma 6, PostgreSQL 16, Helmet, Vitest, Supertest.
- Monorepo shape: root frontend plus `backend/`, mirroring Evaluate for operator familiarity. Each side has its own package manifest and build.

## Ports

- Roster frontend development: `5176`.
- Roster backend development: `4020`.
- Evaluate frontend remains `5174`; Evaluate backend remains `4000`.
- Roster database uses PostgreSQL `5433` in local Docker Compose to avoid the existing Evaluate PostgreSQL on `5432`.

## Authentication flow

1. Browser sends login credentials to Roster `POST /api/auth/login`.
2. Roster streams the request to Evaluate `POST /api/auth/login` and forwards `Set-Cookie` without logging credentials.
3. Browser stores Evaluate's HttpOnly session cookie for the Roster host.
4. Each protected Roster request forwards the cookie to Evaluate `GET /api/auth/me`.
5. Roster stores the verified auth context only for the request. It scopes every database query server-side.
6. Roster never creates account/session tables and never accepts role/store headers outside automated test mode.

This remote introspection favors correctness and product separation over a fragile direct dependency on Evaluate database tables. A short request-local or very short token-hash cache may be introduced only after correctness tests.

## Data ownership

Roster database contains no Employee table. `ShiftAssignment.employeeId` is an external Evaluate identifier plus immutable display/type/score/Tier snapshots. Availability is Roster-owned and keyed by the external employee ID and authoritative store ID.

Core aggregate:

```text
RosterPeriod
  -> Shift
       -> ShiftAssignment (many employees)
       -> ShiftRole
RosterPublication -> immutable publication metadata/snapshot boundary
EmployeeAvailability + AvailabilityTemplate
ShiftTemplate + RosterStoreSettings
```

All mutable core records use integer optimistic versions. Stale mutation returns `409` and does not overwrite.

## Store authorization invariant

- `STORE_EVALUATOR`: effective store is always `auth.storeId`; a conflicting path/body/query `storeId` returns `403` before any record is returned or changed.
- `ADMIN`: must explicitly select an active Evaluate store for store-specific operations.
- Shift assignment validates the employee through Evaluate and requires employee `storeId === shift.storeId` and `isActive === true`.
- Record lookup includes store scope in the database predicate to avoid existence leaks.

## Availability and time model

- Store settings hold IANA timezone, default `Australia/Sydney`.
- Period dates and availability dates are date-only PostgreSQL values.
- Shift start/end are UTC instants computed from store-local input; end must be later than start.
- Overnight shifts are allowed only when end-local-time is earlier/equal and are normalized to the next day, within a configurable maximum duration.
- Break is integer minutes and must be less than shift duration.
- Weekly hour totals count net duration once per assignment.

## Publication strategy

V1 uses a safe explicit reopen model:

- Draft periods are editable.
- Publish validates blocking errors and records a `RosterPublication` snapshot/version.
- A published period is read-only until an authorized manager explicitly creates a draft revision/reopens it.
- Historical published data renders from assignment and role snapshots even when Evaluate is unavailable.

## Resilience

- Calendar and published history read solely from Roster DB and continue when Evaluate is down.
- Staff picker and new assignment validation require a current successful Evaluate response.
- Integration errors are translated to stable Chinese messages and sanitized server logs.
- Health endpoint reports Roster database readiness and a separate non-blocking Evaluate connectivity field.

## Security and privacy

- Helmet and explicit production origin checks protect mutation endpoints.
- Cookies remain HttpOnly; no auth state in local storage.
- Request logs omit cookies, authorization, credentials, names, notes, and workforce DTOs.
- Employee-safe exports exclude score, Tier, skills, internal notes, and technical IDs.
- Admin exports are authenticated and store-scoped.

## Test layers

- Unit: time math, duration/break, overlap, availability, skill fit, hours, score display, role requirements, period ranges.
- Backend: auth introspection, scope, CRUD, validation, concurrency, batch, publish, exports, archive behavior, PII response contract.
- Frontend: view switching, drag select, dialog, employee selection, score/Tier, filters, mutation feedback, responsive rendering.
- Browser: real pointer drag, multi-account/store scope, desktop viewports, and 390px core workflow.

## Evaluate change boundary

Only a dedicated read-only roster integration service/routes and contract tests may be added to Evaluate. No scoring, employee management, round, skill mutation, authentication, or schema behavior is changed. Those changes are recorded in `EVALUATE_CHANGES_FOR_ROSTER.md`.

