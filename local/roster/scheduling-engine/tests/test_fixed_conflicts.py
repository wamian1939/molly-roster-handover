from datetime import date, timedelta

import pytest

from engine.clock import local_instant, timezone_for
from engine.config import compile_rules
from engine.models import AssignedShift, EmployeeLimits, ExistingShift, SolveStatus, TimeWindow
from engine.solver import solve
from engine.validation import verify_result
from fixtures.demo import demo_rules, demo_snapshot


DAY = date(2026, 10, 26)


def fixed_snapshot():
    snapshot = demo_snapshot(DAY)
    zone = timezone_for(snapshot.timezone)
    employee = snapshot.employees[0]
    target = ExistingShift(source_shift_id="target-published", employee_id=employee.id,
        store_id=snapshot.store_id, role_code="service", status="PUBLISHED",
        break_minutes_unknown=30, start=local_instant(DAY, "10:00", zone),
        end=local_instant(DAY, "17:00", zone))
    snapshot.existing_shifts.append(target)
    return snapshot, target, zone


def test_independent_validator_rejects_omitted_published_shift():
    snapshot, _target, _zone = fixed_snapshot()
    rules = demo_rules()
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors

    # BEST_EFFORT may leave demand uncovered, but it must never drop a fixed shift.
    replay_errors = verify_result(snapshot, rules, days, [], "BEST_EFFORT")

    assert any("Missing preserved fixed shift" in error for error in replay_errors)


@pytest.mark.parametrize("other_start,other_end", [
    ("2026-10-26T12:00:00+11:00", "2026-10-26T15:00:00+11:00"),
    ("2026-10-27T01:00:00+11:00", "2026-10-27T06:00:00+11:00"),
])
@pytest.mark.parametrize("external_status", ["DRAFT", "PUBLISHED"])
def test_fixed_target_conflict_with_other_store_fails_before_optimization(other_start, other_end, external_status):
    snapshot, target, _zone = fixed_snapshot()
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="other-store",
        employee_id=target.employee_id, store_id="another-store", role_code="service",
        status=external_status, start=other_start, end=other_end))
    result = solve(snapshot, demo_rules(), DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "LOCKED_SHIFT_CONFLICT"
    assert not result.assignments


def test_fixed_target_conflicting_with_approved_leave_fails_before_optimization():
    snapshot, target, zone = fixed_snapshot()
    snapshot.approved_leave.append(TimeWindow(employee_id=target.employee_id,
        start=local_instant(DAY, "12:00", zone), end=local_instant(DAY, "13:00", zone)))
    result = solve(snapshot, demo_rules(), DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "LOCKED_LEAVE_CONFLICT"


def test_fixed_target_without_formal_job_grant_fails_before_optimization():
    snapshot, target, _zone = fixed_snapshot()
    snapshot.employees[0].qualified_roles.clear()
    result = solve(snapshot, demo_rules(), DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "LOCKED_QUALIFICATION"


def test_fixed_known_break_without_matching_pay_policy_fails_closed():
    snapshot, target, zone = fixed_snapshot()
    target.end = local_instant(DAY, "18:00", zone)  # No matching Early or Full pattern.
    target.break_start = local_instant(DAY, "12:00", zone)
    target.break_end = local_instant(DAY, "12:30", zone)
    result = solve(snapshot, demo_rules(), DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "FIXED_PATTERN_MISMATCH"


def test_published_no_break_shift_cannot_bypass_configured_break_pattern():
    snapshot, target, _zone = fixed_snapshot()
    target.break_minutes_unknown = 0
    rules = demo_rules()
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "FIXED_BREAK_RULE"
    assert not result.assignments

    proposed = AssignedShift(employee_id=target.employee_id,
        employee_name=snapshot.employees[0].name, store_id=snapshot.store_id,
        date=DAY, pattern_name="Early", role_code="service",
        start=target.start, end=target.end, breaks=[], net_work_minutes=420, fixed=True)
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    assert any("legal pattern" in error for error in verify_result(snapshot, rules, days, [proposed], "STRICT"))


def test_fixed_pattern_uses_matching_break_duration_when_times_repeat():
    snapshot, target, _zone = fixed_snapshot()
    target.break_minutes_unknown = 0
    rules = demo_rules()
    no_break = rules.base_day.patterns[0].model_copy(deep=True)
    no_break.name = "EarlyNoBreak"
    no_break.break_rule.count = 0
    rules.base_day.patterns.append(no_break)
    rules.compliance.required_break_after_minutes = 420
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    fixed = next(shift for shift in result.assignments if shift.fixed)
    assert fixed.pattern_name == "EarlyNoBreak"
    assert not result.validation_errors


def test_fixed_shift_with_ambiguous_matching_break_policy_fails_closed():
    snapshot, _target, _zone = fixed_snapshot()
    rules = demo_rules()
    alternative = rules.base_day.patterns[0].model_copy(deep=True)
    alternative.name = "EarlyPaid"
    alternative.break_rule.paid = True
    rules.base_day.patterns.append(alternative)
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "FIXED_PATTERN_AMBIGUOUS"


def test_recorded_break_interval_resolves_matching_pattern_window():
    snapshot, target, zone = fixed_snapshot()
    target.break_start = local_instant(DAY, "12:00", zone)
    target.break_end = local_instant(DAY, "12:30", zone)
    rules = demo_rules()
    alternative = rules.base_day.patterns[0].model_copy(deep=True)
    alternative.name = "EarlyAfternoonBreak"
    alternative.break_rule.earliest = "14:00"
    rules.base_day.patterns.append(alternative)
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert next(shift for shift in result.assignments if shift.fixed).pattern_name == "Early"
    assert not result.validation_errors


def test_recorded_fixed_break_outside_configured_window_fails_before_optimization():
    snapshot, target, zone = fixed_snapshot()
    target.break_start = local_instant(DAY, "16:00", zone)
    target.break_end = local_instant(DAY, "16:30", zone)
    result = solve(snapshot, demo_rules(), DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "FIXED_BREAK_RULE"


@pytest.mark.parametrize("break_start_clock,seconds", [("12:15", 0), ("12:00", 30)])
def test_reviewed_fixed_break_off_grid_fails_before_optimization_and_in_validator(
        break_start_clock, seconds):
    snapshot, target, zone = fixed_snapshot()
    target.break_start = local_instant(DAY, break_start_clock, zone) + timedelta(seconds=seconds)
    target.break_end = target.break_start + timedelta(minutes=30)
    rules = demo_rules()

    result = solve(snapshot, rules, DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "LOCKED_TARGET_INPUT"

    proposed = AssignedShift(employee_id=target.employee_id,
        employee_name=snapshot.employees[0].name, store_id=snapshot.store_id,
        date=DAY, pattern_name="Early", role_code="service",
        start=target.start, end=target.end,
        breaks=[(target.break_start, target.break_end)],
        net_work_minutes=390, fixed=True)
    days, config_errors = compile_rules(rules, DAY, DAY)
    assert not config_errors
    assert any("Break does not align with staffing slots" in error
               for error in verify_result(snapshot, rules, days, [proposed], "STRICT"))


@pytest.mark.parametrize("limit_name", ["maximum_daily_work_minutes", "maximum_weekly_work_minutes"])
def test_fixed_target_alone_exceeding_work_cap_has_configuration_diagnostic(limit_name):
    snapshot, target, _zone = fixed_snapshot()
    rules = demo_rules()
    # The store pattern remains legal, but this person's 390 net minutes exceed
    # their tighter limit. This reaches the fixed-shift diagnostic after preflight.
    rules.employee_limits[target.employee_id] = EmployeeLimits(**{limit_name: 360})
    assert not compile_rules(rules, DAY, DAY)[1]
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "FIXED_WORK_CAP"


@pytest.mark.parametrize("external_status", ["DRAFT", "PUBLISHED"])
def test_other_store_minutes_count_toward_daily_cap_for_new_candidates(external_status):
    snapshot = demo_snapshot(DAY, count=1)
    zone = timezone_for(snapshot.timezone)
    employee = snapshot.employees[0]
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="other-store",
        employee_id=employee.id, store_id="another-store", role_code="service",
        status=external_status, start=local_instant(DAY, "05:00", zone),
        end=local_instant(DAY, "08:00", zone)))
    rules = demo_rules()
    rules.base_day.patterns = [rules.base_day.patterns[0]]
    rules.base_day.pattern_minimums = {"Early": 1}
    rules.base_day.opening_minimum = 0
    rules.base_day.opening_qualified_minimum = 0
    for segment in rules.base_day.demand:
        segment.minimum = 0
    rules.compliance.minimum_rest_minutes = 0
    rules.compliance.maximum_shifts_per_day = 2
    rules.compliance.maximum_daily_work_minutes = 480
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status == SolveStatus.INFEASIBLE
    assert not result.assignments
    proposed = AssignedShift(employee_id=employee.id, employee_name=employee.name,
        store_id=snapshot.store_id, date=DAY, pattern_name="Early", role_code="service",
        start=local_instant(DAY, "11:00", zone), end=local_instant(DAY, "17:00", zone),
        breaks=[(local_instant(DAY, "12:00", zone), local_instant(DAY, "12:30", zone))],
        net_work_minutes=330)
    days, configuration = compile_rules(rules, DAY, DAY)
    assert not configuration
    assert any("Daily work cap exceeded" in error
               for error in verify_result(snapshot, rules, days, [proposed], "STRICT"))


@pytest.mark.parametrize("external_status", ["DRAFT", "PUBLISHED"])
def test_independent_validator_detects_fixed_cross_store_overlap(external_status):
    snapshot, target, zone = fixed_snapshot()
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="other-store",
        employee_id=target.employee_id, store_id="another-store", role_code="service",
        status=external_status, start=local_instant(DAY, "12:00", zone),
        end=local_instant(DAY, "15:00", zone)))
    assignment = AssignedShift(employee_id=target.employee_id, employee_name=snapshot.employees[0].name,
        store_id=snapshot.store_id, date=DAY, pattern_name="Early", role_code="service",
        start=target.start, end=target.end, breaks=[(local_instant(DAY, "12:00", zone),
            local_instant(DAY, "12:30", zone))], net_work_minutes=390, fixed=True)
    days, errors = compile_rules(demo_rules(), DAY, DAY)
    assert not errors
    validation = verify_result(snapshot, demo_rules(), days, [assignment], "STRICT")
    assert any("Fixed shift conflict" in error for error in validation)
