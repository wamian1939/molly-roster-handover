from datetime import date, datetime, timezone

from engine.clock import local_instant, timezone_for
from engine.models import DayOverride, DayRules, DemandSegment, RuleSet, ShiftPattern, Snapshot, SolveMode, SolveStatus, StaffMember, TimeWindow
from engine.solver import solve
from fixtures.demo import demo_snapshot


DAY = date(2026, 10, 26)


def pattern_only_rules(minimum: int = 1) -> RuleSet:
    return RuleSet(store_id="mock-hurstville", timezone="Australia/Sydney",
        pattern_only=True, enforce_work_rest_limits=False,
        base_day=DayRules(patterns=[ShiftPattern(name="Early", role_code="service",
                                                starts=["10:00"], ends=["12:00"])]),
        weekly={day: DayOverride(pattern_minimums={"Early": minimum})
                for day in range(7)})


def test_weekly_pattern_counts_are_the_only_staffing_demand():
    rules = pattern_only_rules()
    result = solve(demo_snapshot(DAY, count=1), rules, DAY, DAY)

    assert result.status == SolveStatus.OPTIMAL
    assert len(result.assignments) == 1
    assert result.parameters["pattern_only"] == 1
    assert "work_rest_limits_enabled" not in result.parameters
    assert all(slot.required == 0 for slot in result.coverage)
    assert not result.validation_errors


def test_monday_and_tuesday_have_independent_pattern_counts():
    rules = pattern_only_rules()
    rules.weekly[1].pattern_minimums = {"Early": 0}
    snapshot = demo_snapshot(DAY, count=1, days=2)

    result = solve(snapshot, rules, DAY, date(2026, 10, 27))

    assert result.status == SolveStatus.OPTIMAL
    assert [(shift.date.isoformat(), shift.pattern_name) for shift in result.assignments] == [
        ("2026-10-26", "Early")]
    assert not result.validation_errors


def test_opening_is_an_exact_shift_pattern_count_not_an_optional_start():
    rules = pattern_only_rules()
    rules.base_day.patterns = [
        ShiftPattern(name="开早", role_code="service", starts=["10:00"], ends=["17:00"]),
        ShiftPattern(name="Early", role_code="service", starts=["11:00"], ends=["17:00"]),
    ]
    for weekday in range(7):
        rules.weekly[weekday].pattern_minimums = {"开早": 3 if weekday == 0 else 0,
                                                   "Early": 1 if weekday == 0 else 0}
    zone = timezone_for("Australia/Sydney")
    employees = [StaffMember(id=f"e{i}", name=f"E{i}", store_id=rules.store_id,
        qualified_roles={"service"}) for i in range(4)]
    snapshot = Snapshot(store_id=rules.store_id, timezone=zone.key,
        generated_at=datetime.now(timezone.utc), version="opening-test", source="REAL",
        run_purpose="EXPLORATORY", comparison_mode="REPLACE_TARGET_PUBLISHED",
        employees=employees, availability=[TimeWindow(employee_id=employee.id,
            start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone))
            for employee in employees])

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status == SolveStatus.OPTIMAL
    assert sum(shift.start == local_instant(DAY, "10:00", zone)
               for shift in result.assignments) == 3
    assert {shift.pattern_name for shift in result.assignments} == {"开早", "Early"}


def test_official_score_precedes_fairness_in_pattern_allocation():
    rules = pattern_only_rules()
    rules.weights.skill = 2
    rules.weights.fairness = 100
    zone = timezone_for("Australia/Sydney")
    employees = [StaffMember(id="high", name="High", store_id=rules.store_id,
                             qualified_roles={"service"}, score=73.3),
                 StaffMember(id="low", name="Low", store_id=rules.store_id,
                             qualified_roles={"service"}, score=73.2)]
    snapshot = Snapshot(store_id=rules.store_id, timezone=zone.key,
        generated_at=datetime.now(timezone.utc), version="score-test", source="REAL",
        run_purpose="EXPLORATORY", comparison_mode="REPLACE_TARGET_PUBLISHED",
        employees=employees, availability=[TimeWindow(employee_id=employee.id,
            start=local_instant(DAY, "10:00", zone),
            end=local_instant(date(2026, 10, 27), "12:00", zone))
            for employee in employees])
    result = solve(snapshot, rules, DAY, date(2026, 10, 27))

    assert result.status == SolveStatus.OPTIMAL
    assert [shift.employee_id for shift in result.assignments] == ["high", "high"]
    assert result.parameters["objective_priority"].startswith("official_score >")
    assert [(row.employee_name, row.official_score, row.candidate_shifts)
            for row in result.score_allocation] == [
                ("High", 73.3, 2), ("Low", 73.2, 0)]


def test_pattern_count_is_the_only_staffing_target():
    rules = pattern_only_rules(minimum=2)
    snapshot = demo_snapshot(DAY, count=1)

    strict = solve(snapshot, rules, DAY, DAY)
    best_effort = solve(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT)

    assert strict.status == SolveStatus.INFEASIBLE
    assert any(item.code == "PATTERN_CANDIDATES" for item in strict.diagnostics)
    assert best_effort.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert any(item.code == "PATTERN_STAFFING_GAP" for item in best_effort.diagnostics)
    assert not best_effort.validation_errors


def test_zero_weekday_count_cannot_be_overfilled_by_preferences():
    rules = pattern_only_rules(minimum=0)
    rules.weights.unnecessary_work = 0
    result = solve(demo_snapshot(DAY, count=1), rules, DAY, DAY)

    assert result.status == SolveStatus.OPTIMAL
    assert result.assignments == []


def test_best_effort_count_cannot_be_overfilled_by_preferences():
    rules = pattern_only_rules(minimum=1)
    rules.weights.unnecessary_work = 0
    result = solve(demo_snapshot(DAY, count=2), rules, DAY, DAY, SolveMode.BEST_EFFORT)

    assert result.status == SolveStatus.OPTIMAL
    assert len(result.assignments) == 1


def test_engine_rejects_legacy_staffing_in_pattern_count_rule():
    rules = pattern_only_rules()
    rules.base_day.opening_minimum = 3
    rules.base_day.demand = [DemandSegment(start="10:00", end="12:00", minimum=3)]

    result = solve(demo_snapshot(DAY, count=3), rules, DAY, DAY)

    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "PATTERN_ONLY_RULE" for item in result.diagnostics)


def test_engine_requires_explicit_counts_for_every_weekday_and_pattern():
    rules = pattern_only_rules()
    del rules.weekly[1]

    result = solve(demo_snapshot(DAY, count=1), rules, DAY, DAY)

    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "PATTERN_ONLY_RULE" for item in result.diagnostics)


def test_engine_rejects_obsolete_work_rest_inputs_even_when_they_would_be_ignored():
    rules = pattern_only_rules()
    rules.compliance.maximum_daily_work_minutes = 30

    result = solve(demo_snapshot(DAY, count=1), rules, DAY, DAY)

    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "PATTERN_ONLY_RULE" for item in result.diagnostics)


def test_engine_rejects_obsolete_coverage_weight_even_when_there_is_no_demand():
    rules = pattern_only_rules()
    rules.weights.excess_coverage = 100

    result = solve(demo_snapshot(DAY, count=1), rules, DAY, DAY)

    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "PATTERN_ONLY_RULE" for item in result.diagnostics)
