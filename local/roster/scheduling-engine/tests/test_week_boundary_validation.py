from datetime import date, timedelta

from engine.clock import local_instant, timezone_for
from engine.config import compile_rules
from engine.models import ExistingShift, SolveMode, SolveStatus
from engine.solver import solve
from engine.validation import verify_result
from fixtures.demo import demo_rules, demo_snapshot


def test_validator_ignores_work_cap_in_week_outside_requested_dates():
    requested_day = date(2026, 10, 26)  # Monday
    rules = demo_rules()
    snapshot = demo_snapshot(requested_day)
    candidate = solve(snapshot, rules, requested_day, requested_day, SolveMode.STRICT)
    assert candidate.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert candidate.assignments and not candidate.validation_errors

    employee_id = candidate.assignments[0].employee_id
    zone = timezone_for(rules.timezone)
    previous_monday = requested_day - timedelta(days=7)
    for offset in range(5):
        previous_day = previous_monday + timedelta(days=offset)
        snapshot.existing_shifts.append(ExistingShift(
            employee_id=employee_id, store_id="other-store", status="PUBLISHED",
            role_code="service", start=local_instant(previous_day, "10:00", zone),
            end=local_instant(previous_day, "18:00", zone)))
    # Five 8-hour shifts exceed the Lab's 38-hour weekly cap, but that is the
    # previous week and is not part of this candidate's start-date accounting.
    days, errors = compile_rules(rules, requested_day, requested_day)
    assert not errors
    assert verify_result(snapshot, rules, days, candidate.assignments, SolveMode.STRICT) == []
    rerun = solve(snapshot, rules, requested_day, requested_day, SolveMode.STRICT)
    assert rerun.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
    assert not rerun.validation_errors
    assert all(slot.gap == 0 for slot in rerun.coverage)
