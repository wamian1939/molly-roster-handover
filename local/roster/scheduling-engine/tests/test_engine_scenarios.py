from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timedelta, timezone

import pytest

from adapters.reference import comparison_snapshot
from engine.candidates import generate_candidates
from engine.clock import ClockError, local_instant, minutes_between, timezone_for
from engine.config import compile_rules
from engine.models import (AssignedShift, ComplianceRules, DayOverride, DayRules, DemandSegment,
                           ExistingShift, RuleSet, ShiftPattern, Snapshot, SolveMode, SolveStatus,
                           StaffMember, TimeWindow)
from engine.solver import solve
from engine.validation import verify_result
from fixtures.demo import demo_rules, demo_snapshot


DAY = date(2026, 10, 26)


@pytest.fixture(scope="module")
def baseline():
    result = solve(demo_snapshot(DAY), demo_rules(), DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not result.validation_errors
    return result


def test_complete_shifts_and_opening_continuity(baseline):
    zone = timezone_for("Australia/Sydney")
    assert all((item.end - item.start).total_seconds() >= 3 * 3600 for item in baseline.assignments)
    first = next(slot for slot in baseline.coverage if slot.start.astimezone(zone).hour == 10)
    second = next(slot for slot in baseline.coverage if slot.start.astimezone(zone).hour == 11)
    assert first.effective >= 3
    assert second.effective >= 5
    early = {item.employee_id for item in baseline.assignments if item.start.astimezone(zone).hour == 10}
    assert early
    assert early <= {item.employee_id for item in baseline.assignments if item.start <= second.start < item.end}


def test_opening_staff_and_qualification_hold_throughout_preparation():
    zone = timezone_for("Australia/Sydney")
    rules = RuleSet(store_id="long-prep", timezone="Australia/Sydney", slot_minutes=60,
        base_day=DayRules(prep_start="10:00", opening_time="14:00", closing_time="17:00",
            work_end="17:00", opening_minimum=2, opening_qualified_minimum=1,
            demand=[DemandSegment(start="10:00", end="13:00", minimum=2),
                    DemandSegment(start="13:00", end="17:00", minimum=1)],
            patterns=[ShiftPattern(name="Early", role_code="service", starts=["10:00"], ends=["13:00"]),
                      ShiftPattern(name="Late", role_code="service", starts=["13:00"], ends=["17:00"])]),
        compliance=ComplianceRules(required_break_after_minutes=300), solve_seconds=5)
    snapshot = Snapshot(store_id="long-prep", timezone="Australia/Sydney",
        generated_at=datetime.now(timezone.utc), version="long-prep", source="MOCK",
        employees=[StaffMember(id=f"person-{index}", name=f"Person {index}", store_id="long-prep",
                               qualified_roles={"service"}, opening_qualified=index < 2)
                   for index in range(3)],
        availability=[TimeWindow(employee_id=f"person-{index}",
                                 start=local_instant(DAY, "10:00" if index < 2 else "13:00", zone),
                                 end=local_instant(DAY, "13:00" if index < 2 else "17:00", zone))
                      for index in range(3)])

    strict = solve(snapshot, rules, DAY, DAY, SolveMode.STRICT)
    assert strict.status == SolveStatus.INFEASIBLE
    assert any(item.code == "OPENING_CANDIDATES" and item.start == local_instant(DAY, "13:00", zone)
               for item in strict.diagnostics)
    assert any(item.code == "OPENING_QUALIFIED_CANDIDATES" and item.start == local_instant(DAY, "13:00", zone)
               for item in strict.diagnostics)

    best_effort = solve(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT)
    assert best_effort.status in {SolveStatus.FEASIBLE, SolveStatus.OPTIMAL}
    assert not best_effort.validation_errors
    assert all(slot.gap == 0 for slot in best_effort.coverage)
    assert any(item.code == "OPENING_STAFFING_GAP" and item.start == local_instant(DAY, "13:00", zone)
               for item in best_effort.diagnostics)
    assert any(item.code == "OPENING_QUALIFICATION_GAP" and item.start == local_instant(DAY, "13:00", zone)
               for item in best_effort.diagnostics)
    compiled, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    replay_errors = verify_result(snapshot, rules, compiled, best_effort.assignments, SolveMode.STRICT)
    instant = local_instant(DAY, "13:00", zone).isoformat()
    assert any(f"Opening headcount gap at {instant}" in error for error in replay_errors)
    assert any(f"Opening qualification gap at {instant}" in error for error in replay_errors)


def test_opening_time_must_align_with_staffing_grid():
    rules = demo_rules()
    rules.base_day.opening_time = "11:15"
    result = solve(demo_snapshot(DAY), rules, DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "RULE_CONFIG" and "Opening time must align" in item.message
               for item in result.diagnostics)


@pytest.mark.parametrize("segment_index,field,value", [
    (0, "start", "09:30"),
    (-1, "end", "22:30"),
])
def test_demand_outside_complete_work_window_is_rejected(segment_index, field, value):
    rules = demo_rules()
    setattr(rules.base_day.demand[segment_index], field, value)

    result = solve(demo_snapshot(DAY), rules, DAY, DAY)

    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "RULE_CONFIG" and "outside" in item.message.lower()
               for item in result.diagnostics)


def test_breaks_are_deducted_from_every_affected_slot(baseline):
    assert any(item.breaks for item in baseline.assignments)
    assert any(slot.on_break for slot in baseline.coverage)
    assert all(slot.effective == slot.scheduled - slot.on_break and slot.gap == 0 for slot in baseline.coverage)


@pytest.mark.parametrize("external_status", ["DRAFT", "PUBLISHED"])
def test_candidate_filtering_availability_and_other_store_conflict(external_status):
    rules = demo_rules()
    snapshot = demo_snapshot(DAY)
    first = snapshot.employees[0].id
    zone = timezone_for(rules.timezone)
    snapshot.availability = [window for window in snapshot.availability if window.employee_id != first]
    snapshot.availability.append(TimeWindow(employee_id=first, start=local_instant(DAY, "11:00", zone),
                                            end=local_instant(DAY, "23:00", zone)))
    snapshot.existing_shifts.append(ExistingShift(employee_id=snapshot.employees[1].id, store_id="other-store",
        start=local_instant(DAY, "12:00", zone), end=local_instant(DAY, "18:00", zone), status=external_status))
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    candidates, errors = generate_candidates(snapshot, rules, days)
    assert not errors
    assert all(item.start.astimezone(zone).hour != 10 for item in candidates if item.employee_id == first)
    assert not any(item.employee_id == snapshot.employees[1].id for item in candidates)


def test_insufficient_openers_strict_and_best_effort():
    rules = demo_rules()
    snapshot = demo_snapshot(DAY)
    zone = timezone_for(rules.timezone)
    keep = {person.id for person in snapshot.employees[:2]}
    snapshot.availability = [TimeWindow(employee_id=window.employee_id,
        start=window.start if window.employee_id in keep else local_instant(DAY, "11:00", zone),
        end=window.end) for window in snapshot.availability]
    strict = solve(snapshot, rules, DAY, DAY, SolveMode.STRICT)
    assert strict.status == SolveStatus.INFEASIBLE
    assert any(item.code == "OPENING_CANDIDATES" for item in strict.diagnostics)
    relaxed = solve(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT)
    assert relaxed.status in {SolveStatus.FEASIBLE, SolveStatus.OPTIMAL}
    assert any(item.code == "STAFFING_GAP" for item in relaxed.diagnostics)


def test_best_effort_reports_role_gap_even_when_total_headcount_is_met():
    zone = timezone_for("Australia/Sydney")
    rules = RuleSet(store_id="role-test", timezone="Australia/Sydney", base_day=DayRules(
        prep_start="10:00", opening_time="10:00", closing_time="13:00", work_end="13:00",
        opening_minimum=1, demand=[DemandSegment(start="10:00", end="13:00", minimum=1,
                                                   role_minimums={"manager": 1})],
        patterns=[ShiftPattern(name="Service", role_code="service", starts=["10:00"], ends=["13:00"]),
                  ShiftPattern(name="Manager", role_code="manager", starts=["10:00"], ends=["13:00"])]),
        compliance=ComplianceRules(required_break_after_minutes=300), solve_seconds=5)
    snapshot = Snapshot(store_id="role-test", timezone="Australia/Sydney",
        generated_at=datetime.now(timezone.utc), version="role-only-gap", source="MOCK",
        employees=[StaffMember(id="service-person", name="Service person", store_id="role-test",
                               qualified_roles={"service"})],
        availability=[TimeWindow(employee_id="service-person",
                                 start=local_instant(DAY, "10:00", zone),
                                 end=local_instant(DAY, "13:00", zone))])

    result = solve(snapshot, rules, DAY, DAY, SolveMode.BEST_EFFORT)

    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert result.assignments
    assert all(slot.gap == 0 and slot.role_required == {"manager": 1}
               and slot.role_effective == {"manager": 0} for slot in result.coverage)
    assert any(item.code == "STAFFING_GAP" and "manager: 1" in item.message
               for item in result.diagnostics)


def test_availability_change_changes_candidates():
    rules = demo_rules()
    before = demo_snapshot(DAY)
    after = deepcopy(before)
    after.availability = [window for window in after.availability if window.employee_id != after.employees[0].id]
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    old, _ = generate_candidates(before, rules, days)
    new, _ = generate_candidates(after, rules, days)
    assert any(item.employee_id == before.employees[0].id for item in old)
    assert not any(item.employee_id == before.employees[0].id for item in new)


def test_same_input_is_reproducible(baseline):
    other = solve(demo_snapshot(DAY), demo_rules(), DAY, DAY)
    def normalize(result):
        return [(shift.employee_id, shift.pattern_name, shift.start, shift.end, shift.breaks)
                for shift in result.assignments]
    assert normalize(baseline) == normalize(other)


def test_missing_demand_is_configuration_error():
    rules = demo_rules()
    rules.base_day.demand.pop(2)
    result = solve(demo_snapshot(DAY), rules, DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert any(item.code == "RULE_CONFIG" for item in result.diagnostics)


def test_role_staffing_demand_requires_a_matching_complete_shift_pattern():
    rules = demo_rules()
    rules.base_day.demand[0].role_minimums = {"manager": 1}

    _days, errors = compile_rules(rules, DAY, DAY)

    assert any(error.code == "RULE_CONFIG" and "manager" in error.message
               for error in errors)


def test_second_store_with_different_hours_uses_same_solver(baseline):
    other_day = date(2026, 10, 27)
    rules = demo_rules("mock-city")
    rules.base_day.prep_start = "12:00"
    rules.base_day.opening_time = "12:30"
    rules.base_day.closing_time = "20:00"
    rules.base_day.work_end = "20:00"
    rules.base_day.demand = [DemandSegment(start="12:00", end="16:00", minimum=2),
                             DemandSegment(start="16:00", end="20:00", minimum=2)]
    rules.base_day.opening_minimum = 2
    early, full, late = rules.base_day.patterns
    early.starts, early.ends, early.break_rule.count = ["12:00"], ["16:00"], 0
    full.starts, full.ends = ["12:00"], ["20:00"]
    full.break_rule.earliest, full.break_rule.latest_end = "14:00", "18:00"
    late.starts, late.ends, late.break_rule.count = ["16:00"], ["20:00"], 0
    snapshot = demo_snapshot(other_day, "mock-city", count=7)
    result = solve(snapshot, rules, other_day, other_day)
    assert result.status in {SolveStatus.FEASIBLE, SolveStatus.OPTIMAL}
    assert not result.validation_errors
    assert all(item.store_id == "mock-city" for item in result.assignments)
    assert all(item.start.astimezone(timezone_for(rules.timezone)).hour >= 12
               and item.end.astimezone(timezone_for(rules.timezone)).hour <= 20
               for item in result.assignments)
    assert all(slot.gap == 0 for slot in result.coverage)
    assert any(shift.start.astimezone(timezone_for(rules.timezone)).hour == 10
               for shift in baseline.assignments)


def test_real_snapshot_requires_attestations():
    snapshot = demo_snapshot(DAY)
    snapshot.source = "REAL"
    snapshot.leave_data_complete = False
    result = solve(snapshot, demo_rules(), DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "MISSING_POLICY_ATTESTATION"


def test_direct_real_solver_requires_staffing_rule_review_even_with_other_reviews():
    snapshot = demo_snapshot(DAY)
    snapshot.source = "REAL"
    assert snapshot.leave_data_complete
    assert snapshot.compliance_policy_confirmed
    assert not snapshot.staffing_rules_confirmed

    rejected = solve(snapshot, demo_rules(), DAY, DAY)

    assert rejected.status == SolveStatus.CONFIG_ERROR
    assert rejected.diagnostics[0].code == "MISSING_POLICY_ATTESTATION"
    assert not rejected.assignments
    assert rejected.parameters["staffing_rules_review"] == "UNKNOWN"
    assert rejected.parameters["acceptance_gate"] == "NOT_ELIGIBLE"
    snapshot.staffing_rules_confirmed = True
    accepted = solve(snapshot, demo_rules(), DAY, DAY)
    assert accepted.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not accepted.validation_errors
    assert accepted.parameters["staffing_rules_review"] == "MANUAL_CONFIRMED"
    assert accepted.parameters["acceptance_gate"] == "MANUAL_REVIEW_REQUIRED"
    snapshot.availability = []
    incomplete = solve(snapshot, demo_rules(), DAY, DAY, SolveMode.BEST_EFFORT)
    assert incomplete.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert any(slot.gap for slot in incomplete.coverage)
    assert incomplete.parameters["acceptance_gate"] == "NOT_ELIGIBLE"


def test_direct_real_solver_does_not_promote_detached_published_comparison():
    snapshot = demo_snapshot(DAY)
    snapshot.source = "REAL"
    snapshot.staffing_rules_confirmed = True
    zone = timezone_for(snapshot.timezone)
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="published-reference",
        employee_id=snapshot.employees[0].id, store_id=snapshot.store_id,
        role_code="service", status="PUBLISHED", break_minutes_unknown=0,
        start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone)))
    detached, removed = comparison_snapshot(snapshot, DAY, DAY)

    result = solve(detached, demo_rules(), DAY, DAY)

    assert removed == 1
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not result.validation_errors
    assert result.parameters["comparison_mode"] == "REPLACE_TARGET_PUBLISHED"
    assert result.parameters["acceptance_gate"] == "NOT_ELIGIBLE"
    assert len(snapshot.existing_shifts) == 1


def test_fixed_shift_with_known_break_is_preserved_and_counted():
    rules = demo_rules()
    rules.base_day.patterns[0].break_rule.paid = True
    rules.base_day.pattern_minimums = {"Early": 1}
    snapshot = demo_snapshot(DAY)
    zone = timezone_for(rules.timezone)
    snapshot.existing_shifts.append(ExistingShift(employee_id=snapshot.employees[0].id,
        store_id=snapshot.store_id, role_code="service", status="PUBLISHED",
        start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone),
        break_start=local_instant(DAY, "12:00", zone), break_end=local_instant(DAY, "12:30", zone),
        break_minutes_unknown=30))
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not result.validation_errors
    fixed = [item for item in result.assignments if item.fixed]
    assert len(fixed) == 1
    assert fixed[0].employee_id == snapshot.employees[0].id
    assert fixed[0].pattern_name == "Early"
    assert fixed[0].paid_break is True
    assert fixed[0].break_time_inferred is False
    assert fixed[0].net_work_minutes == 420
    assert all(slot.effective == slot.scheduled - slot.on_break for slot in result.coverage)


def test_fixed_unpaid_break_uses_net_minutes_for_weekly_cap():
    rules = demo_rules()
    zone = timezone_for(rules.timezone)
    next_day = DAY + timedelta(days=1)
    rules.base_day.opening_time = "10:00"
    rules.base_day.closing_time = "17:00"
    rules.base_day.work_end = "17:00"
    rules.base_day.opening_minimum = 1
    rules.base_day.opening_qualified_minimum = 1
    rules.base_day.demand = [DemandSegment(start="10:00", end="12:00", minimum=1),
                             DemandSegment(start="12:00", end="13:00", minimum=0),
                             DemandSegment(start="13:00", end="17:00", minimum=1)]
    early = rules.base_day.patterns[0]
    early.starts, early.ends = ["10:00"], ["17:00"]
    early.break_rule.earliest, early.break_rule.latest_end = "12:00", "13:00"
    rules.base_day.patterns = [early]
    short = early.model_copy(update={"starts": ["10:00"], "ends": ["14:00"],
        "break_rule": early.break_rule.model_copy(update={"count": 0})})
    rules.dates[next_day] = DayOverride(closing_time="14:00", work_end="14:00",
        demand=[DemandSegment(start="10:00", end="14:00", minimum=1)], patterns=[short])
    rules.compliance.maximum_weekly_work_minutes = 630
    snapshot = demo_snapshot(DAY, count=1, days=2)
    snapshot.existing_shifts.append(ExistingShift(employee_id=snapshot.employees[0].id,
        store_id=snapshot.store_id, role_code="service", status="PUBLISHED",
        start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone),
        break_minutes_unknown=30))
    result = solve(snapshot, rules, DAY, next_day)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not result.validation_errors
    assert sum(shift.net_work_minutes for shift in result.assignments) == 630


def test_weekday_counts_are_independent_and_date_override_wins():
    rules = demo_rules()
    rules.weekly = {
        0: DayOverride(opening_minimum=3, pattern_minimums={"Early": 4, "Late": 4}),
        3: DayOverride(opening_minimum=2, pattern_minimums={"Early": 3, "Late": 5}),
    }
    assert rules.for_date(date(2026, 10, 26)).pattern_minimums == {"Early": 4, "Late": 4}
    assert rules.for_date(date(2026, 10, 27)).pattern_minimums == {}
    assert rules.for_date(date(2026, 10, 29)).pattern_minimums == {"Early": 3, "Late": 5}
    rules.dates[date(2026, 10, 29)] = DayOverride(pattern_minimums={"Early": 1, "Late": 2})
    assert rules.for_date(date(2026, 10, 29)).pattern_minimums == {"Early": 1, "Late": 2}
    days, errors = compile_rules(rules, date(2026, 10, 26), date(2026, 10, 29))
    assert len(days) == 4 and not errors


def test_weekday_and_specific_date_staffing_drive_one_multi_day_solve():
    """An exception changes one day without leaking its headcount into neighbors."""
    rules = RuleSet(store_id="weekday-example", timezone="Australia/Sydney",
        base_day=DayRules(prep_start="10:00", opening_time="10:00",
            closing_time="14:00", work_end="14:00", opening_minimum=1,
            pattern_minimums={"Day": 1},
            demand=[DemandSegment(start="10:00", end="14:00", minimum=1)],
            patterns=[ShiftPattern(name="Day", role_code="service",
                starts=["10:00"], ends=["14:00"])]),
        weekly={
            1: DayOverride(opening_minimum=2, pattern_minimums={"Day": 2},
                demand=[DemandSegment(start="10:00", end="14:00", minimum=2)]),
            2: DayOverride(opening_minimum=2, pattern_minimums={"Day": 2},
                demand=[DemandSegment(start="10:00", end="14:00", minimum=2)]),
            3: DayOverride(opening_minimum=2, pattern_minimums={"Day": 2},
                demand=[DemandSegment(start="10:00", end="14:00", minimum=2)]),
        },
        dates={date(2026, 10, 28): DayOverride(opening_minimum=3,
            pattern_minimums={"Day": 3},
            demand=[DemandSegment(start="10:00", end="14:00", minimum=3)])},
        compliance=ComplianceRules(required_break_after_minutes=300),
        solve_seconds=5)
    snapshot = demo_snapshot(DAY, "weekday-example", count=3, days=4)

    result = solve(snapshot, rules, DAY, DAY + timedelta(days=3), SolveMode.STRICT)

    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not result.validation_errors
    required_by_day = {DAY + timedelta(days=offset): count
                       for offset, count in enumerate((1, 2, 3, 2))}
    for day, required in required_by_day.items():
        shifts = [shift for shift in result.assignments if shift.date == day]
        slots = [slot for slot in result.coverage if slot.date == day]
        assert len(shifts) >= required
        assert len(slots) == 8
        assert all(slot.required == required and slot.effective >= required and slot.gap == 0
                   for slot in slots)
    assert rules.for_date(date(2026, 11, 4)).opening_minimum == 2


def test_unknown_pattern_minimum_is_configuration_error():
    rules = demo_rules()
    rules.base_day.pattern_minimums = {"NotConfigured": 1}
    days, errors = compile_rules(rules, DAY, DAY)
    assert not days
    assert errors and errors[0].code == "RULE_CONFIG"


def test_pattern_minimum_cannot_hide_missing_employees():
    rules = demo_rules()
    rules.base_day.pattern_minimums = {"Early": 12}
    rules.solve_seconds = 2
    result = solve(demo_snapshot(DAY), rules, DAY, DAY)
    assert result.status == SolveStatus.INFEASIBLE
    assert any(item.code == "PATTERN_CANDIDATES" for item in result.diagnostics)


def test_best_effort_reports_pattern_count_gap():
    rules = demo_rules()
    rules.base_day.pattern_minimums = {"Early": 12}
    rules.solve_seconds = 4
    result = solve(demo_snapshot(DAY), rules, DAY, DAY, SolveMode.BEST_EFFORT)
    assert result.status in {SolveStatus.FEASIBLE, SolveStatus.OPTIMAL}
    assert any(item.code == "PATTERN_STAFFING_GAP" for item in result.diagnostics)
    assert not result.validation_errors


def test_fixed_shift_with_untimed_break_is_scheduled_inside_allowed_window():
    rules = demo_rules()
    snapshot = demo_snapshot(DAY)
    zone = timezone_for(rules.timezone)
    snapshot.existing_shifts.append(ExistingShift(employee_id=snapshot.employees[0].id,
        store_id=snapshot.store_id, role_code="service", status="PUBLISHED",
        start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone),
        break_minutes_unknown=30))
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not result.validation_errors
    fixed = next(item for item in result.assignments if item.fixed)
    assert fixed.pattern_name == "Early"
    assert fixed.break_time_inferred is True
    assert AssignedShift.model_validate(fixed.model_dump(exclude={"break_time_inferred"})).break_time_inferred is None
    assert sum(minutes_between(a, b) for a, b in fixed.breaks) == 30
    assert any(slot.on_break for slot in result.coverage)


def test_untimed_fixed_break_rejects_impossible_policy_window_before_matching():
    rules = demo_rules()
    rules.base_day.patterns[0].break_rule.earliest = "16:45"
    rules.base_day.patterns[0].break_rule.latest_end = "17:00"
    snapshot = demo_snapshot(DAY)
    zone = timezone_for(rules.timezone)
    snapshot.existing_shifts.append(ExistingShift(employee_id=snapshot.employees[0].id,
        store_id=snapshot.store_id, role_code="service", status="PUBLISHED",
        start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone),
        break_minutes_unknown=30))
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status == SolveStatus.CONFIG_ERROR
    assert result.diagnostics[0].code == "BREAK_WINDOW"


def test_untimed_fixed_break_moves_to_unstaffed_window():
    rules = demo_rules()
    rules.base_day.patterns = [rules.base_day.patterns[0]]
    rules.base_day.opening_minimum = 1
    rules.base_day.opening_qualified_minimum = 1
    rules.base_day.demand = [
        DemandSegment(start="10:00", end="14:00", minimum=1),
        DemandSegment(start="14:00", end="15:00", minimum=0),
        DemandSegment(start="15:00", end="17:00", minimum=1),
        DemandSegment(start="17:00", end="22:00", minimum=0),
    ]
    snapshot = demo_snapshot(DAY, count=1)
    zone = timezone_for(rules.timezone)
    snapshot.existing_shifts.append(ExistingShift(employee_id=snapshot.employees[0].id,
        store_id=snapshot.store_id, role_code="service", status="PUBLISHED",
        start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone),
        break_minutes_unknown=30))
    result = solve(snapshot, rules, DAY, DAY)
    assert result.status == SolveStatus.OPTIMAL
    fixed = next(item for item in result.assignments if item.fixed)
    assert fixed.breaks[0][0] >= local_instant(DAY, "14:00", zone)
    assert fixed.breaks[0][1] <= local_instant(DAY, "15:00", zone)
    assert all(slot.gap == 0 for slot in result.coverage)


def test_dst_and_cross_midnight_clock():
    zone = timezone_for("Australia/Sydney")
    with pytest.raises(ClockError, match="Nonexistent"):
        local_instant(date(2026, 10, 4), "02:30", zone)
    with pytest.raises(ClockError, match="Ambiguous"):
        local_instant(date(2026, 4, 5), "02:30", zone)
    start = local_instant(date(2026, 10, 4), "23:00", zone)
    end = local_instant(date(2026, 10, 4), "01:00", zone, next_day=True)
    assert int((end - start).total_seconds() / 60) == 120
