from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, datetime
from zoneinfo import ZoneInfo

from .clock import aligned_to_slot, local_instant, minutes_between, overlaps, timezone_for
from .config import CompiledDay, compile_rules, opening_slots
from .models import AssignedShift, CoverageSlot, RuleSet, ShiftPattern, Snapshot, SolveMode, TimeWindow


def _availability_covers(employee_id: str, start: datetime, end: datetime,
                         windows: list[TimeWindow]) -> bool:
    """Replay availability from source intervals, independent of candidate filtering."""
    intervals = sorted((item.start, item.end) for item in windows
                       if item.employee_id == employee_id and item.start < end and item.end > start)
    covered_until = start
    for begin, finish in intervals:
        if begin > covered_until:
            return False
        if finish > covered_until:
            covered_until = finish
        if covered_until >= end:
            return True
    return False


def _breaks_follow_pattern(shift: AssignedShift, pattern: ShiftPattern, rules: RuleSet,
                           zone: ZoneInfo) -> bool:
    """Check the saved breaks against the rule, without trusting generated options."""
    specification = pattern.break_rule
    if len(shift.breaks) != specification.count or shift.paid_break != specification.paid:
        return False
    if shift.breaks != sorted(shift.breaks):
        return False
    if not shift.breaks:
        return True
    if rules.pattern_only:
        return all(
            shift.start <= begin < finish <= shift.end
            and minutes_between(begin, finish) == specification.duration_minutes
            and aligned_to_slot(shift.start, begin, rules.slot_minutes)
            and aligned_to_slot(shift.start, finish, rules.slot_minutes)
            for begin, finish in shift.breaks
        ) and all(before[1] <= after[0] for before, after in zip(shift.breaks, shift.breaks[1:]))
    earliest = local_instant(shift.date, specification.earliest, zone, specification.earliest_next_day)
    latest = local_instant(shift.date, specification.latest_end, zone, specification.latest_end_next_day)
    for begin, finish in shift.breaks:
        if (begin < shift.start or finish > shift.end or begin < earliest or finish > latest
            or begin >= finish or minutes_between(begin, finish) != specification.duration_minutes
            or not aligned_to_slot(shift.start, begin, rules.slot_minutes)
            or not aligned_to_slot(shift.start, finish, rules.slot_minutes)):
            return False
    if shift.breaks:
        if (minutes_between(shift.start, shift.breaks[0][0]) <
                specification.minimum_work_before_break_slots * rules.slot_minutes):
            return False
        if (minutes_between(shift.breaks[-1][1], shift.end) <
                specification.minimum_work_after_break_slots * rules.slot_minutes):
            return False
        if any(minutes_between(before[1], after[0]) <
               specification.minimum_work_between_breaks_slots * rules.slot_minutes
               for before, after in zip(shift.breaks, shift.breaks[1:])):
            return False
    return True


def calculate_coverage(assignments: list[AssignedShift], days: list[CompiledDay]) -> list[CoverageSlot]:
    result: list[CoverageSlot] = []
    for day in days:
        for slot in day.slots:
            present = [shift for shift in assignments if shift.start <= slot.start and slot.end <= shift.end]
            on_break = [shift for shift in present if any(begin < slot.end and slot.start < finish for begin, finish in shift.breaks)]
            active = [shift for shift in present if shift not in on_break]
            roles = {role: sum(shift.role_code == role for shift in active) for role in slot.role_required}
            effective = len(active)
            result.append(CoverageSlot(date=day.day, start=slot.start, end=slot.end, required=slot.required,
                scheduled=len(present), on_break=len(on_break), effective=effective,
                excess=max(0, effective - slot.required), gap=max(0, slot.required - effective),
                role_required=slot.role_required, role_effective=roles))
    return result


def verify_result(snapshot: Snapshot, rules: RuleSet, days: list[CompiledDay], assignments: list[AssignedShift], mode: SolveMode) -> list[str]:
    errors: list[str] = []
    staff = {employee.id: employee for employee in snapshot.employees}
    day_by_date = {day.day: day for day in days}
    selected_mondays = {date.fromordinal(day.day.toordinal() - day.day.weekday()) for day in days}
    zone = timezone_for(rules.timezone)
    by_employee: dict[str, list[AssignedShift]] = defaultdict(list)
    def fixed_key(shift):
        return (shift.employee_id, shift.store_id, shift.start, shift.end, shift.role_code)

    required_fixed = Counter(fixed_key(shift) for shift in snapshot.existing_shifts
        if shift.store_id == snapshot.store_id and shift.status in {"PUBLISHED", "LOCKED"}
        and any(shift.start < day.work_end and day.preparation < shift.end for day in days))
    returned_fixed = Counter(fixed_key(shift) for shift in assignments if shift.fixed)
    for (employee_id, _store_id, start, _end, _role), count in (required_fixed - returned_fixed).items():
        errors.append(f"Missing preserved fixed shift for {employee_id} at {start.isoformat()} ({count})")
    for (employee_id, _store_id, start, _end, _role), count in (returned_fixed - required_fixed).items():
        errors.append(f"Unexpected fixed shift for {employee_id} at {start.isoformat()} ({count})")
    fixed_target_net = {(shift.employee_id, shift.store_id, shift.start, shift.end): shift.net_work_minutes
                        for shift in assignments if shift.fixed}
    for shift in assignments:
        employee = staff.get(shift.employee_id)
        if employee is None:
            errors.append(f"Unknown employee {shift.employee_id}")
            continue
        employee_compliance = rules.compliance_for(shift.employee_id)
        if shift.store_id != snapshot.store_id or shift.role_code not in employee.qualified_roles:
            errors.append(f"Unqualified or wrong-store assignment for {shift.employee_id}")
        missing_skills = snapshot.role_required_skills.get(shift.role_code, set()) - employee.skill_codes
        if missing_skills:
            errors.append(f"Missing required skills for {shift.employee_id} in role {shift.role_code}")
        compiled = day_by_date.get(shift.date)
        if shift.fixed and compiled is None:
            adjacent_days, adjacent_errors = compile_rules(rules, shift.date, shift.date)
            if adjacent_errors:
                errors.append(f"Invalid rule day for fixed shift {shift.employee_id} on {shift.date}")
            else:
                compiled = adjacent_days[0]
        legal = False
        if shift.fixed and compiled:
            matching = [existing for existing in snapshot.existing_shifts
                if existing.employee_id == shift.employee_id and existing.store_id == shift.store_id
                and existing.status in {"PUBLISHED", "LOCKED"}
                and existing.start == shift.start and existing.end == shift.end
                and existing.role_code == shift.role_code]
            for existing in matching:
                if sum(minutes_between(a, b) for a, b in shift.breaks) != existing.break_minutes_unknown:
                    continue
                if existing.break_start is not None and shift.breaks != [(existing.break_start, existing.break_end)]:
                    continue
                legal = any(pattern.name == shift.pattern_name and pattern.role_code == shift.role_code
                    and pattern.break_rule.count * pattern.break_rule.duration_minutes == existing.break_minutes_unknown
                    and any(local_instant(shift.date, clock, zone) == shift.start for clock in pattern.starts)
                    and any(local_instant(shift.date, clock, zone, pattern.end_next_day) == shift.end
                            for clock in pattern.ends)
                    and _breaks_follow_pattern(shift, pattern, rules, zone)
                    for pattern in compiled.rules.patterns)
                if legal:
                    break
        elif compiled:
            for pattern in compiled.rules.patterns:
                if pattern.name != shift.pattern_name or pattern.role_code != shift.role_code:
                    continue
                possible_starts = {local_instant(shift.date, clock, zone) for clock in pattern.starts}
                possible_ends = {local_instant(shift.date, clock, zone, pattern.end_next_day) for clock in pattern.ends}
                if shift.start not in possible_starts or shift.end not in possible_ends:
                    continue
                if not _breaks_follow_pattern(shift, pattern, rules, zone):
                    continue
                legal = True
                break
        if not legal:
            errors.append(f"Shift does not match a legal pattern and break rule for {shift.employee_id}")
        if not shift.fixed and not _availability_covers(shift.employee_id, shift.start, shift.end, snapshot.availability):
            errors.append(f"Availability does not cover {shift.employee_id} on {shift.date}")
        if any(leave.employee_id == shift.employee_id and overlaps(shift.start, shift.end, leave.start, leave.end)
               for leave in snapshot.approved_leave):
            errors.append(f"Approved leave conflict for {shift.employee_id}")
        if any(existing.employee_id == shift.employee_id and
               not (shift.fixed and existing.store_id == shift.store_id
                    and existing.start == shift.start and existing.end == shift.end
                    and existing.role_code == shift.role_code) and
               (overlaps(shift.start, shift.end, existing.start, existing.end)
                or (rules.enforce_work_rest_limits and
                    (0 <= minutes_between(existing.end, shift.start) < employee_compliance.minimum_rest_minutes
                     or 0 <= minutes_between(shift.end, existing.start) < employee_compliance.minimum_rest_minutes)))
               and (existing.store_id != snapshot.store_id or existing.status in {"PUBLISHED", "LOCKED"})
               for existing in snapshot.existing_shifts):
            errors.append(f"Fixed shift conflict for {shift.employee_id}")
        duration = minutes_between(shift.start, shift.end)
        if (rules.enforce_work_rest_limits and
            (duration < rules.compliance.minimum_shift_minutes or duration > rules.compliance.maximum_shift_minutes)):
            errors.append(f"Illegal shift length for {shift.employee_id}")
        if (rules.enforce_work_rest_limits and
            duration > rules.compliance.required_break_after_minutes and not shift.breaks):
            errors.append(f"Missing required break for {shift.employee_id}")
        if any(begin < shift.start or finish > shift.end or begin >= finish for begin, finish in shift.breaks):
            errors.append(f"Break outside shift for {shift.employee_id}")
        if any(not aligned_to_slot(shift.start, begin, rules.slot_minutes)
               or not aligned_to_slot(shift.start, finish, rules.slot_minutes)
               for begin, finish in shift.breaks):
            errors.append(f"Break does not align with staffing slots for {shift.employee_id}")
        if any(overlaps(a[0], a[1], b[0], b[1]) for index, a in enumerate(shift.breaks) for b in shift.breaks[index + 1:]):
            errors.append(f"Overlapping breaks for {shift.employee_id}")
        expected_net = duration - (0 if shift.paid_break else sum(minutes_between(a, b) for a, b in shift.breaks))
        if (expected_net != shift.net_work_minutes or
            (rules.enforce_work_rest_limits and expected_net > employee_compliance.maximum_daily_work_minutes)):
            errors.append(f"Net work minutes invalid for {shift.employee_id}")
        by_employee[shift.employee_id].append(shift)
    for employee_id, shifts in by_employee.items():
        employee_compliance = rules.compliance_for(employee_id)
        shifts.sort(key=lambda item: item.start)
        for before, after in zip(shifts, shifts[1:]):
            rest_minutes = employee_compliance.minimum_rest_minutes if rules.enforce_work_rest_limits else 0
            if minutes_between(before.end, after.start) < rest_minutes:
                errors.append(f"Rest or overlap violation for {employee_id}")
        if not rules.enforce_work_rest_limits:
            continue
        counts: dict[date, int] = defaultdict(int)
        daily_minutes: dict[date, int] = defaultdict(int)
        for shift in shifts:
            if not shift.fixed:
                counts[shift.date] += 1
                daily_minutes[shift.date] += shift.net_work_minutes
        for fixed in snapshot.existing_shifts:
            if fixed.employee_id != employee_id or (fixed.store_id == snapshot.store_id and fixed.status == "DRAFT"):
                continue
            fixed_date = fixed.start.astimezone(zone).date()
            if fixed_date not in day_by_date:
                continue
            counts[fixed_date] += 1
            daily_minutes[fixed_date] += fixed_target_net.get(
                (fixed.employee_id, fixed.store_id, fixed.start, fixed.end),
                minutes_between(fixed.start, fixed.end))
        if any(count > employee_compliance.maximum_shifts_per_day for count in counts.values()):
            errors.append(f"Too many daily shifts for {employee_id}")
        if any(minutes > employee_compliance.maximum_daily_work_minutes for minutes in daily_minutes.values()):
            errors.append(f"Daily work cap exceeded for {employee_id}")
        weekly: dict[date, int] = defaultdict(int)
        for shift in shifts:
            monday = shift.date.fromordinal(shift.date.toordinal() - shift.date.weekday())
            if not shift.fixed:
                weekly[monday] += shift.net_work_minutes
        for fixed in snapshot.existing_shifts:
            if fixed.employee_id != employee_id or (fixed.store_id == snapshot.store_id and fixed.status == "DRAFT"):
                continue
            fixed_date = fixed.start.astimezone(zone).date()
            monday = date.fromordinal(fixed_date.toordinal() - fixed_date.weekday())
            if monday not in selected_mondays:
                continue
            weekly[monday] += fixed_target_net.get(
                (fixed.employee_id, fixed.store_id, fixed.start, fixed.end),
                minutes_between(fixed.start, fixed.end))
        if any(minutes > employee_compliance.maximum_weekly_work_minutes for minutes in weekly.values()):
            errors.append(f"Weekly work cap exceeded for {employee_id}")
    coverage = calculate_coverage(assignments, days)
    coverage_by_start = {slot.start: slot for slot in coverage}
    for day in days:
        for pattern_name, minimum in day.rules.pattern_minimums.items():
            actual = sum(shift.date == day.day and shift.pattern_name == pattern_name for shift in assignments)
            if rules.pattern_only and actual > minimum:
                errors.append(f"{pattern_name} shift count exceeds configured count on {day.day}")
            elif mode == SolveMode.STRICT and actual < minimum:
                errors.append(f"{pattern_name} shift count gap on {day.day}")
        for opening_slot in (() if rules.pattern_only else opening_slots(day)):
            effective = coverage_by_start[opening_slot.start].effective
            if mode == SolveMode.STRICT and effective < day.rules.opening_minimum:
                errors.append(f"Opening headcount gap at {opening_slot.start.isoformat()}")
            qualified = sum(staff[shift.employee_id].opening_qualified
                            for shift in assignments if shift.employee_id in staff and shift.start <= opening_slot.start
                            and opening_slot.end <= shift.end and not any(
                                a < opening_slot.end and opening_slot.start < b for a, b in shift.breaks))
            if mode == SolveMode.STRICT and qualified < day.rules.opening_qualified_minimum:
                errors.append(f"Opening qualification gap at {opening_slot.start.isoformat()}")
    if mode == SolveMode.STRICT and not rules.pattern_only:
        for slot in coverage:
            if slot.gap or any(slot.role_effective.get(role, 0) < required for role, required in slot.role_required.items()):
                errors.append(f"Demand gap at {slot.start.isoformat()}")
    return errors
