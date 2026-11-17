"""Structural unit tests; real Hurstville acceptance uses a separate snapshot."""

from datetime import date, datetime, timezone
from pathlib import Path

import pytest

from engine.clock import local_instant, timezone_for
from engine.models import (BreakRule, DayOverride, DayRules, ExistingShift, RuleSet,
                           ShiftPattern, Snapshot, SolveMode, SolveStatus, StaffMember, TimeWindow,
                           StaffingBand, PatternBound, ExactStaffingBand)
from engine.v2 import V2Policy, compile_coverage, replay_coverage, solve_v2


DAY = date(2026, 10, 26)
ZONE = timezone_for("Australia/Sydney")


def pattern(name, role, begin, finish, break_minutes=0):
    return ShiftPattern(name=name, role_code=role, starts=[begin], ends=[finish],
                        break_rule=BreakRule(count=int(break_minutes > 0),
                                             duration_minutes=break_minutes or 30))


def inputs(patterns, counts, employees, windows=None, existing=None):
    rules = RuleSet(store_id="v2-test", timezone=ZONE.key, version="test:v1",
        slot_minutes=60, pattern_only=True, enforce_work_rest_limits=False,
        base_day=DayRules(patterns=patterns),
        weekly={weekday: DayOverride(pattern_minimums=dict(counts)) for weekday in range(7)})
    snapshot = Snapshot(store_id=rules.store_id, timezone=ZONE.key, source="REAL",
        generated_at=datetime.now(timezone.utc), version="test-input", employees=employees,
        availability=windows or [TimeWindow(employee_id=e.id,
            start=local_instant(DAY, "10:00", ZONE),
            end=local_instant(DAY, "22:00", ZONE)) for e in employees],
        existing_shifts=existing or [])
    return rules, snapshot


def person(identity, roles, score=None):
    return StaffMember(id=identity, name=identity, store_id="v2-test",
                       qualified_roles=set(roles), score=score)


def two_layer(rules, bands, bounds=None):
    payload = rules.model_dump(mode="json")
    payload["requirement_mode"] = "PATTERN_AND_COVERAGE"
    payload["weekly_coverage"] = {str(day): [band.model_dump() for band in bands]
                                  for day in range(7)}
    payload["weekly_pattern_bounds"] = {"0": {name: bound.model_dump()
        for name, bound in (bounds or {}).items()}}
    return RuleSet.model_validate(payload)


def test_exact_scheduled_full_counts_in_every_slot_without_extra_staff():
    patterns = [pattern("Opening", "service", "10:00", "12:00"),
                pattern("Early", "service", "11:00", "12:00"),
                pattern("Full", "service", "10:00", "13:00", 30),
                pattern("Late", "service", "12:00", "13:00")]
    rules, snapshot = inputs(patterns, {name.name: 0 for name in patterns},
                             [person("a", {"service"})])
    payload = rules.current_payload()
    payload.pop("weekly", None)
    payload["slot_minutes"] = 30
    payload["requirement_mode"] = "EXACT_SCHEDULED"
    payload["weekly_exact_staffing"] = {str(day): [
        ExactStaffingBand(start="10:00", end="11:00", staff=1).model_dump(),
        ExactStaffingBand(start="11:00", end="12:00", staff=1).model_dump(),
        ExactStaffingBand(start="12:00", end="13:00", staff=1).model_dump()]
        for day in range(7)}
    with pytest.raises(ValueError, match="only weekly_exact_staffing"):
        RuleSet.model_validate({**payload, "weekly": {"0": {"pattern_minimums": {"Full": 0}}}})
    rules = RuleSet.model_validate(payload)
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert result.parameters["coverage_semantics"] == "EXACT_SCHEDULED"
    assert [shift.pattern_name for shift in result.assignments] == ["Full"]
    assert all(slot.required == slot.scheduled == 1 for slot in result.coverage)
    assert any(slot.on_break == 1 and slot.effective == 0 for slot in result.coverage)
    assert not result.validation_errors


def test_two_layer_pattern_counts_are_separate_from_effective_coverage():
    patterns = [pattern("Opening", "service", "10:00", "17:00"),
                pattern("Early", "service", "11:00", "17:00"),
                pattern("Late", "service", "17:00", "22:00")]
    rules, snapshot = inputs(patterns, {"Opening": 3, "Early": 4, "Late": 4},
                             [person(str(i), {"service"}) for i in range(11)])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="11:00", min_staff=3, target_staff=3),
        StaffingBand(start="11:00", end="17:00", min_staff=5, target_staff=5),
        StaffingBand(start="17:00", end="22:00", min_staff=4, target_staff=4)])
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert result.parameters["coverage_semantics"] == "MIN_EFFECTIVE_WITH_PATTERN_BOUNDS"
    assert sum(shift.pattern_name == "Opening" for shift in result.assignments) >= 3
    assert sum(shift.pattern_name == "Early" for shift in result.assignments) >= 4
    assert sum(shift.pattern_name == "Late" for shift in result.assignments) >= 4
    eleven = next(slot for slot in result.coverage
                  if slot.start == local_instant(DAY, "11:00", ZONE))
    assert eleven.scheduled == 7
    assert eleven.target_staff == 5 and eleven.target_excess == 2
    assert all(any('minimum' in reason or 'global objective' in reason
                   for reason in shift.reasons) for shift in result.assignments)
    assert not result.validation_errors


def test_two_layer_hard_max_conflict_identifies_pattern_overlap():
    patterns = [pattern("Opening", "service", "10:00", "17:00"),
                pattern("Early", "service", "11:00", "17:00")]
    rules, snapshot = inputs(patterns, {"Opening": 3, "Early": 4},
                             [person(str(i), {"service"}) for i in range(7)])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="11:00", min_staff=3, target_staff=3),
        StaffingBand(start="11:00", end="17:00", min_staff=5, target_staff=5, max_staff=5)])
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.INFEASIBLE
    assert any(item.code == "V2_PATTERN_COVERAGE_MAX_CONFLICT" for item in result.diagnostics)


def test_two_layer_full_zero_minimum_remains_optional_and_exact_bound_is_hard():
    patterns = [pattern("Short", "service", "10:00", "13:00"),
                pattern("Full", "all", "10:00", "13:00")]
    rules, snapshot = inputs(patterns, {"Short": 0, "Full": 0},
                             [person("a", {"service", "all"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="13:00", min_staff=1, target_staff=1)],
                      {"Full": PatternBound(exact=1)})
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert [shift.pattern_name for shift in result.assignments] == ["Full"]
    assert not result.validation_errors


def test_exact_counts_are_hard_in_best_effort_and_full_zero_is_forbidden():
    patterns = [pattern("Opening", "service", "10:00", "13:00"),
                pattern("Full", "service", "10:00", "13:00")]
    rules, snapshot = inputs(patterns, {"Opening": 2, "Full": 0},
                             [person("a", {"service"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="13:00",
                                          min_staff=1, target_staff=1)],
                      {"Opening": PatternBound(exact=2),
                       "Full": PatternBound(exact=0)})
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.INFEASIBLE
    assert result.assignments == []
    assert any(item.code == "V2_PATTERN_ELIGIBILITY_SHORTAGE"
               for item in result.diagnostics)


def test_exact_counts_cannot_relax_effective_coverage_for_breaks():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "13:00", 30)],
                             {"Opening": 1}, [person("a", {"service"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="13:00",
                                          min_staff=1, target_staff=1)],
                      {"Opening": PatternBound(exact=1)})
    rules.slot_minutes = 30
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.INFEASIBLE
    assert result.assignments == []


def test_exact_count_keeps_headcount_separate_from_break_coverage():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "13:00", 30)],
                             {"Opening": 1}, [person("a", {"service"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="13:00",
                                          min_staff=0, target_staff=1)],
                      {"Opening": PatternBound(exact=1)})
    rules.slot_minutes = 30
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert len(result.assignments) == 1
    assert sum(slot.on_break for slot in result.coverage) == 1
    assert any(slot.scheduled == 1 and slot.effective == 0
               for slot in result.coverage)
    assert not result.validation_errors


def test_two_layer_unlimited_solve_proves_all_objective_stages():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "13:00")],
                             {"Opening": 1}, [person("a", {"service"}, 80)])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="13:00",
                                          min_staff=1, target_staff=1)])
    rules.solve_seconds = 0
    assert RuleSet.model_validate_json(rules.model_dump_json()).solve_seconds == 0
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=0))
    assert result.status == SolveStatus.OPTIMAL
    assert result.parameters["priority_proven"] == 1
    assert len(result.assignments) == 1
    assert not result.validation_errors


def test_two_layer_short_paid_break_uses_finer_grid_and_removes_active_coverage():
    short = ShiftPattern(name="Short", role_code="service", starts=["10:00"], ends=["11:00"],
        break_rule=BreakRule(count=1, duration_minutes=10, granularity_minutes=10, paid=True))
    rules, snapshot = inputs([short], {"Short": 1}, [person("a", {"service"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="11:00",
        min_staff=1, target_staff=1)])
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert len(result.coverage) == 6
    assert sum(slot.gap for slot in result.coverage) == 1
    assert sum(slot.on_break for slot in result.coverage) == 1
    assert result.assignments[0].net_work_minutes == 60
    assert not result.validation_errors


def test_two_layer_opening_ending_at_16_exposes_16_to_17_gap():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "16:00"),
        pattern("Early", "service", "11:00", "17:00")],
        {"Opening": 1, "Early": 1}, [person("a", {"service"}), person("b", {"service"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="11:00", min_staff=1, target_staff=1),
        StaffingBand(start="11:00", end="17:00", min_staff=2, target_staff=2)])
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert all(slot.effective == 1 and slot.gap == 1 for slot in result.coverage
               if local_instant(DAY, "16:00", ZONE) <= slot.start < local_instant(DAY, "17:00", ZONE))
    assert not result.validation_errors


def test_two_layer_availability_cannot_be_bypassed_for_pattern_minimum():
    rules, snapshot = inputs([pattern("Early", "service", "11:00", "17:00")],
        {"Early": 1}, [person("a", {"service"})],
        windows=[TimeWindow(employee_id="a", start=local_instant(DAY, "11:00", ZONE),
                            end=local_instant(DAY, "13:00", ZONE))])
    rules = two_layer(rules, [StaffingBand(start="11:00", end="17:00",
        min_staff=1, target_staff=1)])
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert not result.assignments
    assert any(item.code == "V2_PATTERN_GAP" for item in result.diagnostics)
    assert all(slot.gap == 1 for slot in result.coverage)
    assert not result.validation_errors
    strict = solve_v2(snapshot, rules, DAY, DAY, SolveMode.STRICT,
                      V2Policy(solve_seconds=5))
    assert strict.status == SolveStatus.INFEASIBLE
    assert any(item.code == "V2_PATTERN_ELIGIBILITY_SHORTAGE" for item in strict.diagnostics)


def test_hurstville_proposal_keeps_v15_weekend_minimums_and_clocks():
    rules = RuleSet.model_validate_json((Path(__file__).resolve().parents[1]
        / "configs/hurstville-two-layer-proposal.json").read_text(encoding="utf-8"))
    assert rules.copied_from == "hurstville:v15"
    saturday, sunday = date(2026, 10, 31), date(2026, 11, 1)
    assert rules.for_date(saturday).pattern_minimums["Early"] == 7
    assert rules.for_date(saturday).pattern_minimums["Late"] == 6
    assert rules.for_date(sunday).pattern_minimums["Early"] == 7
    assert rules.for_date(sunday).pattern_minimums["Late"] == 5
    _days, coverage, errors = compile_coverage(rules, saturday, sunday, V2Policy())
    assert not errors
    for day in (saturday, sunday):
        eleven = next(slot for slot in coverage
                      if slot.day == day and slot.start == local_instant(day, "11:00", ZONE))
        assert eleven.required == 7 and eleven.target == 7


def test_two_layer_seed_reproduces_small_exact_result():
    rules, snapshot = inputs([pattern("Early", "service", "11:00", "17:00")],
        {"Early": 1}, [person("a", {"service"}, 80), person("b", {"service"}, 80)])
    rules = two_layer(rules, [StaffingBand(start="11:00", end="17:00",
        min_staff=1, target_staff=1)])
    first = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    second = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert first.status == second.status == SolveStatus.OPTIMAL
    assert [(a.employee_id,a.start,a.end,a.breaks) for a in first.assignments] == [
        (a.employee_id,a.start,a.end,a.breaks) for a in second.assignments]


def test_two_layer_locked_shift_stays_and_counts_toward_pattern_minimum():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "13:00")],
        {"Opening": 1}, [person("a", {"service"})],
        existing=[ExistingShift(employee_id="a", store_id="v2-test", role_code="service",
            status="LOCKED", start=local_instant(DAY, "10:00", ZONE),
            end=local_instant(DAY, "13:00", ZONE))])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="13:00",
        min_staff=1, target_staff=1)], {"Opening": PatternBound(maximum=1)})
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert len(result.assignments) == 1 and result.assignments[0].fixed
    assert not result.validation_errors


def test_two_layer_role_minimum_cannot_use_unqualified_employee():
    rules, snapshot = inputs([pattern("Service", "service", "10:00", "13:00"),
        pattern("Cash", "cash", "10:00", "13:00")],
        {"Service": 1, "Cash": 1}, [person("service", {"service"}),
                                    person("cash", {"cash"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="13:00",
        min_staff=2, target_staff=2, role_minimums={"service":1,"cash":1})])
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert {(item.employee_id,item.role_code) for item in result.assignments} == {
        ("service","service"),("cash","cash")}
    assert all(slot.role_effective == {"service":1,"cash":1} for slot in result.coverage)
    assert not result.validation_errors


def test_allow_early_late_start_never_invents_an_undeclared_clock():
    late = ShiftPattern(name="Late", role_code="service", starts=["16:00","17:00"],
        ends=["22:00"], allow_early_late_start=True,
        break_rule=BreakRule(count=0))
    rules, snapshot = inputs([late], {"Late":0}, [person("a", {"service"})])
    rules = two_layer(rules, [StaffingBand(start="16:00", end="22:00",
        min_staff=0, target_staff=0)])
    from engine.config import compile_rules
    from engine.candidates import generate_candidates
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    candidates, errors = generate_candidates(snapshot, rules, days)
    assert not errors
    assert {item.start.astimezone(ZONE).strftime("%H:%M") for item in candidates} == {
        "16:00","17:00"}


def test_late_available_only_from_17_exposes_16_to_17_coverage_gap():
    late = ShiftPattern(name="Late", role_code="service", starts=["16:00","17:00"],
        ends=["22:00"], allow_early_late_start=True,
        break_rule=BreakRule(count=0))
    rules, snapshot = inputs([late], {"Late":1}, [person("a", {"service"})],
        windows=[TimeWindow(employee_id="a", start=local_instant(DAY, "17:00", ZONE),
                            end=local_instant(DAY, "22:00", ZONE))])
    rules = two_layer(rules, [StaffingBand(start="16:00", end="22:00",
        min_staff=1, target_staff=1)])
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert result.assignments[0].start == local_instant(DAY, "17:00", ZONE)
    assert all(slot.gap == 1 for slot in result.coverage
               if slot.start < local_instant(DAY, "17:00", ZONE))
    assert all(slot.gap == 0 for slot in result.coverage
               if slot.start >= local_instant(DAY, "17:00", ZONE))


def test_two_layer_configured_complete_shift_minimum_blocks_one_hour_fill():
    rules, snapshot = inputs([pattern("OneHour", "service", "10:00", "11:00")],
        {"OneHour":1}, [person("a", {"service"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="11:00",
        min_staff=1, target_staff=1)])
    rules = RuleSet.model_validate({**rules.model_dump(),
        "minimum_complete_shift_minutes":180})
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert not result.assignments
    assert any(item.code == "V2_PATTERN_ELIGIBILITY_SHORTAGE" for item in result.diagnostics)
    assert not result.validation_errors


def test_two_layer_bound_cannot_silently_lower_saved_pattern_minimum():
    rules, snapshot = inputs([pattern("Early", "service", "10:00", "13:00")],
        {"Early":2}, [person("a", {"service"}),person("b", {"service"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="13:00",
        min_staff=1, target_staff=1)], {"Early": PatternBound(exact=1)})
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "V2_PATTERN_BOUNDS" for item in result.diagnostics)


def test_two_layer_allow_extra_false_caps_an_optional_pattern_at_zero():
    rules, snapshot = inputs([pattern("Full", "all", "10:00", "13:00")],
        {"Full":0}, [person("a", {"all"})])
    rules = two_layer(rules, [StaffingBand(start="10:00", end="13:00",
        min_staff=1, target_staff=1)], {"Full": PatternBound(allow_extra=False)})
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert not result.assignments
    assert all(slot.gap == 1 for slot in result.coverage)


def test_zero_count_full_is_allowed_and_replaces_three_successive_phases():
    patterns = [pattern("Opening", "service", "10:00", "11:00"),
                pattern("Early", "service", "11:00", "12:00"),
                pattern("Late", "service", "12:00", "13:00"),
                pattern("Full", "all", "10:00", "13:00")]
    rules, snapshot = inputs(patterns, {"Opening": 1, "Early": 1, "Late": 1, "Full": 0},
                             [person("a", {"service", "all"})])
    _days, requirements, errors = compile_coverage(rules, DAY, DAY, V2Policy())
    assert not errors
    assert [(x.start.astimezone(ZONE).strftime("%H:%M"), x.required)
            for x in requirements] == [("10:00", 1), ("11:00", 1), ("12:00", 1)]
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert [shift.pattern_name for shift in result.assignments] == ["Full"]
    assert not result.validation_errors
    assert all(not slot.gap for slot in result.coverage)


def test_opening_staff_must_remain_through_following_phase():
    patterns = [pattern("Opening", "service", "10:00", "16:00"),
                pattern("Early", "service", "11:00", "17:00"),
                pattern("Full", "all", "10:00", "17:00")]
    employees = [person(str(i), {"service", "all"}, 70 + i) for i in range(4)]
    windows = [TimeWindow(employee_id=item.id,
        start=local_instant(DAY, "10:00", ZONE),
        end=local_instant(DAY, "16:00", ZONE)) for item in employees]
    rules, snapshot = inputs(patterns, {"Opening": 2, "Early": 4, "Full": 0},
                             employees, windows=windows)
    result = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                      V2Policy(solve_seconds=5))
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not [shift for shift in result.assignments
                if shift.start == local_instant(DAY, "10:00", ZONE)]
    assert result.coverage[0].scheduled == 0
    assert sum(slot.gap for slot in result.coverage) > 0
    assert not result.validation_errors


def test_v2_reports_scoring_components_and_employee_credit():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
        {"Opening": 1}, [person("high", {"service"}, 90),
                          person("low", {"service"}, 70)])
    result = solve_v2(snapshot, rules, DAY, DAY,
                      policy=V2Policy(solve_seconds=5, official_score_weight=2))
    assert result.status == SolveStatus.OPTIMAL
    components = result.parameters
    assert components["metric_quality_reward"] == 3600
    assert components["metric_work_penalty"] == 1
    assert components["metric_shift_penalty"] == 1
    assert (components["metric_excess_penalty"] + components["metric_work_penalty"]
            + components["metric_shift_penalty"] + components["metric_fairness_penalty"]
            + components["metric_cost_penalty"] - components["metric_quality_reward"]
            - components["metric_pattern_preference_reward"]) == result.objective_score
    high = next(row for row in result.score_allocation if row.employee_id == "high")
    assert (high.official_score, high.candidate_shifts,
            high.credited_demand_minutes, high.credited_quality_points) == (90, 1, 60, 1800)


def test_break_changes_effective_staffing_but_not_rostered_headcount():
    patterns = [pattern("Opening", "service", "10:00", "13:00", 60),
                pattern("Cover", "service", "11:00", "12:00"),
                pattern("Full", "all", "10:00", "13:00", 60)]
    rules, snapshot = inputs(patterns, {"Opening": 1, "Cover": 0, "Full": 0},
        [person("full", {"all", "service"}), person("cover", {"service"})],
        windows=[TimeWindow(employee_id="full", start=local_instant(DAY, "10:00", ZONE),
                            end=local_instant(DAY, "13:00", ZONE)),
                 TimeWindow(employee_id="cover", start=local_instant(DAY, "11:00", ZONE),
                            end=local_instant(DAY, "12:00", ZONE))])
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert len(result.assignments) == 1
    assert all(slot.scheduled == 1 and slot.gap == 0 for slot in result.coverage)
    assert any(slot.on_break == 1 and slot.effective == 0
               and slot.effective_gap == 1 for slot in result.coverage)
    assert not result.validation_errors


def test_one_shift_per_day_prevents_two_disjoint_short_shifts():
    patterns = [pattern("Opening", "service", "10:00", "11:00"),
                pattern("Late", "service", "12:00", "13:00")]
    rules, snapshot = inputs(patterns, {"Opening": 1, "Late": 1},
                             [person("a", {"service"})])
    strict = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert strict.status == SolveStatus.INFEASIBLE
    best = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                    V2Policy(solve_seconds=5))
    assert best.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert len(best.assignments) == 1
    assert sum(slot.gap for slot in best.coverage) == 1


def test_one_all_rounder_cannot_fill_two_roles_in_one_slot():
    patterns = [pattern("Service", "service", "10:00", "11:00"),
                pattern("Cash", "cash", "10:00", "11:00"),
                pattern("Full", "all", "10:00", "11:00")]
    rules, snapshot = inputs(patterns, {"Service": 1, "Cash": 1, "Full": 0},
                             [person("a", {"service", "cash", "all"})])
    strict = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert strict.status == SolveStatus.INFEASIBLE
    best = solve_v2(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT,
                    V2Policy(solve_seconds=5))
    assert sum(slot.gap for slot in best.coverage) == 1
    assert not best.validation_errors


def test_locked_shift_is_preserved_and_counts_against_daily_cap():
    patterns = [pattern("Opening", "service", "10:00", "11:00"),
                pattern("Late", "service", "12:00", "13:00")]
    fixed = ExistingShift(employee_id="a", store_id="v2-test", role_code="service",
        status="LOCKED", start=local_instant(DAY, "10:00", ZONE),
        end=local_instant(DAY, "11:00", ZONE))
    rules, snapshot = inputs(patterns, {"Opening": 1, "Late": 1},
                             [person("a", {"service"}), person("b", {"service"})],
                             existing=[fixed])
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert {(shift.employee_id, shift.pattern_name, shift.fixed) for shift in result.assignments} == {
        ("a", "Opening", True), ("b", "Late", False)}
    assert not result.validation_errors


def test_late_only_availability_excludes_early_even_with_high_score():
    patterns = [pattern("Opening", "service", "10:00", "11:00"),
                pattern("Late", "service", "12:00", "13:00")]
    people = [person("high", {"service"}, 95), person("low", {"service"}, 70)]
    windows = [TimeWindow(employee_id="high", start=local_instant(DAY, "12:00", ZONE),
                          end=local_instant(DAY, "13:00", ZONE)),
               TimeWindow(employee_id="low", start=local_instant(DAY, "10:00", ZONE),
                          end=local_instant(DAY, "11:00", ZONE))]
    rules, snapshot = inputs(patterns, {"Opening": 1, "Late": 1}, people, windows)
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert {(shift.employee_id, shift.pattern_name) for shift in result.assignments} == {
        ("low", "Opening"), ("high", "Late")}


def test_replay_detects_missing_required_shift():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
                             {"Opening": 1}, [person("a", {"service"})])
    _days, requirements, errors = compile_coverage(rules, DAY, DAY, V2Policy())
    assert not errors
    assert replay_coverage(snapshot, [], requirements)[0].gap == 1


def test_external_store_shift_counts_against_daily_one_shift_limit():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
                             {"Opening": 1}, [person("a", {"service"})],
                             existing=[ExistingShift(employee_id="a", store_id="other",
                                 role_code="service", status="PUBLISHED",
                                 start=local_instant(DAY, "08:00", ZONE),
                                 end=local_instant(DAY, "09:00", ZONE))])
    result = solve_v2(snapshot, rules, DAY, DAY, policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.INFEASIBLE


def test_configured_weekly_cap_counts_both_days():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
                             {"Opening": 1}, [person("a", {"service"})])
    second = date(2026, 10, 27)
    snapshot.availability.append(TimeWindow(employee_id="a",
        start=local_instant(second, "10:00", ZONE),
        end=local_instant(second, "11:00", ZONE)))
    result = solve_v2(snapshot, rules, DAY, second,
                      policy=V2Policy(max_weekly_minutes=60, solve_seconds=5))
    assert result.status == SolveStatus.INFEASIBLE


def test_configured_cross_day_rest_blocks_adjacent_days():
    rules, snapshot = inputs([pattern("Late", "service", "22:00", "23:00")],
                             {"Late": 1}, [person("a", {"service"})],
                             windows=[TimeWindow(employee_id="a",
                                 start=local_instant(DAY, "22:00", ZONE),
                                 end=local_instant(DAY, "23:00", ZONE))])
    second = date(2026, 10, 27)
    rules.weekly[1].pattern_minimums = {"Late": 0, "Early": 1}
    rules.base_day.patterns.append(pattern("Early", "service", "10:00", "11:00"))
    for weekday in range(7):
        if weekday != 1:
            rules.weekly[weekday].pattern_minimums["Early"] = 0
    snapshot.availability.append(TimeWindow(employee_id="a",
        start=local_instant(second, "10:00", ZONE),
        end=local_instant(second, "11:00", ZONE)))
    result = solve_v2(snapshot, rules, DAY, second,
                      policy=V2Policy(min_rest_minutes=12 * 60, solve_seconds=5))
    assert result.status == SolveStatus.INFEASIBLE


def test_existing_hours_over_weekly_cap_fail_before_optimization():
    existing = ExistingShift(employee_id="a", store_id="other", role_code="service",
        status="PUBLISHED", start=local_instant(DAY, "08:00", ZONE),
        end=local_instant(DAY, "10:00", ZONE))
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
                             {"Opening": 1}, [person("a", {"service"})],
                             existing=[existing])
    result = solve_v2(snapshot, rules, DAY, DAY,
                      policy=V2Policy(max_weekly_minutes=60, solve_seconds=5))
    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "V2_FIXED_WEEKLY_CAP" for item in result.diagnostics)


def test_official_score_prefers_higher_scored_cover_without_mutating_source():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
        {"Opening": 1}, [person("high", {"service"}, 90),
                         person("low", {"service"}, 70)])
    result = solve_v2(snapshot, rules, DAY, DAY,
        policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert [shift.employee_id for shift in result.assignments] == ["high"]
    assert result.parameters["score_optimization"] == "ACTIVE"
    assert [person.score for person in snapshot.employees] == [90, 70]


def test_official_score_keeps_evaluate_one_decimal_precision():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
        {"Opening": 1}, [person("lower", {"service"}, 73.3),
                         person("higher", {"service"}, 73.4)])
    result = solve_v2(snapshot, rules, DAY, DAY,
        policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert [shift.employee_id for shift in result.assignments] == ["higher"]


def test_official_score_does_not_reward_unneeded_work():
    patterns = [pattern("Opening", "service", "10:00", "11:00"),
                pattern("Extra", "service", "11:00", "12:00")]
    rules, snapshot = inputs(patterns, {"Opening": 1, "Extra": 0},
        [person("high", {"service"}, 100), person("low", {"service"}, 60)])
    result = solve_v2(snapshot, rules, DAY, DAY,
        policy=V2Policy(solve_seconds=5, official_score_weight=1000,
                        excess_slot_weight=0))
    assert result.status == SolveStatus.OPTIMAL
    assert len(result.assignments) == 1
    assert result.assignments[0].pattern_name == "Opening"
    assert result.coverage[0].gap == 0


def test_default_excess_penalty_prevents_adding_high_score_to_filled_slot():
    fixed = ExistingShift(employee_id="low", store_id="v2-test", role_code="service",
        status="LOCKED", start=local_instant(DAY, "10:00", ZONE),
        end=local_instant(DAY, "11:00", ZONE))
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
        {"Opening": 1}, [person("low", {"service"}, 10),
                         person("high", {"service"}, 100)], existing=[fixed])
    result = solve_v2(snapshot, rules, DAY, DAY,
        policy=V2Policy(solve_seconds=5))
    assert result.status == SolveStatus.OPTIMAL
    assert [(shift.employee_id, shift.fixed) for shift in result.assignments] == [
        ("low", True)]
    assert result.coverage[0].excess == 0


def test_cost_weight_can_change_choice_when_all_costs_are_known():
    high = person("high", {"service"}, 90)
    low = person("low", {"service"}, 80)
    high.hourly_cost_cents = 5000
    low.hourly_cost_cents = 1000
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
        {"Opening": 1}, [high, low])
    baseline = solve_v2(snapshot, rules, DAY, DAY,
        policy=V2Policy(solve_seconds=5, labor_cost_weight=0))
    costed = solve_v2(snapshot, rules, DAY, DAY,
        policy=V2Policy(solve_seconds=5, labor_cost_weight=1))
    assert [shift.employee_id for shift in baseline.assignments] == ["high"]
    assert [shift.employee_id for shift in costed.assignments] == ["low"]
    assert costed.parameters["cost_optimization"] == "ACTIVE"
    assert not costed.validation_errors


def test_cost_optimization_rejects_missing_cost_instead_of_inventing_one():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
        {"Opening": 1}, [person("a", {"service"}, 80)])
    result = solve_v2(snapshot, rules, DAY, DAY,
        policy=V2Policy(labor_cost_weight=1))
    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "V2_MISSING_LABOR_COST" for item in result.diagnostics)


def test_expected_hours_fairness_uses_weekly_target_without_extra_work():
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
        {"Opening": 1}, [person("a", {"service"}, 80),
                         person("b", {"service"}, 80)])
    second = date(2026, 10, 27)
    snapshot.availability.extend(TimeWindow(employee_id=employee.id,
        start=local_instant(second, "10:00", ZONE),
        end=local_instant(second, "11:00", ZONE)) for employee in snapshot.employees)
    result = solve_v2(snapshot, rules, DAY, second,
        policy=V2Policy(solve_seconds=5, official_score_weight=0,
            employee_expected_weekly_minutes={"a": 210, "b": 210},
            fairness_weight=20))
    assert result.status == SolveStatus.OPTIMAL
    assert {item.employee_id for item in result.assignments} == {"a", "b"}
    assert len(result.assignments) == 2
    assert result.parameters["fairness_targets"] == 2


def test_individual_pattern_preference_changes_equal_coverage_choice():
    patterns = [pattern("Opening", "service", "10:00", "11:00"),
                pattern("Full", "all", "10:00", "11:00")]
    rules, snapshot = inputs(patterns, {"Opening": 1, "Full": 0},
        [person("a", {"service", "all"}, 80)])
    result = solve_v2(snapshot, rules, DAY, DAY,
        policy=V2Policy(solve_seconds=5, official_score_weight=0,
            employee_pattern_preferences={"a": {"Full": 5}}))
    assert result.status == SolveStatus.OPTIMAL
    assert [shift.pattern_name for shift in result.assignments] == ["Full"]
    assert result.parameters["metric_pattern_preference_points"] == 5


def test_expected_hours_fairness_counts_an_existing_fixed_shift():
    fixed = ExistingShift(employee_id="a", store_id="v2-test", role_code="service",
        status="LOCKED", start=local_instant(DAY, "10:00", ZONE),
        end=local_instant(DAY, "11:00", ZONE))
    rules, snapshot = inputs([pattern("Opening", "service", "10:00", "11:00")],
        {"Opening": 1}, [person("a", {"service"}, 90),
                         person("b", {"service"}, 70)], existing=[fixed])
    second = date(2026, 10, 27)
    snapshot.availability.extend(TimeWindow(employee_id=employee.id,
        start=local_instant(second, "10:00", ZONE),
        end=local_instant(second, "11:00", ZONE)) for employee in snapshot.employees)
    result = solve_v2(snapshot, rules, DAY, second,
        policy=V2Policy(solve_seconds=5,
            employee_expected_weekly_minutes={"a": 210, "b": 210},
            fairness_weight=500))
    assert result.status == SolveStatus.OPTIMAL
    assert {(item.employee_id, item.date, item.fixed) for item in result.assignments} == {
        ("a", DAY, True), ("b", second, False)}
    assert not result.validation_errors
