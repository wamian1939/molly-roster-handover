from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class ClockError(ValueError):
    pass


def timezone_for(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError as error:
        raise ClockError(f"Unknown store timezone: {name}") from error


def clock_parts(value: str) -> time:
    try:
        parsed = time.fromisoformat(value)
    except ValueError as error:
        raise ClockError(f"Invalid local clock: {value}") from error
    if parsed.second or parsed.microsecond or parsed.tzinfo:
        raise ClockError(f"Clock must be HH:MM: {value}")
    return parsed


def local_instant(day: date, clock: str, zone: ZoneInfo, next_day: bool = False, fold: int | None = None) -> datetime:
    naive = datetime.combine(day + timedelta(days=int(next_day)), clock_parts(clock))
    first = naive.replace(tzinfo=zone, fold=0)
    second = naive.replace(tzinfo=zone, fold=1)
    valid = [value for value in (first, second)
             if value.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None) == naive]
    if not valid:
        raise ClockError(f"Nonexistent local time {naive.isoformat()} in {zone.key}")
    if first.utcoffset() != second.utcoffset() and fold is None:
        raise ClockError(f"Ambiguous local time {naive.isoformat()} in {zone.key}; choose an explicit UTC offset")
    value = naive.replace(tzinfo=zone, fold=fold or 0)
    if value not in valid:
        raise ClockError(f"Invalid fold for local time {naive.isoformat()} in {zone.key}")
    return value.astimezone(timezone.utc)


def minutes_between(start: datetime, end: datetime) -> int:
    return int((end.astimezone(timezone.utc) - start.astimezone(timezone.utc)).total_seconds() // 60)


def aligned_to_slot(start: datetime, instant: datetime, slot_minutes: int) -> bool:
    elapsed = instant.astimezone(timezone.utc) - start.astimezone(timezone.utc)
    return elapsed % timedelta(minutes=slot_minutes) == timedelta(0)


def overlaps(left_start: datetime, left_end: datetime, right_start: datetime, right_end: datetime) -> bool:
    return (left_start.astimezone(timezone.utc) < right_end.astimezone(timezone.utc)
            and right_start.astimezone(timezone.utc) < left_end.astimezone(timezone.utc))
