# Hurstville V2 opening and score audit — 2026-10-29

Saved rule `hurstville:v15` sets opening count to 3 on all seven weekdays.
The previous V2 run treated this as minimum coverage, so the number of 10:00
starters was 4, 4, 3, 3, 4, 6, and 7. That did not match the user's intended
opening headcount.

The solver now caps all complete shifts present in the first required slot
at the saved count. A Full shift occupies one of those places. It still
requires effective coverage of 3, excluding breaks; in best-effort mode a
shortage is reported as a gap. Later phases remain coverage-driven. An
independent validation pass checks the opening headcount in returned shifts.

The real 2026-10-26 through 2026-11-01 run
`728d133d-1551-432d-8d38-c5ae37914fa3` used 25 employees, 75
availability windows, Evaluate formal scores, and saved v15 rules. It did
not write to formal Roster tables.

| Day | Opening pattern | Full at 10:00 | Total at 10:00 | Effective first slot | Gap person-slots |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-10-26 | 2 | 1 | 3 | 3 | 0 |
| 2026-10-27 | 3 | 0 | 3 | 3 | 0 |
| 2026-10-28 | 2 | 1 | 3 | 3 | 10 |
| 2026-10-29 | 3 | 0 | 3 | 3 | 0 |
| 2026-10-30 | 3 | 0 | 3 | 3 | 0 |
| 2026-10-31 | 2 | 1 | 3 | 3 | 20 |
| 2026-11-01 | 2 | 1 | 3 | 3 | 0 |

The result has 67 complete shifts and 30 missing half-hour-person slots;
model and independent replay agree, and validation errors are empty.

## Exact score for this run

Best effort first minimizes missing coverage. The 30-gap stage was FEASIBLE,
not proven optimal. The second stage minimizes the following integer
objective subject to a gap bound of at most 30:

| Term | Calculation | Value |
| --- | --- | ---: |
| Excess coverage | 48 excess half-hour-person slots × 1000 | +48,000 |
| Net work | 813 half-hour slots × saved weight 10 | +8,130 |
| Shift count | 67 selected candidate shifts × default weight 1 | +67 |
| Fairness | 0 configured expected-hour targets | 0 |
| Labor cost | saved cost weight 0 | 0 |
| Official quality | 579,439 unweighted points × saved score weight 2 | −1,158,878 |
| Pattern preference | 0 configured preferences | 0 |
| **Reported objective** | sum of the above | **−1,102,681** |

For each person and credited demand interval, quality points are
`round(official_score × 10 × interval_minutes / 30)`. A person can receive
at most one role credit in an interval; credits cannot exceed required
headcount. Breaks and excess staff do not earn quality points. The 24
employees with formal scores keep their Evaluate values; the one without
a score receives no invented quality reward. For example, HandoverEmployee007's 95.0
score and 3,750 credited minutes yield 118,750 unweighted points and
237,500 weighted reward. This is one contribution to the global objective,
not an independent guarantee of seven shifts.

The displayed objective is an optimization value, not a 0–100 employee
score. `priority_proven=0` means the time-limited solver did not prove the
smallest possible gap or the global best objective. Approved leave remains
unreviewed; acceptance is `NOT_ELIGIBLE`.

Availability and role qualification filter legal candidates; they do not
recalculate the Evaluate score. This run had no configured expected-hour
targets or pattern preferences, so fairness weight 1 had no effect. Cost
weight was 0. Historical rule fields for regular-pattern, early-late-start,
and stability weights are not mapped into V2; the Lab editor now shows only
the four weights that the V2 route actually reads.

## Verification

The full `scripts/test-lab.ps1 -SkipInstall` gate passed: 271 Python tests,
both UI script suites, TypeScript, and Vite build. Reloading the real Lab
Chrome tab restored this run and displayed `10:00 开班 3/3 人（全天班计入）` on all
seven day headers. The score panel displayed the exact component values above
and 25 per-employee rows. Independent coverage replay matched the solver's
30-gap count, and `validation_errors=[]`.
