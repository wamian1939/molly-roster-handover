# Deployment result: NOT LIVE

Verification date: 2026-11-15, Australia/Sydney.

No production URL, saved Site version, hosted data import, audience change or
traffic cutover has occurred. Sites creation succeeded; publication access has
not been exercised. This is not a GitHub or Sites permission rejection.

Reserved project:

- ID: `appgprj_6af98e9230748191a14644151c6dc1e5`
- Audience observed: owner only.
- Expected origin: `https://molly-tea-roster-migration-20261115.light-lyric-6601.chatgpt.site`
- The expected origin is **not evidence of a deployed application**.

## Source and actual architecture

- Branch `master`, HEAD `5d2c9f6ba13d159acc99835e7970b1539dce45b3`.
- The working tree already contained extensive modifications and untracked
  implementation. No reset, stash, branch switch or commit was performed.
- `evidence/source-snapshot.json` records 248 source/config hashes, with snapshot
  hash `fa1e8c4ff73bbf53b6a60892ceec0c97c7fe86b9fe4dd1cec039ad8d74c00407`.
- React 19 / Vite 7 / Tailwind / FullCalendar / Luxon; Express 5 / TypeScript /
  Prisma 6 / PostgreSQL. No ASP.NET Core, EF Core or MUI project was found.
- No applicable `AGENTS.md` was found in the repository or checked ancestor
  locations. README, startup scripts, frontend repositories, backend routes,
  Prisma models/migrations, auth, publication, export and solver code were read.
- Evaluate at the sibling checkout owns credentials, store access, canonical
  employees, formal positions, current skills and valid CLOSED-round scores.
  Roster owns availability, periods, shifts, assignments and publications.
- Source databases are separate: Roster on 5433, Evaluate on 5432. The user's
  instruction is to move the local data online, preserving Evaluate accounts;
  there is no existing hosted Evaluate endpoint to call.
- Existing APIs include workforce reads, settings, roles, templates,
  availability and AA/BB/CC script import, period/calendar/summary reads,
  shifts, atomic draft commit, copy/repeat/batch operations, publish/reopen,
  publication history, employee-safe/manager CSV and print views.
- Frontend manager API requests already default to same-origin `/api`.
- Existing production login supports ADMIN and STORE_EVALUATOR. Employee
  self-service has a separate mock implementation. User approved mock employee
  login for now; it must not authenticate a real employee or manager.

## Executed data work

Both PostgreSQL containers were started. Binary custom-format backups and
manifests are in `.local/backups/20261115T105519Z/`:

| Database | Archive bytes | SHA-256 |
| --- | ---: | --- |
| Roster | 61,545 | `254accd3790bfab11865c78006e09b165960420201582678eebace0b0b002a16` |
| Evaluate | 247,772 | `251a3b6570ba2e4f2ec78baa8a7a9b5f2f134a530952159a88795c4c7af49086` |

Both archives were parsed with `pg_restore`, fully restored into fresh
disposable databases in their respective clusters and row-count checked.
Those disposable databases were then removed. The source databases were not
restored over or reset.

Repeatable-read, read-only exports were made independently for both databases.
They are not a cross-database atomic snapshot and are not a cutover snapshot.

Roster's 12 tables contain 530 rows: 7 periods, 104 shifts, 117 assignments,
169 availability entries, 5 publication snapshots and the remaining role,
template, settings and idempotency/import records. All 530 rows were imported
into a local SQLite rehearsal database, checked field by field, and imported
again: 0 inserted / 530 unchanged. Integrity and foreign-key checks passed.

Cross-source audit found 0 assignment/availability rows with unknown canonical
employee IDs and 0 period/availability rows with unknown canonical store IDs.
Evaluate export includes 30 employees, 6 accounts, 2 stores, 51 evaluation
rounds and related historical data. All six password hashes are Argon2id.
Raw records and hashes remain in ignored local files, not tracked artifacts.

Date-only values retain their calendar dates. Prisma UTC TIMESTAMP(3) values
are converted to ISO UTC instants with `Z`. JSON snapshots remain complete;
arrays become JSON text; Decimal values remain exact text. Store timezone is
Australia/Sydney. Current rehearsal is **SQLite**, not a hosted D1 runtime
acceptance test. Evaluate schema, constraints, closed-round triggers and
cloud import are not implemented by the Roster schema generator.

## Executed validation

| Check | Actual result |
| --- | --- |
| Original frontend production build | passed |
| Original frontend tests | 580 passed, 4 failed; failures reproduced in TemplatesPage tests |
| Original backend tests, fresh PostgreSQL DB/schema | 324 passed, 0 skipped |
| Migration tests | 6 passed: round-trip, repeat, conflict rollback, cross-store FK, overlap exclusion, checksum rejection |
| CP-SAT coverage/global/week-boundary tests | 44 passed |
| Multi-agent best-effort/boundary/business-rule tests | 36 passed |
| Live local Roster `/api/health` | `ok=true`, database=true, evaluateMolly=true |
| Hosted D1 / deployed browser / real evaluator acceptance | not run |

The first isolated backend run passed 323 tests and hit the test's deliberate
disposable-schema guard. The harness was corrected to create a matching fresh
test schema; the full rerun passed 324. No guard was weakened.

The four frontend failures concern post-save refresh and returning-store
responses. Mock responses do not match the current strict mutation response
checks in several cases. No frontend guard, test expectation or user source
was changed merely to make the migration baseline green. These need resolution
before claiming release acceptance.

## Automatic scheduling

The repository has distinct native CP-SAT Lab and LLM multi-agent workflows.
The native Lab uses pinned OR-Tools 9.12.4544 and independent deterministic
validation. Current Hurstville v20 uses `EXACT_SCHEDULED` and seven explicit
weekday staffing maps. The separate multi-agent workflow has its own replay
validator and legal partial-draft behavior; it was not replaced or invoked
against a paid provider during this work.

A historical real-size snapshot was pseudonymized: 25 employees and 75
availability windows for 2026-10-26 through 2026-11-01. This is a frozen
historical sample, not a newly read live source. Under unchanged v20 rules:

- Whole week: `INFEASIBLE`, coverage eligibility shortage detected in about
  0.016 seconds before search; no draft written.
- Daily replay: 5 feasible days, each with 0 independent validation errors;
  Wednesday has an eligibility shortage, Saturday is exact-staffing infeasible.
- Each feasible day used approximately 5 seconds at the configured 5-second
  optimization budget. Peak Windows process working set was about 98 MiB.
- This result is not publishable. It does not relabel shortages as success.

`solver-service/` wraps the existing V2 native engine in a stateless FastAPI
boundary. It has no database credentials or database connection, bearer auth,
pseudonymous IDs, a 2 MB request limit, one concurrent job, a 45-second parent
process timeout and stable input hashes for retries. It never grants permission
to publish. Sites-side commit still requires current authorization, stale-source
checks and independent deterministic validation.

The Linux image `molly-roster-solver:sites` was built locally, with image digest
`sha256:af21c72626f1629738fa9a3b36a9b4efe9f76b5bbefa10ad1c72605c2a96b536`.
An isolated container limited to 1 CPU / 512 MiB passed real HTTP tests:
unauthenticated request rejected, identifying name rejected, stable retry hash,
historical week infeasibility retained, and Monday returned 7 feasible shifts
with 0 validation errors. Observed idle memory after solving was about 97 MiB;
this is not a container peak-memory measurement. The test container was stopped.

No external HTTPS solver is deployed. The user has no existing hosting entry
or credentials for it. No verified Worker-compatible OR-Tools build was found
or produced; the existing native Linux/Windows packages are not Worker modules.
Cloudflare's Python runtime uses Pyodide and only supports pure-Python packages
or compatible WebAssembly packages. This motivated the container boundary,
not a claim that every possible OR-Tools Wasm port is impossible.

References:

- https://developers.cloudflare.com/workers/languages/python/packages/
- https://developers.cloudflare.com/d1/worker-api/d1-database/

## Remaining blockers — engineering and external access are separate

1. **Engineering incomplete:** there is no Sites Worker business API yet.
   Existing Express/Prisma services, PostgreSQL advisory locks and interactive
   transactions have not been ported to D1's transactional statement batches.
   A schema conversion alone cannot preserve publication, draft commit,
   cross-store concurrency and idempotency behavior.
2. **Engineering incomplete:** Evaluate auth, Argon2 verification, account/store
   scope and workforce/CLOSED-score reads have not been ported. Evaluate's
   schema and histories have been backed up/exported, not migrated to D1.
3. **Engineering incomplete:** mock employee login/report APIs need a separate
   D1 demo store, retaining existing code shortcuts and capacity semantics.
   Existing local mock reports must never become formal employee availability.
4. **External resource absent:** native automatic scheduling needs an HTTPS
   container host and a server-side shared secret. The prepared container has
   only run locally. This blocks automatic scheduling, not the theoretical
   ability to finish a manual-only Worker.
5. **Acceptance incomplete:** hosted Hurstville draft/edit/publish/history/export
   and cross-store/retry/failure-recovery flows have not run. Four frontend
   baseline tests remain failing. Audience grants for actual staff are not set.
6. **Cutover not performed:** no formal data has reached D1; no write freeze,
   delta catch-up or post-cutover reconciliation was arranged. Do not use the
   current historical exports as a final cutover snapshot.

No publishing attempt was made because the required application and acceptance
gates are incomplete. This status must not be summarized as "deployment ready,
only waiting for permissions". The current environment demonstrably has Sites
creation access, and no publishing rejection has occurred.

## Recovery and next execution point

Continue from the existing Site ID and current local code. Retain original API
contracts and business validators while implementing the Worker/D1 adapters.
Keep mock employee rows and formal employee rows isolated. Complete manual
operations without requiring the solver host, then connect the external solver
when hosting is available. Only after hosted acceptance should formal data be
imported under a coordinated write freeze or verified delta procedure.

For now rollback is simply continued local use: neither traffic nor source data
has been switched. The original databases and verified binary backups remain.
Any later restore should target a new database, with validation before changing
connections; never overwrite the source database as a migration test.
