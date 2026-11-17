Build from the repository root, with the existing engine sources unchanged:

```powershell
docker build -f sites/roster/solver-service/Dockerfile -t molly-roster-solver:sites .
```

Run behind a hosting provider's HTTPS ingress. Inject `SOLVER_SHARED_SECRET`
as a secret of at least 32 characters, matching the Sites server secret. Bind
8080 only to the ingress, allow one concurrent job, and use a request timeout
above 45 seconds. Recommended initial resource limit: 1 CPU / 512 MiB; confirm
with production-sized benchmarks before release. No database credentials belong
in this container. `/health` reports configuration, `/v1/solve` requires bearer
authentication. The container is not deployed by building it locally.

Input fields: `snapshot`, `rules`, `from`, `to`, `mode`, `solveSeconds`.
The snapshot and rules use the existing engine models. Replace every employee
ID, including rules and interval references, with request-scoped pseudonyms and
set names equal to IDs. The caller retains the reverse map and applies current
authorization, source-version checks and deterministic validation before its
atomic D1 commit. A successful solve is a draft, never publication permission.

This boundary currently wraps the Lab CP-SAT V2 engine. It does not replace the
separate multi-agent orchestrator or claim its partial-commit behavior. The
full integration and Sites-side validator remain release blockers.
