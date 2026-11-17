from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

from .clock import ClockError, local_instant, minutes_between, overlaps, timezone_for
from .models import DayRules, Diagnostic, RuleSet


@dataclass(frozen=True)
class DemandSlot:
    day: date
    start: datetime
    end: datetime
    required: int
    role_required: dict[str, int]


@dataclass(frozen=True)
class CompiledDay:
    day: date
    rules: DayRules
    preparation: datetime
    opening: datetime
    closing: datetime
    work_end: datetime
    slots: tuple[DemandSlot, ...]


def opening_slots(day: CompiledDay) -> tuple[DemandSlot, ...]:
    """Preparation slots need opening staff throughout; with no prep, use the first work slot."""
    return tuple(slot for slot in day.slots if slot.start < day.opening) or day.slots[:1]


def compile_rules(rules: RuleSet, start_date: date, end_date: date) -> tuple[list[CompiledDay], list[Diagnostic]]:
    # Candidate generation depends on CompiledDay, so import its shared break
    # generator after this module has loaded instead of duplicating its rules.
    from .candidates import break_options

    errors: list[Diagnostic] = []
    days: list[CompiledDay] = []
    if rules.slot_minutes <= 0 or (end_date - start_date).days not in range(14):
        return [], [Diagnostic(code="DATE_RANGE", message="Date range must contain 1–14 days", certainty="CONFIG")]
    if (rules.enforce_work_rest_limits and
            rules.compliance.minimum_shift_minutes > rules.compliance.maximum_shift_minutes):
        errors.append(Diagnostic(code="SHIFT_LENGTH", message="Minimum shift exceeds maximum shift", certainty="CONFIG"))
    try:
        zone = timezone_for(rules.timezone)
    except ClockError as error:
        return [], [Diagnostic(code="TIMEZONE", message=str(error), certainty="CONFIG")]

    day = start_date
    while day <= end_date:
        current = rules.for_date(day)
        try:
            if not current.patterns:
                raise ClockError("No legal shift patterns are configured")
            if rules.pattern_only:
                starts = [local_instant(day, clock, zone)
                          for pattern in current.patterns for clock in pattern.starts]
                ends = [local_instant(day, clock, zone, pattern.end_next_day)
                        for pattern in current.patterns for clock in pattern.ends]
                preparation = opening = min(starts)
                closing = work_end = max(ends)
                demand: list[tuple[datetime, datetime, int, dict[str, int]]] = []
            else:
                preparation = local_instant(day, current.prep_start, zone)
                opening = local_instant(day, current.opening_time, zone)
                closing = local_instant(day, current.closing_time, zone, current.closing_next_day)
                work_end = local_instant(day, current.work_end, zone, current.work_end_next_day)
                if not preparation <= opening <= closing <= work_end or preparation == work_end:
                    raise ClockError("Preparation, opening, closing and employee finish must be ordered")
                if minutes_between(preparation, opening) % rules.slot_minutes:
                    raise ClockError("Opening time must align with the configured time slot length")
                demand = []
                for segment in current.demand:
                    segment_start = local_instant(day, segment.start, zone, segment.start_next_day)
                    segment_end = local_instant(day, segment.end, zone, segment.end_next_day)
                    if segment_end <= segment_start:
                        raise ClockError(f"Demand segment {segment.start}–{segment.end} has no positive duration")
                    if segment_start < preparation or segment_end > work_end:
                        raise ClockError(f"Demand segment {segment.start}–{segment.end} falls outside the complete work window")
                    if minutes_between(segment_start, segment_end) % rules.slot_minutes:
                        raise ClockError("Demand segments must align with the time slot length")
                    if any(value < 0 for value in segment.role_minimums.values()):
                        raise ClockError("Role staffing demand cannot be negative")
                    demand.append((segment_start, segment_end, segment.minimum, segment.role_minimums))
            total_minutes = minutes_between(preparation, work_end)
            if total_minutes <= 0 or total_minutes % rules.slot_minutes:
                raise ClockError("Pattern interval must align with the configured time slot length")
            slots: list[DemandSlot] = []
            instant = preparation
            while instant < work_end:
                next_instant = instant + timedelta(minutes=rules.slot_minutes)
                if rules.pattern_only:
                    slots.append(DemandSlot(day, instant, next_instant, 0, {}))
                else:
                    covering = [segment for segment in demand if segment[0] <= instant and next_instant <= segment[1]]
                    if len(covering) != 1:
                        raise ClockError(f"Demand is {'missing' if not covering else 'overlapping'} at {instant.astimezone(zone).isoformat()}")
                    segment = covering[0]
                    slots.append(DemandSlot(day, instant, next_instant, segment[2], dict(segment[3])))
                instant = next_instant
            pattern_names = [pattern.name for pattern in current.patterns]
            if len(pattern_names) != len(set(pattern_names)):
                raise ClockError("Shift pattern names must be unique within each day")
            pattern_roles = {pattern.role_code for pattern in current.patterns}
            for segment in ([] if rules.pattern_only else current.demand):
                unmatched_roles = sorted(role for role, minimum in segment.role_minimums.items()
                                         if minimum > 0 and role not in pattern_roles)
                if unmatched_roles:
                    raise ClockError(f"Demand segment {segment.start}–{segment.end} requires formal role(s) "
                                     f"{', '.join(unmatched_roles)} without a complete shift pattern")
            if any(name not in pattern_names or minimum < 0
                   for name, minimum in current.pattern_minimums.items()):
                raise ClockError("Pattern staffing minimum needs an existing pattern and a nonnegative count")
            for pattern in current.patterns:
                if not pattern.role_code:
                    raise ClockError(f"Pattern {pattern.name} has no qualified role")
                break_grid = pattern.break_rule.granularity_minutes or rules.slot_minutes
                if (pattern.break_rule.count and
                    (rules.slot_minutes % break_grid or pattern.break_rule.duration_minutes % break_grid
                     or (rules.requirement_mode not in {"PATTERN_AND_COVERAGE", "EXACT_SCHEDULED"}
                         and break_grid != rules.slot_minutes))):
                    raise ClockError(f"Pattern {pattern.name} break duration must align with its configured break grid")
                for start_clock in pattern.starts:
                    start = local_instant(day, start_clock, zone)
                    for end_clock in pattern.ends:
                        end = local_instant(day, end_clock, zone, pattern.end_next_day)
                        duration = minutes_between(start, end)
                        if start < preparation or end > work_end or start >= end:
                            raise ClockError(f"Pattern {pattern.name} falls outside the complete work day")
                        if minutes_between(preparation, start) % rules.slot_minutes or minutes_between(preparation, end) % rules.slot_minutes:
                            raise ClockError(f"Pattern {pattern.name} must align with the staffing slot grid")
                        if (duration < pattern.break_rule.duration_minutes * pattern.break_rule.count or
                            (rules.enforce_work_rest_limits and
                             (duration < rules.compliance.minimum_shift_minutes or
                              duration > rules.compliance.maximum_shift_minutes))):
                            raise ClockError(f"Pattern {pattern.name} includes an illegal complete shift {start_clock}–{end_clock}")
                        if (rules.enforce_work_rest_limits and
                            duration > rules.compliance.required_break_after_minutes and pattern.break_rule.count == 0):
                            raise ClockError(f"Pattern {pattern.name} needs a configured break")
                        net_work = duration - (0 if pattern.break_rule.paid else
                                               pattern.break_rule.count * pattern.break_rule.duration_minutes)
                        if rules.enforce_work_rest_limits and net_work > rules.compliance.maximum_daily_work_minutes:
                            errors.append(Diagnostic(code="DAILY_WORK_LIMIT", certainty="CONFIG", date=day,
                                message=f"Pattern {pattern.name} {start_clock}–{end_clock} has {net_work} net work minutes, "
                                        f"above the store daily limit of {rules.compliance.maximum_daily_work_minutes}"))
                        if rules.enforce_work_rest_limits and net_work > rules.compliance.maximum_weekly_work_minutes:
                            errors.append(Diagnostic(code="WEEKLY_WORK_LIMIT", certainty="CONFIG", date=day,
                                message=f"Pattern {pattern.name} {start_clock}–{end_clock} has {net_work} net work minutes, "
                                        f"above the store weekly limit of {rules.compliance.maximum_weekly_work_minutes}"))
                        options = break_options(day, start, end, rules, pattern)
                        if not options:
                            errors.append(Diagnostic(code="BREAK_WINDOW", certainty="CONFIG", date=day,
                                message=f"No legal break placement for {pattern.name} {start_clock}–{end_clock}"))
                        elif len(options) > 500:
                            errors.append(Diagnostic(code="BREAK_OPTIONS", certainty="CONFIG", date=day,
                                message=f"Pattern {pattern.name} {start_clock}–{end_clock} produces more than 500 break options; use a coarser rule"))
                if pattern.break_rule.count and not rules.pattern_only:
                    local_instant(day, pattern.break_rule.earliest, zone, pattern.break_rule.earliest_next_day)
                    local_instant(day, pattern.break_rule.latest_end, zone, pattern.break_rule.latest_end_next_day)
            days.append(CompiledDay(day, current, preparation, opening, closing, work_end, tuple(slots)))
        except ClockError as error:
            errors.append(Diagnostic(code="RULE_CONFIG", message=str(error), certainty="CONFIG", date=day))
        day += timedelta(days=1)
    for previous, current in zip(days, days[1:]):
        if rules.pattern_only:
            continue
        if previous.work_end > current.preparation:
            errors.append(Diagnostic(code="OVERLAPPING_WORK_DAYS", certainty="CONFIG",
                date=current.day, start=current.preparation, end=previous.work_end,
                message=f"{previous.day} employee work interval overlaps {current.day}; configure one unambiguous demand timeline"))
    return days, errors
