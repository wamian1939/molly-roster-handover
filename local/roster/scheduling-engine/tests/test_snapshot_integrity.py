from datetime import date, datetime, timezone

from engine.clock import local_instant, timezone_for
from engine.models import ExistingShift, SolveStatus, TimeWindow
from engine.solver import solve
from fixtures.demo import demo_rules, demo_snapshot


DAY = date(2026, 10, 26)


def test_duplicate_employee_cannot_enter_candidate_model():
    snapshot = demo_snapshot(DAY)
    snapshot.employees.append(snapshot.employees[0].model_copy())

    result = solve(snapshot, demo_rules(), DAY, DAY)

    assert result.status == SolveStatus.DATA_ERROR
    assert result.diagnostics[0].code == "DUPLICATE_EMPLOYEE"
    assert not result.assignments


def test_duplicate_source_assignment_cannot_inflate_fixed_coverage():
    snapshot = demo_snapshot(DAY)
    zone = timezone_for(snapshot.timezone)
    shift = ExistingShift(source_shift_id="one", employee_id=snapshot.employees[0].id,
        store_id=snapshot.store_id, role_code="service", status="PUBLISHED",
        start=local_instant(DAY, "10:00", zone), end=local_instant(DAY, "17:00", zone))
    snapshot.existing_shifts.extend([shift, shift.model_copy()])

    result = solve(snapshot, demo_rules(), DAY, DAY)

    assert result.status == SolveStatus.DATA_ERROR
    assert result.diagnostics[0].code == "DUPLICATE_SHIFT_ASSIGNMENT"
    assert not result.assignments


def test_direct_solver_rejects_leave_for_unknown_employee():
    snapshot = demo_snapshot(DAY)
    snapshot.approved_leave.append(TimeWindow(employee_id="not-in-store",
        start=datetime(2026, 10, 26, 1, tzinfo=timezone.utc),
        end=datetime(2026, 10, 26, 2, tzinfo=timezone.utc)))

    result = solve(snapshot, demo_rules(), DAY, DAY)

    assert result.status == SolveStatus.DATA_ERROR
    assert result.diagnostics[0].code == "UNKNOWN_LEAVE_EMPLOYEE"
    assert not result.assignments
