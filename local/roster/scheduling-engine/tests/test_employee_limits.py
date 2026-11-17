from datetime import date

import pytest
from pydantic import ValidationError

from engine.candidates import generate_candidates
from engine.clock import local_instant, timezone_for
from engine.config import compile_rules
from engine.models import AssignedShift, EmployeeLimits, ExistingShift, RuleSet, SolveStatus
from engine.solver import solve
from engine.validation import verify_result
from fixtures.demo import demo_rules, demo_snapshot


DAY = date(2026, 10, 26)


def configured_rules(employee_id: str, **limits) -> RuleSet:
    payload = demo_rules().model_dump()
    payload["employee_limits"] = {employee_id: limits}
    return RuleSet.model_validate(payload)


@pytest.mark.parametrize("limits", [
    {"maximum_daily_work_minutes": 900},
    {"maximum_weekly_work_minutes": 3000},
    {"minimum_rest_minutes": 300},
    {"maximum_shifts_per_day": 2},
])
def test_employee_override_cannot_weaken_store_hard_rule(limits):
    with pytest.raises(ValidationError):
        configured_rules("one", **limits)


def test_unknown_individual_limit_does_not_silently_disappear():
    result = solve(demo_snapshot(DAY), configured_rules("not-in-store",
        maximum_daily_work_minutes=360), DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "UNKNOWN_EMPLOYEE_LIMIT"


def test_personal_daily_cap_filters_candidates_and_validator_rejects_manual_violation():
    snapshot = demo_snapshot(DAY)
    employee = snapshot.employees[0]
    rules = configured_rules(employee.id, maximum_daily_work_minutes=360)
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors

    candidates, errors = generate_candidates(snapshot, rules, days)
    assert not errors
    early = [candidate for candidate in candidates if candidate.employee_id == employee.id
             and candidate.pattern_name == "Early"]
    assert early and all(candidate.start >= local_instant(DAY, "11:00", timezone_for(rules.timezone))
                         for candidate in early)

    zone = timezone_for(rules.timezone)
    proposed = AssignedShift(employee_id=employee.id, employee_name=employee.name,
        store_id=snapshot.store_id, date=DAY, pattern_name="Early", role_code="service",
        start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone),
        breaks=[(local_instant(DAY, "12:00", zone), local_instant(DAY, "12:30", zone))],
        net_work_minutes=390)
    assert any("Net work minutes invalid" in error for error in
               verify_result(snapshot, rules, days, [proposed], "STRICT"))


def test_published_shift_over_personal_daily_cap_fails_before_optimization():
    snapshot = demo_snapshot(DAY)
    employee = snapshot.employees[0]
    rules = configured_rules(employee.id, maximum_daily_work_minutes=360)
    zone = timezone_for(rules.timezone)
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="published",
        employee_id=employee.id, store_id=snapshot.store_id, role_code="service",
        status="PUBLISHED", start=local_instant(DAY, "10:00", zone),
        end=local_instant(DAY, "17:00", zone), break_minutes_unknown=30))

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "FIXED_WORK_CAP"


@pytest.mark.parametrize("limits", [
    {"maximum_weekly_work_minutes": 500},
    {"maximum_shifts_per_day": 1},
])
def test_personal_weekly_or_shift_count_limit_blocks_external_plus_candidate(limits):
    snapshot = demo_snapshot(DAY, count=1)
    employee = snapshot.employees[0]
    zone = timezone_for(snapshot.timezone)
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="another-store",
        employee_id=employee.id, store_id="another-store", role_code="service",
        status="PUBLISHED", start=local_instant(DAY, "05:00", zone),
        end=local_instant(DAY, "08:00", zone)))
    payload = demo_rules().model_dump()
    payload["base_day"]["patterns"] = [payload["base_day"]["patterns"][0]]
    payload["base_day"]["pattern_minimums"] = {"Early": 1}
    payload["base_day"]["opening_minimum"] = 0
    payload["base_day"]["opening_qualified_minimum"] = 0
    for segment in payload["base_day"]["demand"]:
        segment["minimum"] = 0
    payload["compliance"]["minimum_rest_minutes"] = 0
    payload["compliance"]["maximum_shifts_per_day"] = 2
    payload["employee_limits"] = {employee.id: limits}
    rules = RuleSet.model_validate(payload)

    result = solve(snapshot, rules, DAY, DAY)

    assert result.status == SolveStatus.INFEASIBLE
    assert not result.assignments


def test_personal_rest_limit_filters_early_start_after_other_store_shift():
    snapshot = demo_snapshot(DAY, count=1)
    employee = snapshot.employees[0]
    zone = timezone_for(snapshot.timezone)
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="another-store",
        employee_id=employee.id, store_id="another-store", role_code="service",
        status="PUBLISHED", start=local_instant(DAY, "05:00", zone),
        end=local_instant(DAY, "08:00", zone)))
    payload = demo_rules().model_dump()
    payload["compliance"]["minimum_rest_minutes"] = 0
    payload["employee_limits"] = {employee.id: {"minimum_rest_minutes": 180}}
    rules = RuleSet.model_validate(payload)
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors

    candidates, errors = generate_candidates(snapshot, rules, days)

    assert not errors
    early = [candidate for candidate in candidates if candidate.pattern_name == "Early"]
    assert early and all(candidate.start >= local_instant(DAY, "11:00", zone)
                         for candidate in early)
