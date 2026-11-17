# Isolated V2 scoring and preferences - 2026-10-28

## Scope and source

At the time of this comparison, the update extended `engine/v2.py` only. It did
not replace the V1 solver, change saved Lab rules or either database, write
formal shifts, or connect V2 to the production UI. The Lab UI then invoked V1
engine `0.1.29`; its 2026-10-28 23:08:39 Australia/Sydney Hurstville v15 run
returned `INFEASIBLE`. V2 was connected to real exploratory Lab runs on
2026-10-29; see `v2-lab-integration-2026-10-29.md`. The acceptance gate remains
`NOT_ELIGIBLE`.

The authenticated Hurstville snapshot for 2026-10-26 through 2026-11-01 is the
same file used for the coverage-only V1/V2 comparison. Its SHA-256 is
`b4e2b7db20c6c98519fc56c6576f802e92630f6c018becd94fb89e632fd3efa7`.
It has 25 employees, 75 availability windows, and 41 surrounding shifts.
Twenty-four employees have a current Evaluate official score. It has no
authoritative hourly costs, expected hours, or individual pattern preferences.
One employee with no official score receives no invented score bonus.

## Objective

L0 remains availability, role and skill qualification, leave, existing-shift
conflicts, at most one complete shift per day, optional explicit weekly cap,
and optional explicit cross-day rest. Break options deduct time from coverage.

L1 minimizes the missing person-slots in best-effort mode. Strict mode requires
all slots. In best-effort mode, a feasible L1 incumbent becomes a bound for L2,
so L2 cannot worsen the achieved gap. If L1 is only `FEASIBLE`, its gap is not
claimed globally minimal; `priority_proven=0` remains visible. The default
budget reserves 55% of configured solve time for L1 and the remainder for L2.

L2 minimizes this integer objective:

```
excess_weight * excess_active_person_time (scaled to 30-minute slots)
+ net_work_weight * net_work_slots
+ shift_count_weight * selected_shifts
+ cost_weight * labor_cost_in_cents
+ fairness_weight * deviation_from_explicit_expected_hours_in_slots
- official_score_weight * official_score_tenths_on_credited_demand_slots
- pattern_preference_weight * explicit_employee_pattern_preference_points
```

`official_score_tenths_on_credited_demand_slots` preserves Evaluate's one
decimal place: a 73.3 score contributes 733 units per 30 minutes of demand
actually filled, scaled for the configured slot length. The default excess
penalty is 1,000 units per extra 30-minute person-slot, so adding a second
employee to an already filled slot cannot improve the objective solely by
replacing a lower score credit with a higher one.
Each employee can be credited to only one required role in a slot. Credited
staff are capped by the requirement; unnecessary extra work cannot create
unbounded score gain. The original Evaluate score is never rewritten.

Labor cost uses the employee's net paid work minutes and known hourly cents,
converted to cents. The engine rejects `labor_cost_weight>0` unless
every candidate employee has a cost in the Snapshot, existing RuleSet employee
preference, or explicit `V2Policy.employee_hourly_cost_cents`. It does not
manufacture a fallback wage. The default cost weight is zero because this real
source has no wages.

Fairness uses explicit weekly expected minutes from `V2Policy`, the existing
RuleSet employee preference, or `StaffMember.desired_minutes`. It includes
already fixed work in the selected dates. For a partial-week run, the weekly
target is prorated by the number of selected dates. With no supplied target,
no fairness penalty is computed. Individual pattern ratings are signed integers
from -10 to +10, keyed by employee ID and pattern name; they are soft choices
and never override coverage or eligibility.

The objective weights are an explicit utility calibration, not legal or
business policy. The result records the chosen objective stage, weights,
credited quality points, credited demand slots, model gap, and independent
replay gap. Shift reasons state observed score, explicit preference, and
credited slots; they do not claim a counterfactual causal explanation.

## Real-week result with current official scores

Using the same real Snapshot and saved Hurstville v15 rule, with a 60-second V2
budget and the default weights (`official_score_weight=1`, cost weight 0):

| Metric | V1 | Scored V2 |
| --- | ---: | ---: |
| Status | FEASIBLE | FEASIBLE |
| Missing half-hour-person slots | 67 | 30 |
| Full shifts | 0 | 6 |
| Net work hours | 418 | 406 |
| Employee-hours population standard deviation | 18.24 | 16.06 |
| Validation errors | 0 | 0 |
| Final objective stage | preferences | balanced_objective |
| Official score optimization | V1's own model | ACTIVE |
| Coverage priority proven optimal | No | No |

V2's 30 missing person-slots are 10 on October 28 and 20 on October 31. Its
modeled gap and independent replay gap both equal 30. The scored run's 406 net
hours are greater than the earlier coverage-only V2 run's 387; this is a real
tradeoff under the new objective, not evidence of lower labor cost. No wage,
expected-hour, or individual preference conclusion is available from this
snapshot. Approved-leave completeness and binding work/rest policy values also
remain unconfirmed. The result cannot be published.

A same-snapshot, same-60-second-budget control changed only
`official_score_weight` from 1 to 0. Its independent quality metric sorts the
eligible, actually working employees by current official score inside each
required single-role slot and counts only the required headcount. It does not
reuse the solver's arbitrary credit choice when scoring is off.

| Real-week V2 metric | Score off | Score on |
| --- | ---: | ---: |
| Missing half-hour-person slots | 30 | 30 |
| Independent covered-score units (tenths) | 565,931 | 586,474 |
| Average score per covered person-slot | 73.12 | 75.77 |
| Full shifts | 3 | 6 |
| Net work hours | 401.5 | 406.0 |
| Final stage reached | balanced_objective | balanced_objective |
| Priority globally proven | No | No |

The score-on candidate is 3.63% higher on this independent quality measure at
the same measured gap, with 4.5 additional net work hours and a higher hours
standard deviation (16.06 versus 14.07). This shows a real effect of the score
objective under the tested budget and also exposes its labor/fairness tradeoff.
Neither candidate is proven globally optimal, and the 4.5 hours cannot be
priced without wage data.

The score-on solver's own credited quality is 586,313 units, while the
independent maximum for its selected active staff is 586,474. The 161-unit
difference is another sign that the `FEASIBLE` run did not finish optimizing
all internal credit choices. The comparison uses the independent metric for
both groups and does not claim that either schedule is optimal.

## Reproduction and optional personal policy

Use the pinned `.venv-isolated` environment with OR-Tools 9.12.4544. The
comparison script accepts an optional ignored local JSON file via
`--policy-json`; only fields of `V2Policy` are accepted. Example shape:

```json
{
  "official_score_weight": 1,
  "labor_cost_weight": 1,
  "fairness_weight": 5,
  "pattern_preference_weight": 3,
  "employee_hourly_cost_cents": {"EMPLOYEE_ID": 3000},
  "employee_expected_weekly_minutes": {"EMPLOYEE_ID": 1800},
  "employee_pattern_preferences": {"EMPLOYEE_ID": {"Full": 4, "Late": -2}}
}
```

The placeholder ID above is only the configuration contract; it was not used
in the real-week comparison. A positive cost weight requires costs for **all**
candidate employees. Source versions and employee IDs must be checked before
using any external policy file. Individual preference satisfaction in the
comparison report is reported only when such an explicit policy is supplied.

```powershell
cd 'E:\PY Study\Molly Roster\scheduling-engine'
.\.venv-isolated\Scripts\python.exe scripts\compare_v1_v2.py --snapshot .data\hurstville-real-2026-10-26-2026-11-01.json --start 2026-10-26 --end 2026-11-01 --replace-target-published --mode BEST_EFFORT --v2-seconds 60 --output .data\hurstville-v2-scored-final-2026-10-26-2026-11-01.json
```

## Verification

The new structural tests cover higher official score selection, absence of
score reward on unneeded work, a real score/cost weight tradeoff when costs are
known, rejection of missing costs, fairness with existing fixed hours, and
individual pattern preference. Real-week scoring reached the L2 stage with
zero independent validation errors. `.\scripts\test-lab.ps1 -SkipInstall`
passed 269 Python tests, the frontend source-comparison and local-time checks,
and the TypeScript/Vite build.

The Lab SQLite file changed during this work because a V1 run was saved at
23:08:39. The V2 comparison opened `rule_versions` read-only, wrote only
ignored JSON reports in `.data`, and did not save a V2 Lab run. Hurstville
v15's saved timestamp remains 2026-10-27 23:37:29 Australia/Sydney. The
real input Snapshot SHA-256 remained unchanged across the score-on/off runs.
