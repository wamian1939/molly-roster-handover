from __future__ import annotations

from datetime import date

import pytest

from adapters.manual_breaks import (FixedBreakInputError, apply_fixed_break_intervals,
                                    unresolved_fixed_breaks)
from engine.clock import local_instant, timezone_for
from engine.models import ExistingShift, FixedBreakInterval
from fixtures.demo import demo_snapshot


DAY = date(2026, 10, 26)


def published_snapshot():
    snapshot = demo_snapshot(DAY)
    zone = timezone_for(snapshot.timezone)
    start = local_instant(DAY, "10:00", zone)
    end = local_instant(DAY, "22:00", zone)
    for employee in snapshot.employees[:2]:
        snapshot.existing_shifts.append(ExistingShift(source_shift_id="shift-1",
            employee_id=employee.id, store_id=snapshot.store_id, role_code="service",
            status="PUBLISHED", start=start, end=end, break_minutes_unknown=60))
    return snapshot


def interval(start: str = "13:00", end: str = "14:00", shift_id: str = "shift-1") -> FixedBreakInterval:
    zone = timezone_for("Australia/Sydney")
    return FixedBreakInterval(source_shift_id=shift_id,
        start=local_instant(DAY, start, zone), end=local_instant(DAY, end, zone))


def test_reviewed_interval_applies_to_all_assignments_and_versions_snapshot():
    original = published_snapshot()
    pending = unresolved_fixed_breaks(original, DAY, DAY)
    assert len(pending) == 1 and pending[0]["assigned_people"] == 2
    updated = apply_fixed_break_intervals(original, [interval()], DAY, DAY)
    assert all(shift.break_start == interval().start and shift.break_end == interval().end
               for shift in updated.existing_shifts)
    assert all(shift.break_start is None for shift in original.existing_shifts)
    assert "reviewed-breaks:" in updated.version
    assert apply_fixed_break_intervals(original, [interval()], DAY, DAY).version == updated.version
    assert unresolved_fixed_breaks(updated, DAY, DAY) == []


def test_equivalent_break_offsets_produce_the_same_snapshot_version():
    original = published_snapshot()
    utc_interval = interval()
    zone = timezone_for("Australia/Sydney")
    local_interval = FixedBreakInterval(source_shift_id=utc_interval.source_shift_id,
        start=utc_interval.start.astimezone(zone), end=utc_interval.end.astimezone(zone))

    utc_result = apply_fixed_break_intervals(original, [utc_interval], DAY, DAY)
    local_result = apply_fixed_break_intervals(original, [local_interval], DAY, DAY)
    assert utc_result.version == local_result.version
    assert utc_result.existing_shifts == local_result.existing_shifts


@pytest.mark.parametrize("inputs", [
    [interval("13:00", "13:30")],
    [interval("09:00", "10:00")],
    [interval(shift_id="other-shift")],
    [interval(), interval()],
])
def test_invalid_or_unverified_break_inputs_fail_closed(inputs):
    with pytest.raises(FixedBreakInputError):
        apply_fixed_break_intervals(published_snapshot(), inputs, DAY, DAY)
