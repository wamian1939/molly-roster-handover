from __future__ import annotations

from datetime import date, timedelta

from engine import validation
from engine.clock import local_instant, timezone_for
from engine.config import compile_rules
from engine.models import ExistingShift, SolveMode
from engine.solver import solve
from fixtures.demo import demo_rules, demo_snapshot


DAY = date(2026, 10, 26)


def test_replay_checks_availability_without_candidate_filter(monkeypatch):
    rules = demo_rules()
    snapshot = demo_snapshot(DAY)
    result = solve(snapshot, rules, DAY, DAY)
    assert result.assignments and not result.validation_errors
    proposed = next(shift for shift in result.assignments if not shift.fixed)
    snapshot.availability = []
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    monkeypatch.setattr(validation, "completely_available", lambda *_: True, raising=False)

    replay_errors = validation.verify_result(snapshot, rules, days, [proposed], SolveMode.BEST_EFFORT)

    assert any("Availability does not cover" in error for error in replay_errors)


def test_replay_checks_fixed_break_without_generated_options(monkeypatch):
    rules = demo_rules()
    snapshot = demo_snapshot(DAY)
    zone = timezone_for(rules.timezone)
    employee = snapshot.employees[0]
    start = local_instant(DAY, "10:00", zone)
    snapshot.existing_shifts.append(ExistingShift(source_shift_id="fixed", employee_id=employee.id,
        store_id=snapshot.store_id, role_code="service", status="PUBLISHED",
        start=start, end=local_instant(DAY, "17:00", zone), break_minutes_unknown=30))
    result = solve(snapshot, rules, DAY, DAY)
    assert result.assignments and not result.validation_errors
    fixed = next(shift for shift in result.assignments if shift.fixed)
    outside_window = (start, start + timedelta(minutes=30))
    altered = fixed.model_copy(update={"breaks": [outside_window]})
    days, errors = compile_rules(rules, DAY, DAY)
    assert not errors
    monkeypatch.setattr(validation, "break_options", lambda *_: [[outside_window]], raising=False)

    replay_errors = validation.verify_result(snapshot, rules, days, [altered], SolveMode.BEST_EFFORT)

    assert any("legal pattern and break rule" in error for error in replay_errors)
