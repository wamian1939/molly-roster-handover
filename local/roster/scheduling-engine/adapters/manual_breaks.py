from __future__ import annotations

from datetime import date, timedelta, timezone
from hashlib import sha256

from engine.clock import local_instant, minutes_between, timezone_for
from engine.models import FixedBreakInterval, Snapshot


class FixedBreakInputError(ValueError):
    pass


def unresolved_fixed_breaks(snapshot: Snapshot, start_date: date, end_date: date) -> list[dict]:
    zone = timezone_for(snapshot.timezone)
    range_start = local_instant(start_date, "00:00", zone)
    range_end = local_instant(end_date + timedelta(days=1), "00:00", zone)
    result: dict[str, dict] = {}
    for shift in snapshot.existing_shifts:
        if (shift.source_shift_id and shift.store_id == snapshot.store_id
            and shift.status in {"PUBLISHED", "LOCKED"}
            and shift.break_minutes_unknown > 0 and shift.break_start is None
            and shift.start < range_end and range_start < shift.end):
            result.setdefault(shift.source_shift_id, {
                "source_shift_id": shift.source_shift_id,
                "start": shift.start,
                "end": shift.end,
                "recorded_break_minutes": shift.break_minutes_unknown,
                "assigned_people": 0,
            })["assigned_people"] += 1
    return sorted(result.values(), key=lambda item: (item["start"], item["source_shift_id"]))


def apply_fixed_break_intervals(snapshot: Snapshot, intervals: list[FixedBreakInterval],
                                start_date: date, end_date: date) -> Snapshot:
    if not intervals:
        return snapshot
    pending = {item["source_shift_id"]: item
               for item in unresolved_fixed_breaks(snapshot, start_date, end_date)}
    given: dict[str, FixedBreakInterval] = {}
    for interval in intervals:
        shift_id = interval.source_shift_id
        if shift_id in given:
            raise FixedBreakInputError(f"Duplicate fixed break input for shift {shift_id}")
        source = pending.get(shift_id)
        if source is None:
            raise FixedBreakInputError(f"Shift {shift_id} is not an unresolved published target shift")
        if (interval.start < source["start"] or interval.end > source["end"]
            or minutes_between(interval.start, interval.end) != source["recorded_break_minutes"]):
            raise FixedBreakInputError(f"Shift {shift_id} break must fit inside the shift and match its recorded duration")
        given[shift_id] = interval
    updated = [shift.model_copy(update={"break_start": given[shift.source_shift_id].start.astimezone(timezone.utc),
                                        "break_end": given[shift.source_shift_id].end.astimezone(timezone.utc)})
               if shift.source_shift_id in given else shift
               for shift in snapshot.existing_shifts]
    fingerprint = sha256("|".join(
        f"{shift_id}:{item.start.astimezone(timezone.utc).isoformat()}:{item.end.astimezone(timezone.utc).isoformat()}"
        for shift_id, item in sorted(given.items())).encode()).hexdigest()[:20]
    return snapshot.model_copy(update={
        "existing_shifts": updated,
        "version": f"{snapshot.version}|reviewed-breaks:{fingerprint}",
    })
