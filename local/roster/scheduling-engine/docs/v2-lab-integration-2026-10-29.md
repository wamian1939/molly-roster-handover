# V2 Lab real-week integration - 2026-10-29

## Cause of the empty calendar

The 2026-10-29 22:25 Australia/Sydney Hurstville run used V1 `0.1.29` in
`STRICT` mode. V1 required four independent `Early` shifts on Wednesday
2026-10-28, but only three staff had a complete eligible availability window.
The saved run was `INFEASIBLE` with zero assignments and diagnostic
`PATTERN_CANDIDATES`. The whole week was blank even though other days could
be staffed. This was a property of the old exact pattern-count model, not a
failure to read the real source.

## Change

For REAL `EXPLORATORY` Lab requests, `/api/solve` now calls the V2 coverage
solver with the saved RuleSet and current authenticated Snapshot. The user
interface defaults to `BEST_EFFORT`; an explicit `STRICT` selection is still
honored. Saved `skill`, `fairness`, `labor_cost`, `unnecessary_work`, and solve
time values map into `V2Policy`. Cost optimization fails closed when costs are
missing. MOCK and historical V1 results retain their existing route and
version. The Lab run remains detached from formal roster writes and stores
only a versioned exploratory result in the Lab database.

The week view renders every day's complete shifts before diagnostics. The
metric shows missing person-slots; each missing slot remains in the coverage
data and diagnostics. Loading an old strict history run no longer silently
switches the next solve back to strict mode. The result context shows its
actual engine version.

The Lab opens on the calendar and restores the latest nonempty V2 exploratory
run for the current week on refresh. This avoids showing an older strict,
empty run by default. Its saved run ID, dates, rule version, source version,
and engine version remain visible, so it is clear this is a historical
candidate, not a fresh solve or a published roster.

## Real Hurstville browser run

The browser used saved `hurstville:v15` and read the live 2026-10-26 through
2026-11-01 source: 25 employees, 75 availability windows, 41 surrounding
shifts. Run `f3589da9-142a-4b8b-b237-55fb448f581b` returned `FEASIBLE`
with 64 complete shifts. All seven days have assignments:

| Date | Complete shifts | Missing half-hour-person slots |
| --- | ---: | ---: |
| 2026-10-26 | 8 | 0 |
| 2026-10-27 | 8 | 0 |
| 2026-10-28 | 7 | 10 |
| 2026-10-29 | 10 | 0 |
| 2026-10-30 | 10 | 0 |
| 2026-10-31 | 10 | 20 |
| 2026-11-01 | 11 | 0 |

Model and independent replay both counted 30 missing person-slots;
`validation_errors=[]`, `score_optimization=ACTIVE`,
`objective_stage=balanced_objective`. `priority_proven=0`: the time-limited
solver found a feasible schedule but did not prove minimum gap or global
optimality. Approved-leave review was `UNKNOWN`, and acceptance remains
`NOT_ELIGIBLE`. The run replaced 41 target published assignments only in its
detached Lab comparison copy; it did not alter the published roster.

## Verification

`tests/test_lab_api.py` passed 59 tests after the route change. The live
browser showed all seven vertical day boards and the saved V2 run's 64 shifts
and 30 gaps. The full `scripts/test-lab.ps1 -SkipInstall` gate passed:
269 Python tests, both UI script suites, TypeScript check, and Vite build.
After the restore change, the focused 59 API tests and TypeScript/Vite build
passed. Reloading the previously empty Chrome Lab tab automatically showed
the saved V2 run, all seven day headings, 64 shifts, and 30 person-slots of gap.

The later opening-count correction and score breakdown are audited in
[`v2-opening-score-audit-2026-10-29.md`](v2-opening-score-audit-2026-10-29.md).
