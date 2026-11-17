from datetime import date

from engine.models import DayRules, DemandSegment, RuleSet, ShiftPattern, SolveStatus
from engine.solver import solve
from fixtures.demo import demo_snapshot


DAY = date(2026, 10, 26)


def two_shift_rules(second_start: str) -> RuleSet:
    return RuleSet(store_id="mock-hurstville", timezone="Australia/Sydney",
        enforce_work_rest_limits=False,
        base_day=DayRules(prep_start="10:00", opening_time="10:00",
            closing_time="14:00", work_end="14:00", opening_minimum=1,
            pattern_minimums={"Early": 1, "Late": 1},
            demand=[DemandSegment(start="10:00", end="14:00", minimum=1)],
            patterns=[ShiftPattern(name="Early", role_code="service", starts=["10:00"], ends=["12:00"]),
                      ShiftPattern(name="Late", role_code="service", starts=[second_start], ends=["14:00"])]))


def test_disabling_numeric_limits_allows_adjacent_shifts_but_still_checks_overlap():
    snapshot = demo_snapshot(DAY, count=1)
    rules = two_shift_rules("12:00")
    rules.compliance.maximum_shifts_per_day = 1
    rules.compliance.minimum_rest_minutes = 600
    rules.compliance.maximum_daily_work_minutes = 180
    rules.compliance.maximum_weekly_work_minutes = 180

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status == SolveStatus.OPTIMAL
    assert len(result.assignments) == 2
    assert result.parameters["work_rest_limits_enabled"] == 0
    assert not result.validation_errors

    overlap_rules = two_shift_rules("11:00")
    overlap = solve(snapshot, overlap_rules, DAY, DAY)
    assert overlap.status == SolveStatus.INFEASIBLE


def test_legacy_numeric_limits_remain_effective_for_historical_rules():
    snapshot = demo_snapshot(DAY, count=1)
    rules = two_shift_rules("12:00")
    rules.enforce_work_rest_limits = True
    rules.compliance.minimum_shift_minutes = 15
    rules.compliance.minimum_rest_minutes = 600
    rules.compliance.required_break_after_minutes = 300

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status == SolveStatus.INFEASIBLE
    assert result.parameters["work_rest_limits_enabled"] == 1
