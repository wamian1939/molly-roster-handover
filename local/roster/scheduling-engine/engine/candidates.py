from __future__ import annotations

from datetime import date, datetime, timedelta
from hashlib import sha256
from itertools import combinations

from .clock import ClockError, local_instant, minutes_between, overlaps, timezone_for
from .config import CompiledDay
from .models import Candidate, Diagnostic, RuleSet, Snapshot, StaffMember, TimeWindow


def completely_available(employee_id: str, start: datetime, end: datetime, availability: list[TimeWindow]) -> bool:
    windows = sorted((item for item in availability if item.employee_id == employee_id and item.end > start and item.start < end),
                     key=lambda item: (item.start, item.end))
    cursor = start
    for window in windows:
        if window.start > cursor:
            return False
        cursor = max(cursor, window.end)
        if cursor >= end:
            return True
    return False


def blocked(employee_id: str, start: datetime, end: datetime, windows: list[TimeWindow]) -> bool:
    return any(item.employee_id == employee_id and overlaps(start, end, item.start, item.end) for item in windows)


def break_options(day: date, start: datetime, end: datetime, rules: RuleSet, pattern) -> list[list[tuple[datetime, datetime]]]:
    specification = pattern.break_rule
    if specification.count == 0:
        return [[]]
    break_grid = specification.granularity_minutes or rules.slot_minutes
    if rules.slot_minutes % break_grid or specification.duration_minutes % break_grid:
        return []
    if rules.pattern_only:
        options = []
        current = start
        while current + timedelta(minutes=specification.duration_minutes) <= end:
            options.append((current, current + timedelta(minutes=specification.duration_minutes)))
            current += timedelta(minutes=break_grid)
        if specification.count == 1:
            return [[option] for option in options]
        return [[first, second] for first, second in combinations(options, 2)
                if first[1] <= second[0]]
    zone = timezone_for(rules.timezone)
    earliest = max(start, local_instant(day, specification.earliest, zone, specification.earliest_next_day))
    latest = min(end, local_instant(day, specification.latest_end, zone, specification.latest_end_next_day))
    if earliest >= latest:
        return []
    options: list[tuple[datetime, datetime]] = []
    before_minutes = specification.minimum_work_before_break_slots * rules.slot_minutes
    after_minutes = specification.minimum_work_after_break_slots * rules.slot_minutes
    between_minutes = specification.minimum_work_between_breaks_slots * rules.slot_minutes
    minutes_after_start = minutes_between(start, earliest)
    grid_steps = (minutes_after_start + break_grid - 1) // break_grid
    current = start + timedelta(minutes=grid_steps * break_grid)
    while current + timedelta(minutes=specification.duration_minutes) <= latest:
        after = current + timedelta(minutes=specification.duration_minutes)
        if minutes_between(start, current) >= before_minutes and minutes_between(after, end) >= after_minutes:
            options.append((current, after))
        current += timedelta(minutes=break_grid)
    if specification.count == 1:
        return [[option] for option in options]
    paired = [[first, second] for first, second in combinations(options, 2)
              if first[1] + timedelta(minutes=between_minutes) <= second[0]]
    return paired


def generate_candidates(snapshot: Snapshot, rules: RuleSet, days: list[CompiledDay]) -> tuple[list[Candidate], list[Diagnostic]]:
    result: list[Candidate] = []
    errors: list[Diagnostic] = []
    zone = timezone_for(rules.timezone)
    leave = snapshot.approved_leave
    external = [shift for shift in snapshot.existing_shifts if shift.store_id != snapshot.store_id or shift.status in {"PUBLISHED", "LOCKED"}]
    stable = [shift for shift in snapshot.existing_shifts if shift.store_id == snapshot.store_id and shift.status == "DRAFT"]
    for current in days:
        for pattern in current.rules.patterns:
            latest_start = max(local_instant(current.day, clock, zone) for clock in pattern.starts)
            for start_clock in pattern.starts:
                start = local_instant(current.day, start_clock, zone)
                for end_clock in pattern.ends:
                    end = local_instant(current.day, end_clock, zone, pattern.end_next_day)
                    duration = minutes_between(start, end)
                    if (rules.enforce_work_rest_limits and
                        (duration < rules.compliance.minimum_shift_minutes or
                         duration > rules.compliance.maximum_shift_minutes)):
                        continue
                    if (rules.enforce_work_rest_limits and duration >
                        rules.compliance.maximum_daily_work_minutes +
                        pattern.break_rule.duration_minutes * pattern.break_rule.count * int(not pattern.break_rule.paid)):
                        continue
                    options = break_options(current.day, start, end, rules, pattern)
                    if not options:
                        errors.append(Diagnostic(code="BREAK_WINDOW", message=f"No legal break placement for {pattern.name} {start_clock}–{end_clock}", certainty="CONFIG", date=current.day))
                        continue
                    if len(options) > 500:
                        errors.append(Diagnostic(code="BREAK_OPTIONS", message=f"Pattern {pattern.name} produces more than 500 break options; use a coarser rule", certainty="CONFIG", date=current.day))
                        continue
                    for employee in sorted(snapshot.employees, key=lambda item: item.id):
                        if (employee.store_id != snapshot.store_id
                            or pattern.role_code not in employee.qualified_roles
                            or not snapshot.role_required_skills.get(pattern.role_code, set()) <= employee.skill_codes):
                            continue
                        employee_compliance = rules.compliance_for(employee.id)
                        net_minutes = duration - (0 if pattern.break_rule.paid else
                            pattern.break_rule.count * pattern.break_rule.duration_minutes)
                        if rules.enforce_work_rest_limits and net_minutes > employee_compliance.maximum_daily_work_minutes:
                            continue
                        if not completely_available(employee.id, start, end, snapshot.availability):
                            continue
                        if blocked(employee.id, start, end, leave):
                            continue
                        if any(shift.employee_id == employee.id and
                               (overlaps(start, end, shift.start, shift.end)
                                or (rules.enforce_work_rest_limits and
                                    (0 <= minutes_between(shift.end, start) < employee_compliance.minimum_rest_minutes
                                     or 0 <= minutes_between(end, shift.start) < employee_compliance.minimum_rest_minutes)))
                               for shift in external):
                            continue
                        matching_drafts = [shift for shift in stable
                            if shift.employee_id == employee.id and shift.role_code == pattern.role_code
                            and shift.start == start and shift.end == end
                            and shift.break_minutes_unknown == pattern.break_rule.count * pattern.break_rule.duration_minutes]
                        stable_break_options = [index for index, option in enumerate(options)
                            if any((draft.break_start is None and draft.break_end is None)
                                   or (draft.break_start is not None and draft.break_end is not None
                                       and option == [(draft.break_start, draft.break_end)])
                                   for draft in matching_drafts)]
                        identity = f"{employee.id}|{current.day}|{pattern.name}|{pattern.role_code}|{start.isoformat()}|{end.isoformat()}"
                        result.append(Candidate(id=sha256(identity.encode()).hexdigest()[:20], employee_id=employee.id,
                            date=current.day, pattern_name=pattern.name, role_code=pattern.role_code,
                            start=start, end=end, preferred=pattern.preferred,
                            early_late_start=pattern.allow_early_late_start and start < latest_start,
                            break_options=options, paid_break=pattern.break_rule.paid,
                            matched_existing=bool(stable_break_options),
                            stable_break_options=stable_break_options))
    return result, errors
