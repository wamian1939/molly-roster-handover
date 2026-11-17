from datetime import date, datetime, timezone

from adapters.manual_leave import apply_reviewed_leave
from engine.models import TimeWindow
from fixtures.demo import demo_snapshot


def test_reviewed_leave_changes_input_version_without_mutating_source():
    source = demo_snapshot(date(2026, 10, 26), store_id="hurstville")
    employee_id = source.employees[0].id
    leave = TimeWindow(employee_id=employee_id,
                       start=datetime(2026, 10, 26, 1, tzinfo=timezone.utc),
                       end=datetime(2026, 10, 26, 3, tzinfo=timezone.utc))

    empty = apply_reviewed_leave(source, [])
    reviewed = apply_reviewed_leave(source, [leave])

    assert empty.version != reviewed.version
    assert reviewed.approved_leave == [leave]
    assert source.approved_leave == []
    assert source.version != reviewed.version


def test_reviewed_leave_version_is_order_and_offset_independent():
    source = demo_snapshot(date(2026, 10, 26), store_id="hurstville")
    first = TimeWindow(employee_id=source.employees[0].id,
                       start=datetime.fromisoformat("2026-10-26T12:00:00+11:00"),
                       end=datetime.fromisoformat("2026-10-26T13:00:00+11:00"))
    same_in_utc = TimeWindow(employee_id=first.employee_id,
                             start=first.start.astimezone(timezone.utc),
                             end=first.end.astimezone(timezone.utc))
    second = TimeWindow(employee_id=source.employees[1].id,
                        start=datetime.fromisoformat("2026-10-26T14:00:00+11:00"),
                        end=datetime.fromisoformat("2026-10-26T15:00:00+11:00"))

    assert apply_reviewed_leave(source, [first, second]).version == apply_reviewed_leave(
        source, [second, same_in_utc]).version
