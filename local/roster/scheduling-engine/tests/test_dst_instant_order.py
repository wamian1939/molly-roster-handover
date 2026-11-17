from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from engine.candidates import break_options
from engine.clock import local_instant, overlaps, timezone_for
from engine.config import compile_rules
from engine.models import (BreakRule, ComplianceRules, DayRules, DemandSegment,
                           ExistingShift, FixedBreakInterval, RuleSet, ShiftPattern,
                           Snapshot, SolveStatus, StaffMember, TimeWindow)
from engine.solver import solve
from engine.validation import verify_result


def _fallback_instant(hour: int, minute: int, fold: int) -> datetime:
    return datetime(2026, 4, 5, hour, minute,
                    tzinfo=ZoneInfo("Australia/Sydney"), fold=fold)


def test_availability_crossing_repeated_hour_uses_instant_order():
    start = _fallback_instant(2, 45, 0)
    end = _fallback_instant(2, 15, 1)

    window = TimeWindow(employee_id="staff", start=start, end=end)

    assert window.start == datetime(2026, 4, 4, 15, 45, tzinfo=timezone.utc)
    assert window.end == datetime(2026, 4, 4, 16, 15, tzinfo=timezone.utc)


def test_fixed_break_crossing_repeated_hour_uses_instant_order():
    interval = FixedBreakInterval(source_shift_id="shift", start=_fallback_instant(2, 45, 0),
                                  end=_fallback_instant(2, 15, 1))

    assert interval.start < interval.end
    assert interval.end - interval.start == timedelta(minutes=30)


def test_recorded_shift_break_crossing_repeated_hour_normalizes_to_utc():
    shift = ExistingShift(employee_id="staff", store_id="store", status="PUBLISHED",
                          start=_fallback_instant(1, 30, 0), end=_fallback_instant(3, 30, 1),
                          break_start=_fallback_instant(2, 45, 0),
                          break_end=_fallback_instant(2, 15, 1), break_minutes_unknown=30)

    assert shift.start < shift.break_start < shift.break_end < shift.end
    assert shift.break_end - shift.break_start == timedelta(minutes=30)


def test_overlap_across_repeated_hour_uses_instants():
    assert overlaps(_fallback_instant(2, 45, 0), _fallback_instant(2, 15, 1),
                    _fallback_instant(2, 0, 1), _fallback_instant(2, 30, 1))


def test_overnight_break_optimization_covers_both_repeated_hours():
    day = date(2026, 4, 4)
    zone = timezone_for("Australia/Sydney")
    start = local_instant(day, "22:00", zone)
    end = local_instant(day, "04:00", zone, next_day=True)
    rule = BreakRule(count=1, duration_minutes=30, earliest="01:00",
                     earliest_next_day=True, latest_end="04:00", latest_end_next_day=True,
                     minimum_work_after_break_slots=0)
    pattern = ShiftPattern(name="Night", role_code="service", starts=["22:00"],
                           ends=["04:00"], end_next_day=True, break_rule=rule)
    rules = RuleSet(store_id="store", timezone="Australia/Sydney", base_day=DayRules(
        prep_start="22:00", opening_time="22:00", closing_time="04:00",
        closing_next_day=True, work_end="04:00", work_end_next_day=True,
        opening_minimum=1, demand=[DemandSegment(start="22:00", end="04:00",
                                                end_next_day=True, minimum=1)],
        patterns=[pattern]), compliance=ComplianceRules(required_break_after_minutes=300))
    employees = [StaffMember(id=f"staff-{index}", name=f"Staff {index}", store_id="store",
                             qualified_roles={"service"}) for index in range(2)]
    snapshot = Snapshot(store_id="store", timezone="Australia/Sydney",
        generated_at=datetime.now(timezone.utc), version="dst-fallback",
        employees=employees, availability=[TimeWindow(employee_id=employee.id,
            start=start, end=end) for employee in employees], source="MOCK")

    options = break_options(day, start, end, rules, pattern)
    repeated_two = [interval[0][0].astimezone(zone) for interval in options
                    if interval[0][0].astimezone(zone).strftime("%H:%M") == "02:00"]
    assert {instant.fold for instant in repeated_two} == {0, 1}
    assert len(options) == 8

    compiled, errors = compile_rules(rules, day, day)
    assert not errors
    assert len(compiled[0].slots) == 14
    result = solve(snapshot, rules, day, day)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}, result.diagnostics
    assert len(result.assignments) == 2
    assert all(slot.gap == 0 for slot in result.coverage)
    assert any(slot.on_break for slot in result.coverage)
    assert not verify_result(snapshot, rules, compiled, result.assignments, result.mode)

    snapshot.existing_shifts = [ExistingShift(source_shift_id="published-night",
        employee_id="staff-0", store_id="store", role_code="service", status="PUBLISHED",
        start=start, end=end, break_minutes_unknown=30)]
    fixed_result = solve(snapshot, rules, day, day)
    assert fixed_result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}, fixed_result.diagnostics
    assert len(fixed_result.assignments) == 2
    fixed = next(shift for shift in fixed_result.assignments if shift.fixed)
    assert fixed.employee_id == "staff-0"
    assert fixed.break_time_inferred is True
    assert sum(slot.gap for slot in fixed_result.coverage) == 0
    assert not verify_result(snapshot, rules, compiled, fixed_result.assignments, fixed_result.mode)


def test_spring_forward_night_uses_elapsed_slots_and_skips_nonexistent_hour():
    day = date(2026, 10, 3)
    zone = timezone_for("Australia/Sydney")
    start = local_instant(day, "22:00", zone)
    end = local_instant(day, "04:00", zone, next_day=True)
    rule = BreakRule(count=1, duration_minutes=30, earliest="01:00",
                     earliest_next_day=True, latest_end="04:00", latest_end_next_day=True,
                     minimum_work_after_break_slots=0)
    pattern = ShiftPattern(name="Night", role_code="service", starts=["22:00"],
                           ends=["04:00"], end_next_day=True, break_rule=rule)
    rules = RuleSet(store_id="store", timezone="Australia/Sydney", base_day=DayRules(
        prep_start="22:00", opening_time="22:00", closing_time="04:00",
        closing_next_day=True, work_end="04:00", work_end_next_day=True,
        opening_minimum=1, demand=[DemandSegment(start="22:00", end="04:00",
                                                end_next_day=True, minimum=1)],
        patterns=[pattern]), compliance=ComplianceRules(required_break_after_minutes=240))
    employees = [StaffMember(id=f"staff-{index}", name=f"Staff {index}", store_id="store",
                             qualified_roles={"service"}) for index in range(2)]
    snapshot = Snapshot(store_id="store", timezone="Australia/Sydney",
        generated_at=datetime.now(timezone.utc), version="dst-spring-forward",
        employees=employees, availability=[TimeWindow(employee_id=employee.id,
            start=start, end=end) for employee in employees], source="MOCK")

    compiled, errors = compile_rules(rules, day, day)
    assert not errors
    assert end - start == timedelta(hours=5)
    assert len(compiled[0].slots) == 10
    options = break_options(day, start, end, rules, pattern)
    assert options
    assert all(interval[0][0].astimezone(zone).hour != 2 for interval in options)

    result = solve(snapshot, rules, day, day)
    assert result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}, result.diagnostics
    assert len(result.assignments) == 2
    assert len(result.coverage) == 10
    assert all(slot.gap == 0 for slot in result.coverage)
    assert any(slot.on_break for slot in result.coverage)
    assert not verify_result(snapshot, rules, compiled, result.assignments, result.mode)
