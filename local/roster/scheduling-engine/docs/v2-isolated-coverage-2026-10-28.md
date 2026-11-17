# Isolated V2 coverage experiment - 2026-10-28

## Boundary

`engine/v2.py` is an independent CP-SAT entry point. The Lab API, React pages,
saved `RuleSet`, Lab SQLite tables, Evaluate score source, formal Roster tables,
and V1 solver are unchanged. V2 results are exploratory and are never written
to formal shifts or saved Lab runs.

The current Hurstville `hurstville:v15` rule is interpreted as **successive total
headcounts**, not additive shift quotas. Each positive weekday pattern count
defines the headcount from its latest permitted start to the next required
pattern's start; the last phase ends at its pattern end. Earlier permitted
starts remain legal shift options. `Full` is optional, so a saved count of zero
does not prohibit it. V2 rejects a positive Full count rather than silently
ignoring it.

For Monday 2026-10-26 this derives 30-minute requirements of 3 people from
10:00-11:00, 4 from 11:00-17:00, and 4 from 17:00-22:00. The requirement role
is the formal job on the defining pattern. A Full candidate can cover the
service role only when its employee also has that formal job and the role's
required skills. One employee cannot count toward two roles in one time slot.

## V2 mechanics

- Reuses V1 complete-shift candidate and legal break-option generation.
- Selects at most one complete shift per employee per local start date by
  default, including existing shifts at other stores.
- Counts only time actually worked. A selected break removes that employee
  from coverage for overlapping slots. The chosen time is a break suggestion.
- Preserves target published/locked assignments when they remain in the input;
  comparison mode detaches only target published shifts from an in-memory copy.
- Strict mode requires every role/time slot. Best-effort mode first minimizes
  missing person-slots, then minimizes excess coverage, net work, and shift
  count. `priority_proven` records whether each objective tier was proven.
- Optional weekly caps and cross-day rest are explicit `V2Policy` inputs. No
  unapproved default compliance value is treated as a business rule.
- Independently replays role matching, breaks, availability, leave, overlaps,
  fixed shifts, daily counts, configured weekly caps, and strict coverage.
- Evaluate official scores remain in the real Snapshot but are not optimized
  in this first-stage prototype.

This demand derivation is a pilot interpretation of Hurstville's saved counts.
It does not establish that every store's counts have the same meaning. The
Snapshot has no authoritative individual shift-preference feed, so that metric
is reported as unavailable.

## Reproducible real-week comparison

The comparison runner requires an authenticated REAL Hurstville Snapshot and
loads saved rule version 15 read-only. V1 and V2 receive deep copies of the
same Snapshot, period, and rule. Both are measured against the same V2-derived
coverage requirements. The report includes the input snapshot SHA-256, source
version, solver status/time, validation errors, gaps, Full count, net hours,
hours population standard deviation, and proof status.

The existing Chrome Evaluate login supplied an HttpOnly cookie automatically
to a one-use listener bound to `127.0.0.1`. The cookie was passed in memory to
the read-only adapter, never printed or saved. The local ignored `.data`
snapshot contains employee data; do not commit or share it.

The source captured on 2026-10-28 for 2026-10-26 through 2026-11-01 contains
25 employees, 75 availability windows, and 41 surrounding shifts. Its source
version is `evaluate:f40e5470d3fdbc2d0300c54321c0d39d|source:533fda477e70d266d1e0`.
The input file SHA-256 is
`b4e2b7db20c6c98519fc56c6576f802e92630f6c018becd94fb89e632fd3efa7`.
Target published shifts were removed only from each in-memory comparison copy.

| Metric | V1 | V2 |
| --- | ---: | ---: |
| Solver status | FEASIBLE | FEASIBLE |
| Validation errors | 0 | 0 |
| Missing half-hour-person slots | 67 | 30 |
| Half-hour slots with any gap | 35 | 20 |
| Full shifts | 0 | 5 |
| Total net work hours | 418.0 | 387.0 |
| Standard deviation of employee hours | 18.24 | 16.49 |
| Solver time | 15,500 ms | 30,000 ms |
| Coverage priority proven optimal | No | No |
| Individual shift preference satisfaction | Unavailable | Unavailable |

Five Full shifts were selected despite saved `Full=0`. This demonstrates that
Full is an optional candidate rather than a mandatory quota. The observed gap
and net-hour improvements are for this run under this derived demand, not a
proof of global optimality. The remaining V2 gap is 30 half-hour-person slots
(15 person-hours): 10 on October 28 and 20 on October 31. Strict full coverage
has not been demonstrated. The model
has no approved weekly cap or cross-day rest value for this comparison, and
real approved leave completeness remains outside this experiment. Acceptance
gate is `NOT_ELIGIBLE`.

Reproduce with the project's pinned OR-Tools 9.12 environment:

```powershell
cd 'E:\PY Study\Molly Roster\scheduling-engine'
.\.venv-isolated\Scripts\python.exe scripts\compare_v1_v2.py --snapshot .data\hurstville-real-2026-10-26-2026-11-01.json --start 2026-10-26 --end 2026-11-01 --rule-version 15 --replace-target-published --mode BEST_EFFORT --v2-seconds 30 --output .data\hurstville-v1-v2-2026-10-26-2026-11-01-final.json
```

To recapture later using an already logged-in browser, run
`scripts/capture_browser_snapshot.py` with the same dates, then open its
one-use loopback URL in that browser. The script refuses to overwrite a prior
snapshot. `scripts/export_real_snapshot.py` remains the local hidden-input
fallback. The unpinned `.venv` on this machine loads user-level OR-Tools 9.15
and crashed in native CP-SAT on this real case. The comparison runner now
rejects that version before solving.

## Verification

- `tests/test_v2_coverage.py`: 11 structural cases passed, including optional
  Full selection, break deduction, daily uniqueness, multi-role matching,
  locked shift preservation, availability, external-store shifts, optional
  weekly cap/cross-day rest, existing hours over a weekly cap, and independent
  gap replay.
- `scripts/test-lab.ps1 -SkipInstall`: 260 Python tests passed, including all 11
  V2 cases. Frontend comparison/time checks and TypeScript/Vite build passed.
- Real saved `hurstville:v15` compiled to 7 days and 168 required half-hour
  slots with zero configuration errors. The real same-week V1/V2 comparison
  returned exit code 0 and zero validation errors for both results.
