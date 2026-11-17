from __future__ import annotations

from datetime import date, datetime, timezone

from engine.clock import local_instant, timezone_for
from engine.candidates import break_options
from engine.config import compile_rules
from engine.models import (BreakRule, ComplianceRules, DayRules, DemandSegment,
    AssignedShift, DayOverride, ExistingShift, RuleSet, ShiftPattern, Snapshot, SolveMode,
    SolveStatus, StaffMember, TimeWindow)
from engine.solver import solve
from engine.validation import verify_result


DAY = date(2026, 10, 26)
ZONE = timezone_for("Australia/Sydney")


def staff_snapshot(availability: dict[str, tuple[str, str]], overnight: bool = False) -> Snapshot:
    employees = [StaffMember(id=key, name=key, store_id="test", qualified_roles={"service"},
                             opening_qualified=key == "full") for key in availability]
    windows = [TimeWindow(employee_id=key, start=local_instant(DAY, clocks[0], ZONE),
                end=local_instant(DAY, clocks[1], ZONE, next_day=overnight))
               for key, clocks in availability.items()]
    return Snapshot(store_id="test", timezone="Australia/Sydney", generated_at=datetime.now(timezone.utc),
        version="test", employees=employees, availability=windows, source="MOCK",
        leave_data_complete=True, compliance_policy_confirmed=True)


def rules_with_late(full_break: tuple[str, str], demand: list[DemandSegment]) -> RuleSet:
    return RuleSet(store_id="test", timezone="Australia/Sydney", base_day=DayRules(
        prep_start="10:00", opening_time="10:00", closing_time="22:00", work_end="22:00",
        opening_minimum=1, opening_qualified_minimum=1, demand=demand,
        patterns=[ShiftPattern(name="Full", role_code="service", starts=["10:00"], ends=["22:00"],
            break_rule=BreakRule(count=1, duration_minutes=60, earliest=full_break[0], latest_end=full_break[1])),
            ShiftPattern(name="Late", role_code="service", starts=["16:00", "17:00"], ends=["22:00"],
                allow_early_late_start=True)]),
        compliance=ComplianceRules(minimum_shift_minutes=180, maximum_shift_minutes=720,
            maximum_daily_work_minutes=720, required_break_after_minutes=360), solve_seconds=10)


def test_break_candidates_round_up_to_coverage_grid():
    rules = rules_with_late(("12:15", "14:45"), [
        DemandSegment(start="10:00", end="22:00", minimum=1)])
    pattern = rules.base_day.patterns[0]
    choices = break_options(DAY, local_instant(DAY, "10:00", ZONE),
                            local_instant(DAY, "22:00", ZONE), rules, pattern)

    assert choices
    assert [start.astimezone(ZONE).strftime("%H:%M") for [(start, _end)] in choices] == [
        "12:30", "13:00", "13:30"]
    assert all(start >= local_instant(DAY, "12:15", ZONE)
               and end <= local_instant(DAY, "14:45", ZONE)
               for [(start, end)] in choices)


def test_break_edge_work_is_configurable_without_changing_old_saved_rules():
    rules = rules_with_late(("10:00", "22:00"), [
        DemandSegment(start="10:00", end="22:00", minimum=1)])
    pattern = rules.base_day.patterns[0]
    pattern.break_rule.duration_minutes = 30
    start = local_instant(DAY, "10:00", ZONE)
    end = local_instant(DAY, "22:00", ZONE)
    old_json = pattern.break_rule.model_dump(exclude={
        "minimum_work_before_break_slots", "minimum_work_after_break_slots",
        "minimum_work_between_breaks_slots"})
    pattern.break_rule = BreakRule.model_validate(old_json)
    default_choices = break_options(DAY, start, end, rules, pattern)
    default_starts = {interval[0][0] for interval in default_choices}
    assert start not in default_starts
    assert local_instant(DAY, "21:30", ZONE) not in default_starts

    pattern.break_rule.minimum_work_before_break_slots = 0
    pattern.break_rule.minimum_work_after_break_slots = 0
    unrestricted_starts = {interval[0][0] for interval in break_options(DAY, start, end, rules, pattern)}
    assert start in unrestricted_starts
    assert local_instant(DAY, "21:30", ZONE) in unrestricted_starts


def test_two_breaks_can_be_adjacent_only_when_gap_rule_allows_it():
    rules = rules_with_late(("12:00", "14:00"), [
        DemandSegment(start="10:00", end="22:00", minimum=1)])
    pattern = rules.base_day.patterns[0]
    pattern.break_rule.count = 2
    pattern.break_rule.duration_minutes = 30
    start = local_instant(DAY, "10:00", ZONE)
    end = local_instant(DAY, "22:00", ZONE)
    adjacent = [(local_instant(DAY, "12:00", ZONE), local_instant(DAY, "12:30", ZONE)),
                (local_instant(DAY, "12:30", ZONE), local_instant(DAY, "13:00", ZONE))]
    assert adjacent not in break_options(DAY, start, end, rules, pattern)
    pattern.break_rule.minimum_work_between_breaks_slots = 0
    assert adjacent in break_options(DAY, start, end, rules, pattern)


def test_solver_and_independent_validator_accept_configured_edge_breaks():
    snapshot = staff_snapshot({"full": ("10:00", "22:00")})
    for start_clock, end_clock, zero_margin, demand in [
        ("10:00", "10:30", "minimum_work_before_break_slots", [
            DemandSegment(start="10:00", end="10:30", minimum=0),
            DemandSegment(start="10:30", end="22:00", minimum=1)]),
        ("21:30", "22:00", "minimum_work_after_break_slots", [
            DemandSegment(start="10:00", end="21:30", minimum=1),
            DemandSegment(start="21:30", end="22:00", minimum=0)]),
    ]:
        rules = rules_with_late((start_clock, end_clock), demand)
        rules.base_day.opening_minimum = 0
        rules.base_day.opening_qualified_minimum = 0
        rules.base_day.pattern_minimums = {"Full": 1}
        rule = rules.base_day.patterns[0].break_rule
        rule.duration_minutes = 30
        setattr(rule, zero_margin, 0)

        result = solve(snapshot, rules, DAY, DAY, SolveMode.STRICT)

        assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
        assert len(result.assignments) == 1
        assert result.assignments[0].breaks == [(
            local_instant(DAY, start_clock, ZONE), local_instant(DAY, end_clock, ZONE))]
        assert not result.validation_errors
        assert not any(slot.gap for slot in result.coverage)


def test_solver_and_independent_validator_accept_configured_adjacent_breaks():
    rules = rules_with_late(("12:00", "13:00"), [
        DemandSegment(start="10:00", end="12:00", minimum=1),
        DemandSegment(start="12:00", end="13:00", minimum=0),
        DemandSegment(start="13:00", end="22:00", minimum=1)])
    rules.base_day.pattern_minimums = {"Full": 1}
    rule = rules.base_day.patterns[0].break_rule
    rule.count = 2
    rule.duration_minutes = 30
    rule.minimum_work_between_breaks_slots = 0
    snapshot = staff_snapshot({"full": ("10:00", "22:00")})

    result = solve(snapshot, rules, DAY, DAY, SolveMode.STRICT)

    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert len(result.assignments) == 1
    assert result.assignments[0].breaks == [
        (local_instant(DAY, "12:00", ZONE), local_instant(DAY, "12:30", ZONE)),
        (local_instant(DAY, "12:30", ZONE), local_instant(DAY, "13:00", ZONE))]
    assert not result.validation_errors
    assert not any(slot.gap for slot in result.coverage)


def test_break_duration_must_fit_coverage_grid():
    rules = rules_with_late(("12:00", "15:00"), [
        DemandSegment(start="10:00", end="22:00", minimum=1)])
    rules.base_day.patterns[0].break_rule.duration_minutes = 45

    _days, errors = compile_rules(rules, DAY, DAY)

    assert len(errors) == 1
    assert errors[0].code == "RULE_CONFIG"
    assert "break duration must align" in errors[0].message


def test_independent_validator_rejects_adjacent_separate_breaks():
    rules = rules_with_late(("12:00", "16:00"), [
        DemandSegment(start="10:00", end="22:00", minimum=0)])
    rules.base_day.opening_minimum = 0
    rules.base_day.opening_qualified_minimum = 0
    rules.base_day.patterns[0].break_rule.count = 2
    rules.base_day.patterns[0].break_rule.duration_minutes = 30
    snapshot = staff_snapshot({"full": ("10:00", "22:00")})
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    start = local_instant(DAY, "10:00", ZONE)
    end = local_instant(DAY, "22:00", ZONE)
    valid = AssignedShift(employee_id="full", employee_name="full", store_id="test", date=DAY,
        pattern_name="Full", role_code="service", start=start, end=end,
        breaks=[(local_instant(DAY, "12:00", ZONE), local_instant(DAY, "12:30", ZONE)),
                (local_instant(DAY, "13:00", ZONE), local_instant(DAY, "13:30", ZONE))],
        net_work_minutes=660)
    assert not verify_result(snapshot, rules, days, [valid], SolveMode.STRICT)
    adjacent = valid.model_copy(update={"breaks": [valid.breaks[0],
        (local_instant(DAY, "12:30", ZONE), local_instant(DAY, "13:00", ZONE))]})
    assert any("break rule" in error for error in verify_result(
        snapshot, rules, days, [adjacent], SolveMode.STRICT))


def test_break_forces_late_start_to_move_earlier():
    rules = rules_with_late(("16:00", "17:00"), [
        DemandSegment(start="10:00", end="16:00", minimum=1),
        DemandSegment(start="16:00", end="17:00", minimum=2),
        DemandSegment(start="17:00", end="22:00", minimum=1)])
    snapshot = staff_snapshot({"full": ("10:00", "22:00"), "late-a": ("16:00", "22:00"),
                               "late-b": ("16:00", "22:00")})
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not result.validation_errors
    assert all(slot.effective >= slot.required for slot in result.coverage)
    late = [item for item in result.assignments if item.pattern_name == "Late"]
    assert len(late) == 2
    assert all(item.start.astimezone(ZONE).hour == 16 for item in late)
    assert next(item for item in result.assignments if item.pattern_name == "Full").breaks[0][0].astimezone(ZONE).hour == 16


def test_late_starts_at_seventeen_when_early_presence_is_not_needed():
    rules = rules_with_late(("12:00", "13:00"), [
        DemandSegment(start="10:00", end="12:00", minimum=1),
        DemandSegment(start="12:00", end="13:00", minimum=0),
        DemandSegment(start="13:00", end="17:00", minimum=1),
        DemandSegment(start="17:00", end="22:00", minimum=2)])
    snapshot = staff_snapshot({"full": ("10:00", "22:00"), "late": ("16:00", "22:00")})
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    late = next(item for item in result.assignments if item.pattern_name == "Late")
    assert late.start.astimezone(ZONE).hour == 17


def test_late_start_preference_uses_time_not_input_order():
    rules = rules_with_late(("12:00", "13:00"), [
        DemandSegment(start="10:00", end="12:00", minimum=1),
        DemandSegment(start="12:00", end="13:00", minimum=0),
        DemandSegment(start="13:00", end="17:00", minimum=1),
        DemandSegment(start="17:00", end="22:00", minimum=2)])
    rules.base_day.patterns[1].starts = ["17:00", "16:00"]
    rules.weights.excess_coverage = 0
    rules.weights.unnecessary_work = 0
    rules.weights.fairness = 0
    rules.weights.skill = 0
    rules.weights.regular_pattern = 0
    rules.weights.stability = 0
    rules.weights.early_late_start = 100
    snapshot = staff_snapshot({"full": ("10:00", "22:00"), "late": ("16:00", "22:00")})

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not result.validation_errors
    late = next(item for item in result.assignments if item.pattern_name == "Late")
    assert late.start.astimezone(ZONE).hour == 17


def test_cross_midnight_full_shift_and_local_date():
    rules = RuleSet(store_id="test", timezone="Australia/Sydney", base_day=DayRules(
        prep_start="22:00", opening_time="22:00", closing_time="02:00", closing_next_day=True,
        work_end="02:00", work_end_next_day=True, opening_minimum=1, opening_qualified_minimum=1,
        demand=[DemandSegment(start="22:00", end="02:00", end_next_day=True, minimum=1)],
        patterns=[ShiftPattern(name="Night", role_code="service", starts=["22:00"], ends=["02:00"], end_next_day=True)]),
        compliance=ComplianceRules(minimum_shift_minutes=180, maximum_shift_minutes=720,
            required_break_after_minutes=360))
    snapshot = staff_snapshot({"full": ("22:00", "02:00")}, overnight=True)
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert len(result.assignments) == 1
    shift = result.assignments[0]
    assert shift.date == DAY
    assert shift.start.astimezone(ZONE).date() == DAY
    assert shift.end.astimezone(ZONE).date() > DAY
    assert shift.net_work_minutes == 240


def test_cross_midnight_demand_can_change_after_midnight():
    rules = RuleSet(store_id="test", timezone="Australia/Sydney", base_day=DayRules(
        prep_start="22:00", opening_time="22:00", closing_time="02:00", closing_next_day=True,
        work_end="02:00", work_end_next_day=True, opening_minimum=1,
        demand=[DemandSegment(start="22:00", end="00:00", end_next_day=True, minimum=1),
                DemandSegment(start="00:00", start_next_day=True, end="02:00",
                              end_next_day=True, minimum=2)],
        patterns=[ShiftPattern(name="Night", role_code="service", starts=["22:00"],
                               ends=["02:00"], end_next_day=True)]),
        compliance=ComplianceRules(minimum_shift_minutes=180, maximum_shift_minutes=720,
                                   required_break_after_minutes=360))
    snapshot = staff_snapshot({"full": ("22:00", "02:00"),
                               "second": ("22:00", "02:00")}, overnight=True)

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}, result.diagnostics
    assert not result.validation_errors
    assert len(result.assignments) == 2
    assert [slot.required for slot in result.coverage] == [1] * 4 + [2] * 4
    assert all(slot.gap == 0 for slot in result.coverage)


def test_previous_day_published_night_shift_keeps_untimed_break():
    previous = DAY.fromordinal(DAY.toordinal() - 1)
    rules = RuleSet(store_id="test", timezone="Australia/Sydney", base_day=DayRules(
        prep_start="00:00", opening_time="00:00", closing_time="04:00", work_end="04:00",
        opening_minimum=1, opening_qualified_minimum=1,
        demand=[DemandSegment(start="00:00", end="02:00", minimum=1),
                DemandSegment(start="02:00", end="04:00", minimum=0)],
        patterns=[ShiftPattern(name="Early", role_code="service", starts=["00:00"], ends=["04:00"])]),
        weekly={6: DayOverride(prep_start="22:00", opening_time="22:00", closing_time="02:00",
            closing_next_day=True, work_end="02:00", work_end_next_day=True,
            demand=[DemandSegment(start="22:00", end="02:00", end_next_day=True, minimum=1)],
            patterns=[ShiftPattern(name="Night", role_code="service", starts=["22:00"],
                ends=["02:00"], end_next_day=True, break_rule=BreakRule(count=1,
                    duration_minutes=30, earliest="23:00", latest_end="01:30",
                    latest_end_next_day=True))])},
        compliance=ComplianceRules(minimum_shift_minutes=180, maximum_shift_minutes=720,
            required_break_after_minutes=360))
    snapshot = Snapshot(store_id="test", timezone="Australia/Sydney",
        generated_at=datetime.now(timezone.utc), version="overnight-fixed",
        employees=[StaffMember(id="night-worker", name="Night worker", store_id="test",
            qualified_roles={"service"}, opening_qualified=True)], availability=[], source="MOCK",
        existing_shifts=[ExistingShift(employee_id="night-worker", store_id="test", role_code="service",
            status="PUBLISHED", start=local_instant(previous, "22:00", ZONE),
            end=local_instant(previous, "02:00", ZONE, next_day=True), break_minutes_unknown=30)])

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}, result.diagnostics
    assert not result.validation_errors
    assert len(result.assignments) == 1 and result.assignments[0].fixed
    assert result.assignments[0].date == previous
    assert result.assignments[0].pattern_name == "Night"
    assert result.assignments[0].break_time_inferred is True
    assert result.assignments[0].breaks[0][0].astimezone(ZONE).date() == previous
    assert all(slot.gap == 0 for slot in result.coverage)

    _days, overlapping_errors = compile_rules(rules, previous, DAY)
    assert any(error.code == "OVERLAPPING_WORK_DAYS" for error in overlapping_errors)

    compiled, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    assert not verify_result(snapshot, rules, compiled, result.assignments, result.mode)
    covered = solve(snapshot, rules, DAY, DAY)
    assert covered.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not covered.validation_errors
