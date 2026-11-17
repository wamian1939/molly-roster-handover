"""Isolated scheduling experiment with legacy and opt-in two-layer rules.

The Lab API uses this module for read-only exploratory runs. Legacy rules
interpret positive weekday pattern counts as successive exact scheduled
headcounts. PATTERN_AND_COVERAGE instead enforces separate pattern bounds and
effective staffing requirements. Neither mode writes formal roster shifts.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from math import gcd
from time import monotonic
from uuid import uuid4

from ortools.sat.python import cp_model

from .candidates import break_options, generate_candidates
from .clock import aligned_to_slot, local_instant, minutes_between, overlaps, timezone_for
from .config import CompiledDay, compile_rules
from .models import (AssignedShift, Candidate, CoverageSlot, Diagnostic, RuleSet, ScoreAllocation,
                     RunResult, Snapshot, SolveMode, SolveStatus, TimeWindow)


@dataclass(frozen=True)
class V2Policy:
    optional_patterns: frozenset[str] = frozenset({"Full"})
    max_shifts_per_day: int = 1
    # No contract or store values are inferred from historical Lab defaults.
    max_weekly_minutes: int | None = None
    employee_weekly_minutes: dict[str, int] = field(default_factory=dict)
    min_rest_minutes: int = 0
    employee_rest_minutes: dict[str, int] = field(default_factory=dict)
    excess_slot_weight: int = 1000
    net_work_slot_weight: int = 1
    shift_count_weight: int = 1
    # Scores are useful only for slots credited against actual demand.
    official_score_weight: int = 1
    # Cost uses cents; it requires a cost for every candidate.
    labor_cost_weight: int = 0
    fairness_weight: int = 1
    pattern_preference_weight: int = 1
    employee_hourly_cost_cents: dict[str, int] = field(default_factory=dict)
    employee_expected_weekly_minutes: dict[str, int] = field(default_factory=dict)
    # Positive values favor a pattern; negative values discourage it.
    employee_pattern_preferences: dict[str, dict[str, int]] = field(default_factory=dict)
    coverage_time_fraction: float = 0.55
    # Zero means that every lexicographic stage runs until proved or infeasible.
    solve_seconds: int = 30


@dataclass(frozen=True)
class CoverageRequirement:
    day: date
    start: datetime
    end: datetime
    role_required: dict[str, int]
    minimum: int | None = None
    target: int | None = None
    maximum: int | None = None

    @property
    def required(self) -> int:
        return self.minimum if self.minimum is not None else sum(self.role_required.values())


def _first_required_slots(requirements: list[CoverageRequirement]) -> list[CoverageRequirement]:
    """The first required slot of each day fixes its opening headcount."""
    first: dict[date, CoverageRequirement] = {}
    for slot in requirements:
        if slot.day not in first or slot.start < first[slot.day].start:
            first[slot.day] = slot
    return list(first.values())


def _opening_continuity_ends(requirements: list[CoverageRequirement],
                             rules: RuleSet, policy: V2Policy) -> dict[date, datetime]:
    """Opening staff stay through the following staffing phase."""
    by_day: dict[date, list[CoverageRequirement]] = defaultdict(list)
    for slot in requirements:
        by_day[slot.day].append(slot)
    ends = {}
    for day, slots in by_day.items():
        slots.sort(key=lambda slot: slot.start)
        zone = timezone_for(rules.timezone)
        phases = sorted({(max(local_instant(day, clock, zone) for clock in pattern.starts),
                          max(local_instant(day, clock, zone, pattern.end_next_day)
                              for clock in pattern.ends))
                         for pattern in rules.for_date(day).patterns
                         if rules.for_date(day).pattern_minimums.get(pattern.name, 0) > 0
                         and pattern.name not in policy.optional_patterns})
        if len(phases) < 2 or phases[0][0] != slots[0].start or phases[1][0] > phases[0][1]:
            ends[day] = slots[0].end
            continue
        ends[day] = min(phases[1][1], phases[2][0] if len(phases) > 2 else slots[-1].end)
    return ends


def _pattern_limits(rules: RuleSet, day: date) -> dict[str, tuple[int, int | None]]:
    current = rules.for_date(day)
    configured = rules.weekly_pattern_bounds.get(day.weekday(), {})
    if set(configured) - {pattern.name for pattern in current.patterns}:
        raise ValueError(f"Unknown pattern bound on {day}")
    limits = {}
    for pattern in current.patterns:
        inherited = current.pattern_minimums.get(pattern.name, 0)
        bound = configured.get(pattern.name)
        if bound and bound.minimum is not None and bound.minimum < inherited:
            raise ValueError(f"Pattern {pattern.name} bound cannot lower the saved weekday minimum on {day}")
        if bound and bound.exact is not None and bound.exact < inherited:
            raise ValueError(f"Pattern {pattern.name} exact count cannot lower the saved weekday minimum on {day}")
        minimum = bound.minimum if bound and bound.minimum is not None else inherited
        if bound and bound.exact is not None:
            # `exact` takes precedence over the legacy allow_extra default.
            minimum = maximum = bound.exact
        else:
            maximum = bound.maximum if bound else None
            if bound and not bound.allow_extra:
                maximum = minimum if maximum is None else min(maximum, minimum)
        if maximum is not None and maximum < minimum:
            raise ValueError(f"Pattern {pattern.name} minimum exceeds maximum on {day}")
        limits[pattern.name] = (minimum, maximum)
    return limits


def _explicit_exact(rules: RuleSet, day: date, pattern_name: str) -> bool:
    bound = rules.weekly_pattern_bounds.get(day.weekday(), {}).get(pattern_name)
    return bool(bound and (bound.exact is not None or
        (bound.minimum is not None and bound.maximum == bound.minimum)))


def _fully_exact_days(rules: RuleSet, dates: set[date]) -> set[date]:
    """Only explicitly equal bounds make coverage hard even in best-effort mode."""
    return {day for day in dates if all(_explicit_exact(rules, day, name)
        for name in _pattern_limits(rules, day))}


def _pattern_max_conflicts(rules: RuleSet, days: list[CompiledDay]) -> list[Diagnostic]:
    """Prove a pattern/minimum versus hard coverage maximum conflict by minutes.

    Every required copy of a pattern contributes at least the shortest overlap
    of its legal variants, less its entire break allowance. This deliberately
    underestimates staffing, so a reported conflict cannot be a false positive.
    """
    zone = timezone_for(rules.timezone)
    conflicts = []
    for day in days:
        limits = _pattern_limits(rules, day.day)
        for band in rules.weekly_coverage.get(day.day.weekday(), []):
            if band.max_staff is None:
                continue
            begin = local_instant(day.day, band.start, zone)
            finish = local_instant(day.day, band.end, zone)
            minimum_person_minutes = 0
            contributors = []
            for pattern in day.rules.patterns:
                minimum, _maximum = limits[pattern.name]
                if not minimum:
                    continue
                variants = [max(0, minutes_between(max(begin, local_instant(day.day, start, zone)),
                    min(finish, local_instant(day.day, end, zone, pattern.end_next_day))))
                    for start in pattern.starts for end in pattern.ends
                    if local_instant(day.day, start, zone) < local_instant(
                        day.day, end, zone, pattern.end_next_day)]
                least = max(0, min(variants, default=0)
                            - pattern.break_rule.count * pattern.break_rule.duration_minutes)
                minimum_person_minutes += minimum * least
                if least:
                    contributors.append(f"{pattern.name} {minimum} x {least}min")
            capacity = band.max_staff * minutes_between(begin, finish)
            if minimum_person_minutes > capacity:
                conflicts.append(Diagnostic(code="V2_PATTERN_COVERAGE_MAX_CONFLICT",
                    certainty="PROVEN", date=day.day, start=begin, end=finish,
                    message=(f"Required patterns force at least {minimum_person_minutes} active person-minutes "
                             f"in {band.start}-{band.end}, above hard maximum capacity {capacity}; "
                             + ", ".join(contributors))))
    return conflicts


def _pattern_eligibility_conflicts(rules: RuleSet, days: list[CompiledDay],
                                   candidates: list[Candidate], fixed: list[AssignedShift],
                                   policy: V2Policy) -> list[Diagnostic]:
    """Prove shortages when distinct available people cannot fill pattern minima."""
    if policy.max_shifts_per_day != 1:
        return []
    conflicts = []
    for day in days:
        fixed_people = {item.employee_id for item in fixed if item.date == day.day}
        positions = []
        pools = {}
        for name, (minimum, _maximum) in _pattern_limits(rules, day.day).items():
            fixed_count = sum(item.date == day.day and item.pattern_name == name for item in fixed)
            remaining = max(0, minimum - fixed_count)
            positions.extend([name] * remaining)
            pools[name] = {item.employee_id for item in candidates
                           if item.date == day.day and item.pattern_name == name
                           and item.employee_id not in fixed_people}
        assigned: dict[str, int] = {}

        def augment(position: int, seen: set[str]) -> bool:
            for person in sorted(pools[positions[position]]):
                if person in seen:
                    continue
                seen.add(person)
                if person not in assigned or augment(assigned[person], seen):
                    assigned[person] = position
                    return True
            return False

        matched = sum(augment(index, set()) for index in range(len(positions)))
        if matched < len(positions):
            counts = ', '.join(f'{name}: need {positions.count(name)}, eligible {len(pools[name])}'
                               for name in pools if positions.count(name))
            conflicts.append(Diagnostic(code="V2_PATTERN_ELIGIBILITY_SHORTAGE",
                certainty="PROVEN", date=day.day,
                message=(f"At most {matched} of {len(positions)} required pattern shifts can be filled "
                         f"by distinct qualified and available employees; {counts}")))
    return conflicts


def _coverage_eligibility_conflicts(requirements: list[CoverageRequirement],
                                    candidates: list[Candidate],
                                    fixed: list[AssignedShift],
                                    scheduled: bool = False) -> list[Diagnostic]:
    """A safe upper bound on available workers, ignoring other constraints."""
    conflicts = []
    for slot in requirements:
        people = {item.employee_id for item in candidates
                  if item.start <= slot.start and slot.end <= item.end
                  and (scheduled or any(not _active_breaks(option, slot)
                                        for option in item.break_options))}
        people.update(item.employee_id for item in fixed
                      if item.start <= slot.start and slot.end <= item.end)
        if len(people) < slot.required:
            conflicts.append(Diagnostic(code="V2_COVERAGE_ELIGIBILITY_SHORTAGE",
                certainty="PROVEN", date=slot.day, start=slot.start, end=slot.end,
                message=(f"At most {len(people)} distinct qualified and available workers can cover "
                         f"this slot; {'exact scheduled count' if scheduled else 'effective minimum'} "
                         f"is {slot.required}")))
    return conflicts


def compile_coverage(rules: RuleSet, start: date, end: date,
                     policy: V2Policy) -> tuple[list[CompiledDay], list[CoverageRequirement], list[Diagnostic]]:
    if not rules.pattern_only:
        return [], [], [Diagnostic(code="V2_RULE", certainty="CONFIG",
            message="V2 requires the current seven-day pattern-count rule")]
    days, errors = compile_rules(rules, start, end)
    if errors:
        return [], [], errors
    zone = timezone_for(rules.timezone)
    requirements: list[CoverageRequirement] = []
    if rules.requirement_mode in {"PATTERN_AND_COVERAGE", "EXACT_SCHEDULED"}:
        exact_scheduled = rules.requirement_mode == "EXACT_SCHEDULED"
        for day in days:
            try:
                _pattern_limits(rules, day.day)
            except ValueError as error:
                errors.append(Diagnostic(code="V2_PATTERN_BOUNDS", certainty="CONFIG",
                    date=day.day, message=str(error)))
            bands = (rules.weekly_exact_staffing if exact_scheduled
                     else rules.weekly_coverage).get(day.day.weekday(), [])
            if not bands:
                errors.append(Diagnostic(code="V2_COVERAGE_MISSING", certainty="CONFIG", date=day.day,
                    message="No time-indexed coverage is configured for this weekday"))
                continue
            intervals = []
            for band in bands:
                try:
                    begin = local_instant(day.day, band.start, zone)
                    finish = local_instant(day.day, band.end, zone)
                except Exception as error:
                    errors.append(Diagnostic(code="V2_COVERAGE_CLOCK", certainty="CONFIG", date=day.day,
                        message=str(error)))
                    continue
                if (begin >= finish or begin < day.preparation or finish > day.work_end
                    or minutes_between(day.preparation, begin) % rules.slot_minutes
                    or minutes_between(begin, finish) % rules.slot_minutes):
                    errors.append(Diagnostic(code="V2_COVERAGE_INTERVAL", certainty="CONFIG", date=day.day,
                        message=f"Invalid or unaligned coverage interval {band.start}-{band.end}"))
                    continue
                unknown_roles = (set() if exact_scheduled else set(band.role_minimums)
                                 - {p.role_code for p in day.rules.patterns})
                if unknown_roles:
                    errors.append(Diagnostic(code="V2_COVERAGE_ROLE", certainty="CONFIG", date=day.day,
                        message=f"Coverage references unknown formal roles: {sorted(unknown_roles)}"))
                intervals.append((begin, finish, band))
            coverage_minutes = rules.slot_minutes
            for pattern in day.rules.patterns:
                if pattern.break_rule.count:
                    coverage_minutes = gcd(coverage_minutes,
                        pattern.break_rule.granularity_minutes or rules.slot_minutes)
                    coverage_minutes = gcd(coverage_minutes, pattern.break_rule.duration_minutes)
            cursor = day.preparation
            while cursor < day.work_end:
                slot_start, slot_end = cursor, cursor + timedelta(minutes=coverage_minutes)
                cursor = slot_end
                covering = [band for begin, finish, band in intervals
                            if begin <= slot_start and slot_end <= finish]
                if len(covering) != 1:
                    errors.append(Diagnostic(code="V2_COVERAGE_TIMELINE", certainty="CONFIG", date=day.day,
                        start=slot_start, end=slot_end,
                        message="Coverage bands must cover each shift-window slot exactly once"))
                    continue
                band = covering[0]
                if exact_scheduled:
                    requirements.append(CoverageRequirement(day.day, slot_start, slot_end,
                        {"__any__": band.staff}))
                else:
                    roles = band.role_minimums or {"__any__": band.min_staff}
                    requirements.append(CoverageRequirement(day.day, slot_start, slot_end,
                        roles, band.min_staff, band.target_staff, band.max_staff))
        return days, requirements, errors
    for day in days:
        phases: dict[str, list[tuple[datetime, datetime, int]]] = defaultdict(list)
        for pattern in day.rules.patterns:
            count = day.rules.pattern_minimums.get(pattern.name)
            if count is None:
                errors.append(Diagnostic(code="V2_RULE", certainty="CONFIG", date=day.day,
                    message=f"Missing weekday count for {pattern.name}"))
                continue
            if pattern.name in policy.optional_patterns:
                if count:
                    errors.append(Diagnostic(code="V2_OPTIONAL_COUNT", certainty="CONFIG", date=day.day,
                        message=f"{pattern.name} is an optional candidate, so its saved count must be zero"))
                continue
            if count == 0:
                continue
            # A pattern with several legal starts owns the phase at its latest
            # start. Earlier starts remain legal candidate shifts.
            phase_start = max(local_instant(day.day, value, zone) for value in pattern.starts)
            phase_end = max(local_instant(day.day, value, zone, pattern.end_next_day)
                            for value in pattern.ends)
            phases[pattern.role_code].append((phase_start, phase_end, count))
        timelines: dict[str, list[tuple[datetime, datetime, int]]] = {}
        for role, entries in phases.items():
            entries.sort(key=lambda item: item[0])
            if len({item[0] for item in entries}) != len(entries):
                errors.append(Diagnostic(code="V2_AMBIGUOUS_PHASE", certainty="CONFIG", date=day.day,
                    message=f"Several required {role} patterns start the same demand phase"))
                continue
            spans = []
            for index, (begin, finish, count) in enumerate(entries):
                boundary = min(entries[index + 1][0], finish) if index + 1 < len(entries) else finish
                if boundary <= begin:
                    errors.append(Diagnostic(code="V2_PHASE_GAP", certainty="CONFIG", date=day.day,
                        message=f"A {role} demand phase is not covered by its defining pattern"))
                else:
                    spans.append((begin, boundary, count))
            timelines[role] = spans
        for slot in day.slots:
            role_required = {role: count for role, spans in timelines.items()
                             for begin, finish, count in spans
                             if begin <= slot.start and slot.end <= finish}
            if role_required:
                requirements.append(CoverageRequirement(day.day, slot.start, slot.end, role_required))
    return days, requirements, errors


def _active_breaks(breaks: list[tuple[datetime, datetime]], slot: CoverageRequirement) -> bool:
    return any(overlaps(begin, finish, slot.start, slot.end) for begin, finish in breaks)


def _eligible(snapshot: Snapshot, employee_id: str, role: str) -> bool:
    employee = next((item for item in snapshot.employees if item.id == employee_id), None)
    return bool(employee and (role == "__any__" or role in employee.qualified_roles)
                and snapshot.role_required_skills.get(role, set()) <= employee.skill_codes)


def _candidate_net_minutes(item: Candidate) -> int:
    return minutes_between(item.start, item.end) - (0 if item.paid_break else
        sum(minutes_between(begin, finish) for begin, finish in item.break_options[0]))


def _existing_net_minutes(item) -> int:
    return minutes_between(item.start, item.end) - (
        0 if item.paid_break else item.break_minutes_unknown)


def _expected_weekly_minutes(policy: V2Policy, rules: RuleSet, employee) -> int | None:
    configured = rules.employee_preferences.get(employee.id)
    if employee.id in policy.employee_expected_weekly_minutes:
        return policy.employee_expected_weekly_minutes[employee.id]
    if configured is not None and configured.desired_weekly_minutes is not None:
        return configured.desired_weekly_minutes
    return employee.desired_minutes


def _hourly_cost_cents(policy: V2Policy, rules: RuleSet, employee) -> int | None:
    configured = rules.employee_preferences.get(employee.id)
    if employee.id in policy.employee_hourly_cost_cents:
        return policy.employee_hourly_cost_cents[employee.id]
    if configured is not None and configured.hourly_cost_cents is not None:
        return configured.hourly_cost_cents
    return employee.hourly_cost_cents


def _role_matching(snapshot: Snapshot, active: list[AssignedShift],
                   required: dict[str, int]) -> dict[str, int]:
    """Independent bipartite matching: one person fills at most one role per slot."""
    positions = [role for role, count in sorted(required.items()) for _ in range(count)]
    owner: dict[int, int] = {}

    def augment(person: int, seen: set[int]) -> bool:
        for position, role in enumerate(positions):
            if position in seen or not _eligible(snapshot, active[person].employee_id, role):
                continue
            seen.add(position)
            if position not in owner or augment(owner[position], seen):
                owner[position] = person
                return True
        return False

    for person in range(len(active)):
        augment(person, set())
    result = {role: 0 for role in required}
    for position in owner:
        result[positions[position]] += 1
    return result


def replay_coverage(snapshot: Snapshot, assignments: list[AssignedShift],
                    requirements: list[CoverageRequirement]) -> list[CoverageSlot]:
    coverage = []
    for slot in requirements:
        present = [shift for shift in assignments
                   if shift.start <= slot.start and slot.end <= shift.end]
        active = [shift for shift in present if not _active_breaks(shift.breaks, slot)]
        role_effective = _role_matching(snapshot, active, slot.role_required)
        role_gap = sum(max(0, count - role_effective[role])
                       for role, count in slot.role_required.items())
        effective_gap = (max(max(0, slot.required - len(active)), role_gap)
                         if slot.minimum is not None else role_gap)
        gap = (effective_gap if slot.minimum is not None
               else max(0, slot.required - len(present)))
        coverage.append(CoverageSlot(date=slot.day, start=slot.start, end=slot.end,
            required=slot.required, scheduled=len(present), on_break=len(present) - len(active),
            effective=len(active), excess=max(0, len(active) - (slot.target if slot.target is not None else slot.required)),
            gap=gap, effective_gap=effective_gap,
            target_staff=slot.target, max_staff=slot.maximum,
            target_shortfall=max(0, (slot.target if slot.target is not None else slot.required) - len(active)),
            target_excess=max(0, len(active) - (slot.target if slot.target is not None else slot.required)),
            role_required=slot.role_required, role_effective=role_effective))
    return coverage


def _availability_covers(windows: list[TimeWindow], employee_id: str,
                         start: datetime, end: datetime) -> bool:
    cursor = start
    for window in sorted((item for item in windows if item.employee_id == employee_id
                          and item.end > start and item.start < end), key=lambda item: item.start):
        if window.start > cursor:
            return False
        cursor = max(cursor, window.end)
        if cursor >= end:
            return True
    return False


def verify_v2(snapshot: Snapshot, rules: RuleSet, policy: V2Policy,
              candidates: list[Candidate], assignments: list[AssignedShift],
              requirements: list[CoverageRequirement], mode: SolveMode) -> list[str]:
    errors = []
    zone = timezone_for(rules.timezone)
    selected_dates = {slot.day for slot in requirements}
    by_employee: dict[str, list[AssignedShift]] = defaultdict(list)
    allowed = {(item.employee_id, item.date, item.pattern_name, item.role_code,
                item.start, item.end): item for item in candidates}
    for shift in assignments:
        by_employee[shift.employee_id].append(shift)
        if (rules.requirement_mode == "PATTERN_AND_COVERAGE"
            and rules.minimum_complete_shift_minutes is not None
            and minutes_between(shift.start, shift.end) < rules.minimum_complete_shift_minutes):
            errors.append(f"Short complete shift for {shift.employee_id}")
        patterns = [pattern for pattern in rules.for_date(shift.date).patterns
                    if pattern.name == shift.pattern_name and pattern.role_code == shift.role_code]
        if len(patterns) != 1:
            errors.append(f"Unknown pattern for {shift.employee_id}")
        else:
            pattern = patterns[0]
            break_grid = pattern.break_rule.granularity_minutes or rules.slot_minutes
            if (shift.start not in {local_instant(shift.date, clock, zone) for clock in pattern.starts}
                or shift.end not in {local_instant(shift.date, clock, zone, pattern.end_next_day)
                                     for clock in pattern.ends}
                or len(shift.breaks) != pattern.break_rule.count
                or shift.paid_break != pattern.break_rule.paid
                or any(begin < shift.start or finish > shift.end or begin >= finish
                       or minutes_between(begin, finish) != pattern.break_rule.duration_minutes
                       or not aligned_to_slot(shift.start, begin, break_grid)
                       for begin, finish in shift.breaks)
                or any(overlaps(a[0], a[1], b[0], b[1])
                       for index, a in enumerate(shift.breaks)
                       for b in shift.breaks[index+1:])):
                errors.append(f"Illegal shift clock or break for {shift.employee_id}")
            expected_net = minutes_between(shift.start, shift.end) - (
                0 if shift.paid_break else sum(minutes_between(a, b) for a, b in shift.breaks))
            if shift.net_work_minutes != expected_net:
                errors.append(f"Net and paid work minutes disagree for {shift.employee_id}")
        if not _eligible(snapshot, shift.employee_id, shift.role_code):
            errors.append(f"Unqualified shift for {shift.employee_id}")
        if shift.fixed:
            if not any(item.employee_id == shift.employee_id and item.store_id == shift.store_id
                       and item.start == shift.start and item.end == shift.end
                       and item.status in {"PUBLISHED", "LOCKED"}
                       for item in snapshot.existing_shifts):
                errors.append(f"Unrecognized fixed shift for {shift.employee_id}")
        else:
            candidate = allowed.get((shift.employee_id, shift.date, shift.pattern_name,
                                     shift.role_code, shift.start, shift.end))
            if candidate is None or shift.breaks not in candidate.break_options:
                errors.append(f"Invalid complete pattern or break for {shift.employee_id}")
            if not _availability_covers(snapshot.availability, shift.employee_id,
                                        shift.start, shift.end):
                errors.append(f"Availability gap for {shift.employee_id}")
        if any(leave.employee_id == shift.employee_id and
               overlaps(shift.start, shift.end, leave.start, leave.end)
               for leave in snapshot.approved_leave):
            errors.append(f"Leave conflict for {shift.employee_id}")
    required_fixed = {(item.employee_id, item.start, item.end) for item in snapshot.existing_shifts
        if item.store_id == snapshot.store_id and item.status in {"PUBLISHED", "LOCKED"}
        and any(item.start < slot.end and slot.start < item.end for slot in requirements)}
    returned_fixed = {(item.employee_id, item.start, item.end) for item in assignments if item.fixed}
    if required_fixed != returned_fixed:
        errors.append("Fixed-shift preservation mismatch")
    exact_scheduled = rules.requirement_mode == "EXACT_SCHEDULED"
    two_layer = rules.requirement_mode in {"PATTERN_AND_COVERAGE", "EXACT_SCHEDULED"}
    exact_days = _fully_exact_days(rules, selected_dates) if not exact_scheduled and two_layer else set()
    if not two_layer:
        continuity_ends = _opening_continuity_ends(requirements, rules, policy)
        for slot in _first_required_slots(requirements):
            if any(shift.start <= slot.start and slot.end <= shift.end
                   and shift.end < continuity_ends[slot.day] for shift in assignments):
                errors.append(f"Opening staff leave before the following phase ends at "
                              f"{continuity_ends[slot.day].isoformat()}")
    for slot in replay_coverage(snapshot, assignments, requirements):
        if exact_scheduled:
            if slot.scheduled != slot.required:
                errors.append(f"Scheduled staffing differs from exact count at {slot.start.isoformat()}: "
                              f"{slot.scheduled} != {slot.required}")
            continue
        if two_layer:
            if slot.max_staff is not None and slot.effective > slot.max_staff:
                errors.append(f"Effective staffing exceeds hard maximum at {slot.start.isoformat()}")
            if (mode == SolveMode.STRICT or slot.date in exact_days) and slot.gap:
                errors.append(f"Effective staffing below minimum at {slot.start.isoformat()}")
            continue
        if slot.scheduled > slot.required:
            errors.append(f"Scheduled headcount exceeded at {slot.start.isoformat()}: "
                          f"{slot.scheduled} > {slot.required}")
        if mode == SolveMode.STRICT and slot.gap:
            errors.append(f"Scheduled headcount below target at {slot.start.isoformat()}: "
                          f"{slot.scheduled} < {slot.required}")
    if two_layer:
        for day in sorted(selected_dates):
            for pattern_name, (minimum, maximum) in _pattern_limits(rules, day).items():
                actual = sum(shift.date == day and shift.pattern_name == pattern_name
                             for shift in assignments)
                if maximum is not None and actual > maximum:
                    errors.append(f"{pattern_name} exceeds maximum on {day}: {actual} > {maximum}")
                if (mode == SolveMode.STRICT or _explicit_exact(rules, day, pattern_name)) and actual < minimum:
                    errors.append(f"{pattern_name} below minimum on {day}: {actual} < {minimum}")
    for employee_id, shifts in by_employee.items():
        shifts.sort(key=lambda item: item.start)
        daily: dict[date, int] = defaultdict(int)
        for shift in shifts:
            daily[shift.start.astimezone(zone).date()] += 1
        for existing in snapshot.existing_shifts:
            if (existing.employee_id == employee_id and existing.store_id != snapshot.store_id
                and existing.start.astimezone(zone).date() in selected_dates):
                daily[existing.start.astimezone(zone).date()] += 1
        if any(count > policy.max_shifts_per_day for count in daily.values()):
            errors.append(f"Daily shift count exceeded for {employee_id}")
        rest = policy.employee_rest_minutes.get(employee_id, policy.min_rest_minutes)
        for earlier, later in zip(shifts, shifts[1:]):
            if minutes_between(earlier.end, later.start) < rest:
                errors.append(f"Overlap or rest conflict for {employee_id}")
        for existing in snapshot.existing_shifts:
            if existing.employee_id != employee_id or (existing.store_id == snapshot.store_id
                and existing.status == "DRAFT"):
                continue
            if any(shift.fixed and shift.store_id == existing.store_id
                   and shift.start == existing.start and shift.end == existing.end for shift in shifts):
                continue
            if any(min(minutes_between(existing.end, shift.start),
                       minutes_between(shift.end, existing.start)) < rest
                   and (overlaps(existing.start, existing.end, shift.start, shift.end)
                        or (0 <= minutes_between(existing.end, shift.start) < rest)
                        or (0 <= minutes_between(shift.end, existing.start) < rest))
                   for shift in shifts):
                errors.append(f"Existing-shift conflict for {employee_id}")
                break
        cap = policy.employee_weekly_minutes.get(employee_id, policy.max_weekly_minutes)
        if cap is not None:
            weeks = {date.fromordinal(shift.date.toordinal() - shift.date.weekday()) for shift in shifts}
            for monday in weeks:
                new_minutes = sum(shift.net_work_minutes for shift in shifts
                    if date.fromordinal(shift.date.toordinal() - shift.date.weekday()) == monday
                    and not shift.fixed)
                existing_minutes = sum(minutes_between(item.start, item.end)
                                       - (0 if item.paid_break else item.break_minutes_unknown)
                    for item in snapshot.existing_shifts if item.employee_id == employee_id
                    and not (item.store_id == snapshot.store_id and item.status == "DRAFT")
                    and date.fromordinal(item.start.astimezone(zone).date().toordinal()
                        - item.start.astimezone(zone).date().weekday()) == monday)
                if new_minutes + existing_minutes > cap:
                    errors.append(f"Weekly cap exceeded for {employee_id}")
    if mode == SolveMode.STRICT:
        for slot in replay_coverage(snapshot, assignments, requirements):
            if slot.gap:
                errors.append(f"Coverage gap at {slot.start.isoformat()}")
    return errors


def solve_v2(snapshot: Snapshot, rules: RuleSet, start: date, end: date,
             mode: SolveMode = SolveMode.STRICT, policy: V2Policy | None = None) -> RunResult:
    """Solve an isolated coverage scenario; never writes Lab or formal state."""
    begun = monotonic()
    policy = policy or V2Policy()

    def result(status: SolveStatus, diagnostics: list[Diagnostic],
               assignments: list[AssignedShift] | None = None,
               coverage: list[CoverageSlot] | None = None,
               objective: int | None = None, proven: bool = False) -> RunResult:
        return RunResult(run_id=str(uuid4()), engine_version="v2-isolated-0.4",
            store_id=snapshot.store_id, timezone=rules.timezone, start_date=start, end_date=end,
            source=snapshot.source, run_purpose="EXPLORATORY", snapshot_version=snapshot.version,
            rule_version=rules.version, mode=mode, status=status,
            elapsed_ms=int((monotonic() - begun) * 1000), objective_score=objective,
            assignments=assignments or [], coverage=coverage or [], diagnostics=diagnostics,
            parameters={"model": "V2_COVERAGE_EXPERIMENT", "acceptance_gate": "NOT_ELIGIBLE",
                        "formal_roster_write": 0, "priority_proven": int(proven),
                        "coverage_semantics": ("EXACT_SCHEDULED"
                            if rules.requirement_mode == "EXACT_SCHEDULED" else
                            "MIN_EFFECTIVE_WITH_PATTERN_BOUNDS"
                            if rules.requirement_mode == "PATTERN_AND_COVERAGE"
                            else "EXACT_ROSTER_HEADCOUNT"),
                        "pattern_only": int(rules.requirement_mode == "PHASE_HEADCOUNT"),
                        "score_optimization": "NOT_REACHED", "weekly_cap_configured": int(
                            policy.max_weekly_minutes is not None or bool(policy.employee_weekly_minutes)),
                        "rest_configured": int(bool(policy.min_rest_minutes or policy.employee_rest_minutes))})

    if (snapshot.store_id != rules.store_id or snapshot.timezone != rules.timezone
        or policy.max_shifts_per_day < 1 or policy.solve_seconds < 0
        or min(policy.excess_slot_weight, policy.net_work_slot_weight,
               policy.shift_count_weight, policy.min_rest_minutes,
               policy.official_score_weight, policy.labor_cost_weight,
               policy.fairness_weight, policy.pattern_preference_weight) < 0
        or not 0 < policy.coverage_time_fraction < 1
        or (policy.max_weekly_minutes is not None and policy.max_weekly_minutes <= 0)
        or any(value <= 0 for value in policy.employee_weekly_minutes.values())
        or any(value < 0 for value in policy.employee_rest_minutes.values())
        or any(value < 0 for value in policy.employee_expected_weekly_minutes.values())
        or any(value < 0 for value in policy.employee_hourly_cost_cents.values())
        or any(type(value) is not int or not -10 <= value <= 10
               for preferences in policy.employee_pattern_preferences.values()
               for value in preferences.values())):
        return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_INPUT", certainty="CONFIG",
            message="Invalid V2 scope or policy")])
    days, requirements, errors = compile_coverage(rules, start, end, policy)
    if errors or not requirements:
        return result(SolveStatus.CONFIG_ERROR, errors or [Diagnostic(code="V2_NO_DEMAND",
            certainty="CONFIG", message="No coverage requirement was derived")])
    if rules.requirement_mode == "PATTERN_AND_COVERAGE":
        conflicts = _pattern_max_conflicts(rules, days)
        if conflicts:
            return result(SolveStatus.INFEASIBLE, conflicts)
    candidates, errors = generate_candidates(snapshot, rules, days)
    if errors:
        return result(SolveStatus.CONFIG_ERROR, errors)
    if (rules.requirement_mode == "PATTERN_AND_COVERAGE"
        and rules.minimum_complete_shift_minutes is not None):
        candidates = [item for item in candidates
                      if minutes_between(item.start, item.end) >= rules.minimum_complete_shift_minutes]
    zone = timezone_for(rules.timezone)
    fixed_source = [item for item in snapshot.existing_shifts
        if item.store_id == snapshot.store_id and item.status in {"PUBLISHED", "LOCKED"}
        and any(item.start < slot.end and slot.start < item.end for slot in requirements)]
    people = {item.id: item for item in snapshot.employees}
    policy_people = (set(policy.employee_weekly_minutes) | set(policy.employee_rest_minutes)
                     | set(policy.employee_expected_weekly_minutes)
                     | set(policy.employee_hourly_cost_cents)
                     | set(policy.employee_pattern_preferences))
    if policy_people - set(people):
        return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_UNKNOWN_EMPLOYEE",
            certainty="CONFIG", message="V2 policy refers to an employee outside this Snapshot")])
    known_patterns = {pattern.name for day in days for pattern in day.rules.patterns}
    if any(set(preferences) - known_patterns
           for preferences in policy.employee_pattern_preferences.values()):
        return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_UNKNOWN_PATTERN",
            certainty="CONFIG", message="V2 pattern preference refers to an unknown pattern")])
    hourly_cost = {employee.id: _hourly_cost_cents(policy, rules, employee)
                   for employee in snapshot.employees}
    if policy.labor_cost_weight and any(hourly_cost[item.employee_id] is None
                                        for item in candidates):
        return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_MISSING_LABOR_COST",
            certainty="CONFIG", message="Cost optimization requires an hourly cost for every candidate employee")])
    selected_mondays = {day.day - timedelta(days=day.day.weekday()) for day in days}
    for employee_id in people:
        cap = policy.employee_weekly_minutes.get(employee_id, policy.max_weekly_minutes)
        if cap is None:
            continue
        for monday in selected_mondays:
            existing_minutes = sum(minutes_between(item.start, item.end)
                                   - (0 if item.paid_break else item.break_minutes_unknown)
                for item in snapshot.existing_shifts if item.employee_id == employee_id
                and not (item.store_id == snapshot.store_id and item.status == "DRAFT")
                and item.start.astimezone(zone).date()
                    - timedelta(days=item.start.astimezone(zone).date().weekday()) == monday)
            if existing_minutes > cap:
                return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_FIXED_WEEKLY_CAP",
                    certainty="CONFIG", message=f"Existing shifts exceed the weekly cap for {employee_id}")])
    fixed: list[AssignedShift] = []
    fixed_options: list[list[list[tuple[datetime, datetime]]]] = []
    for item in fixed_source:
        if item.employee_id not in people or item.role_code is None:
            return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_FIXED_INPUT", certainty="CONFIG",
                message="Fixed shift lacks a current employee or mapped role")])
        work_day = item.start.astimezone(zone).date()
        patterns = [p for p in rules.for_date(work_day).patterns
            if p.role_code == item.role_code
            and any(local_instant(work_day, clock, zone) == item.start for clock in p.starts)
            and any(local_instant(work_day, clock, zone, p.end_next_day) == item.end for clock in p.ends)
            and p.break_rule.count * p.break_rule.duration_minutes == item.break_minutes_unknown]
        if len(patterns) != 1:
            return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_FIXED_PATTERN", certainty="CONFIG",
                message="Fixed shift must match exactly one complete pattern and break duration")])
        pattern = patterns[0]
        options = ([[(item.break_start, item.break_end)]] if item.break_start is not None
                   and item.break_end is not None else
                   break_options(work_day, item.start, item.end, rules, pattern))
        if not options or len(options) > 500:
            return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_FIXED_BREAK", certainty="CONFIG",
                message="Fixed shift has no legal break placement")])
        fixed_options.append(options)
        fixed.append(AssignedShift(employee_id=item.employee_id,
            employee_name=people[item.employee_id].name, store_id=item.store_id,
            date=work_day, pattern_name=pattern.name, role_code=item.role_code,
            start=item.start, end=item.end, net_work_minutes=minutes_between(item.start, item.end)
                - (0 if pattern.break_rule.paid else item.break_minutes_unknown),
            paid_break=pattern.break_rule.paid, fixed=True,
            break_time_inferred=item.break_start is None and item.break_minutes_unknown > 0,
            reasons=["Preserved fixed shift"]))
    if (rules.requirement_mode == "PATTERN_AND_COVERAGE"
        and rules.minimum_complete_shift_minutes is not None
        and any(minutes_between(item.start, item.end) < rules.minimum_complete_shift_minutes
                for item in fixed)):
        return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_FIXED_SHORT_SHIFT",
            certainty="CONFIG", message="A locked shift is shorter than the configured complete-shift minimum")])
    if any(not _eligible(snapshot, item.employee_id, item.role_code) for item in fixed):
        return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_FIXED_QUALIFICATION",
            certainty="CONFIG", message="A fixed shift lacks current role qualification")])
    exact_scheduled = rules.requirement_mode == "EXACT_SCHEDULED"
    two_layer = rules.requirement_mode in {"PATTERN_AND_COVERAGE", "EXACT_SCHEDULED"}
    exact_days = _fully_exact_days(rules, {day.day for day in days}) if not exact_scheduled and two_layer else set()
    eligibility_conflicts = (_pattern_eligibility_conflicts(rules, days, candidates, fixed, policy)
                             if two_layer else [])
    coverage_conflicts = (_coverage_eligibility_conflicts(requirements, candidates, fixed,
                          scheduled=exact_scheduled)
                          if two_layer else [])
    hard_conflicts = [item for item in eligibility_conflicts + coverage_conflicts
                      if exact_scheduled or mode == SolveMode.STRICT or item.date in exact_days]
    if hard_conflicts:
        return result(SolveStatus.INFEASIBLE, hard_conflicts)
    model = cp_model.CpModel()
    x = [model.new_bool_var(f"x_{i}") for i in range(len(candidates))]
    z = [[model.new_bool_var(f"z_{i}_{j}") for j in range(len(item.break_options))]
         for i, item in enumerate(candidates)]
    for i, options in enumerate(z):
        model.add(sum(options) == x[i])
    f = [[model.new_bool_var(f"f_{i}_{j}") for j in range(len(options))]
         for i, options in enumerate(fixed_options)]
    for options in f:
        model.add(sum(options) == 1)
    by_day: dict[tuple[str, date], list[int]] = defaultdict(list)
    by_week: dict[tuple[str, date], list[int]] = defaultdict(list)
    by_person: dict[str, list[int]] = defaultdict(list)
    for i, item in enumerate(candidates):
        by_day[(item.employee_id, item.date)].append(i)
        monday = item.date - timedelta(days=item.date.weekday())
        by_week[(item.employee_id, monday)].append(i)
        by_person[item.employee_id].append(i)
    pattern_gaps: list[cp_model.IntVar] = []
    weighted_pattern_gaps = []
    if two_layer:
        for day in days:
            for pattern_name, (minimum, maximum) in _pattern_limits(rules, day.day).items():
                variables = [x[i] for i, item in enumerate(candidates)
                             if item.date == day.day and item.pattern_name == pattern_name]
                fixed_count = sum(item.date == day.day and item.pattern_name == pattern_name
                                  for item in fixed)
                if maximum is not None and fixed_count > maximum:
                    hard_exact = _explicit_exact(rules, day.day, pattern_name)
                    return result(SolveStatus.INFEASIBLE if hard_exact
                                  else SolveStatus.CONFIG_ERROR, [Diagnostic(
                        code="V2_FIXED_PATTERN_MAX", certainty="PROVEN" if hard_exact
                        else "CONFIG", date=day.day,
                        message=f"Locked {pattern_name} shifts ({fixed_count}) exceed maximum {maximum}")])
                if _explicit_exact(rules, day.day, pattern_name):
                    model.add(sum(variables) + fixed_count == minimum)
                    continue
                if mode == SolveMode.BEST_EFFORT:
                    gap = model.new_int_var(0, minimum, f"pattern_gap_{day.day}_{pattern_name}")
                    model.add(sum(variables) + fixed_count + gap >= minimum)
                    pattern_gaps.append(gap)
                    pattern = next(item for item in day.rules.patterns if item.name == pattern_name)
                    shortest = min(minutes_between(local_instant(day.day, begin, zone),
                        local_instant(day.day, finish, zone, pattern.end_next_day))
                        for begin in pattern.starts for finish in pattern.ends
                        if local_instant(day.day, begin, zone) < local_instant(
                            day.day, finish, zone, pattern.end_next_day))
                    coverage_grid = min(minutes_between(slot.start, slot.end) for slot in requirements)
                    weighted_pattern_gaps.append(max(1, shortest // coverage_grid) * gap)
                else:
                    model.add(sum(variables) + fixed_count >= minimum)
                if maximum is not None:
                    model.add(sum(variables) + fixed_count <= maximum)
    existing_days: dict[tuple[str, date], int] = defaultdict(int)
    selected_dates = {day.day for day in days}
    for item in snapshot.existing_shifts:
        if item.store_id == snapshot.store_id and item.status == "DRAFT":
            continue
        if item.employee_id in people and item.start.astimezone(zone).date() in selected_dates:
            existing_days[(item.employee_id, item.start.astimezone(zone).date())] += 1
    for key in set(by_day) | set(existing_days):
        if existing_days[key] > policy.max_shifts_per_day:
            return result(SolveStatus.CONFIG_ERROR, [Diagnostic(code="V2_FIXED_DAILY_CAP",
                certainty="CONFIG", message=f"Fixed shifts exceed daily cap for {key[0]}")])
        model.add(sum(x[i] for i in by_day[key]) + existing_days[key] <= policy.max_shifts_per_day)
    for employee_id, indexes in by_person.items():
        rest = policy.employee_rest_minutes.get(employee_id, policy.min_rest_minutes)
        for left_index, i in enumerate(indexes):
            a = candidates[i]
            for j in indexes[left_index + 1:]:
                b = candidates[j]
                earlier, later = (a, b) if a.start <= b.start else (b, a)
                if minutes_between(earlier.end, later.start) < rest:
                    model.add(x[i] + x[j] <= 1)
            for existing in snapshot.existing_shifts:
                if existing.employee_id != employee_id or (existing.store_id == snapshot.store_id
                    and existing.status == "DRAFT"):
                    continue
                earlier, later = (a, existing) if a.start <= existing.start else (existing, a)
                if minutes_between(earlier.end, later.start) < rest:
                    model.add(x[i] == 0)
                    break
        cap = policy.employee_weekly_minutes.get(employee_id, policy.max_weekly_minutes)
        if cap is None:
            continue
        for (person, monday), week_indexes in by_week.items():
            if person != employee_id:
                continue
            existing_minutes = sum(minutes_between(item.start, item.end)
                                   - (0 if item.paid_break else item.break_minutes_unknown)
                for item in snapshot.existing_shifts if item.employee_id == employee_id
                and not (item.store_id == snapshot.store_id and item.status == "DRAFT")
                and item.start.astimezone(zone).date()
                    - timedelta(days=item.start.astimezone(zone).date().weekday()) == monday)
            model.add(sum((minutes_between(candidates[i].start, candidates[i].end)
                - (0 if candidates[i].paid_break else sum(minutes_between(a, b)
                   for a, b in candidates[i].break_options[0]))) * x[i]
                for i in week_indexes) + existing_minutes <= cap)
    gaps = []
    effective_gaps = []
    overstaff = []
    under_target = []
    quality_terms = []
    normalized_quality_terms = []
    credited_by_person_slot: dict[tuple[str, int], list[cp_model.IntVar]] = defaultdict(list)
    opening_keys = {(slot.day, slot.start) for slot in _first_required_slots(requirements)}
    continuity_ends = _opening_continuity_ends(requirements, rules, policy)
    for i, item in enumerate(candidates):
        if (not two_layer and (item.date, item.start) in opening_keys
            and item.end < continuity_ends[item.date]):
            model.add(x[i] == 0)
    for item in fixed:
        if (not two_layer and (item.date, item.start) in opening_keys
            and item.end < continuity_ends[item.date]):
            return result(SolveStatus.CONFIG_ERROR, [Diagnostic(
                code="V2_FIXED_OPENING_CONTINUITY", certainty="CONFIG", date=item.date,
                message="A fixed opening shift ends before the following staffing phase")])
    for slot_index, slot in enumerate(requirements):
        present_candidates = [x[i] for i, item in enumerate(candidates)
                              if item.start <= slot.start and slot.end <= item.end]
        present_fixed = sum(item.start <= slot.start and slot.end <= item.end
                            for item in fixed)
        if not two_layer and present_fixed > slot.required:
            return result(SolveStatus.CONFIG_ERROR, [Diagnostic(
                code="V2_FIXED_HEADCOUNT", certainty="CONFIG", date=slot.day,
                start=slot.start, end=slot.end,
                message="Fixed shifts exceed the saved headcount for this time slot")])
        if not two_layer:
            if mode == SolveMode.BEST_EFFORT:
                gap = model.new_int_var(0, slot.required, f"gap_{slot_index}")
                model.add(sum(present_candidates) + present_fixed + gap == slot.required)
                gaps.append(gap)
            else:
                model.add(sum(present_candidates) + present_fixed == slot.required)
        active_by_person: dict[str, list[cp_model.IntVar]] = defaultdict(list)
        all_present = []
        for i, item in enumerate(candidates):
            if not (item.start <= slot.start and slot.end <= item.end):
                continue
            for option, breaks in enumerate(item.break_options):
                if not _active_breaks(breaks, slot):
                    active_by_person[item.employee_id].append(z[i][option])
                    all_present.append(z[i][option])
        for i, item in enumerate(fixed):
            if not (item.start <= slot.start and slot.end <= item.end):
                continue
            for option, breaks in enumerate(fixed_options[i]):
                if not _active_breaks(breaks, slot):
                    active_by_person[item.employee_id].append(f[i][option])
                    all_present.append(f[i][option])
        if exact_scheduled:
            model.add(sum(present_candidates) + present_fixed == slot.required)
        elif two_layer:
            if mode == SolveMode.BEST_EFFORT and slot.day not in exact_days:
                gap = model.new_int_var(0, slot.required, f"gap_{slot_index}")
                model.add(sum(all_present) + gap >= slot.required)
                gaps.append(gap)
            else:
                model.add(sum(all_present) >= slot.required)
            if slot.maximum is not None:
                model.add(sum(all_present) <= slot.maximum)
            if slot.target is not None:
                short = model.new_int_var(0, slot.target, f"target_short_{slot_index}")
                model.add(short >= slot.target - sum(all_present))
                under_target.append(short)
        assignments: dict[str, list[cp_model.IntVar]] = defaultdict(list)
        for person, active_options in active_by_person.items():
            possible = [role for role in slot.role_required if _eligible(snapshot, person, role)]
            if not possible:
                continue
            credits = [model.new_bool_var(f"credit_{slot_index}_{person}_{role}")
                       for role in possible]
            model.add(sum(credits) <= sum(active_options))
            for role, credit in zip(possible, credits):
                assignments[role].append(credit)
                score = people[person].score
                if score is not None:
                    quality_terms.append(round(score * 10
                        * minutes_between(slot.start, slot.end) / 30)
                                         * credit)
                    normalized_quality_terms.append(round(score
                        * minutes_between(slot.start, slot.end) / 30) * credit)
                credited_by_person_slot[(person, slot_index)].append(credit)
        if len(slot.role_required) == 1:
            role, required = next(iter(slot.role_required.items()))
            eligible_active = sum(sum(active_options)
                for person, active_options in active_by_person.items()
                if _eligible(snapshot, person, role))
            maximum_credit = model.new_int_var(0, required, f"maximum_credit_{slot_index}")
            model.add_min_equality(maximum_credit, [eligible_active, required])
            model.add(sum(assignments[role]) == maximum_credit)
        for role, required in slot.role_required.items():
            effective_gap = model.new_int_var(0, required,
                                              f"effective_gap_{slot_index}_{role}")
            model.add(sum(assignments[role]) + effective_gap == required)
            effective_gaps.append(effective_gap)
            if two_layer and role != "__any__":
                if mode == SolveMode.BEST_EFFORT and slot.day not in exact_days:
                    gaps.append(effective_gap)
                else:
                    model.add(effective_gap == 0)
        excess = model.new_int_var(0, len(candidates) + len(fixed), f"excess_{slot_index}")
        model.add(excess >= sum(all_present) - (slot.target if two_layer and slot.target is not None else slot.required))
        overstaff.append(excess)
    work_slots = (sum((minutes_between(item.start, item.end)
        - sum(minutes_between(begin, finish) for begin, finish in item.break_options[0])) // 5 * x[i]
        for i, item in enumerate(candidates)) if two_layer else
        sum((_candidate_net_minutes(item) // rules.slot_minutes) * x[i]
            for i, item in enumerate(candidates)))
    quality_points = sum(quality_terms)
    normalized_quality_points = sum(normalized_quality_terms)
    # Score tenths per 30 minutes and cost cents preserve source precision.
    # Fixed-shift cost is constant across candidate choices.
    labor_cost_cents = sum(round(hourly_cost[item.employee_id]
                                 * _candidate_net_minutes(item) / 60) * x[i]
                         for i, item in enumerate(candidates)) if policy.labor_cost_weight else 0
    labor_cost_dollars = sum(round(hourly_cost[item.employee_id]
                                   * _candidate_net_minutes(item) / 6000) * x[i]
                             for i, item in enumerate(candidates)) if two_layer and policy.labor_cost_weight else 0
    pattern_preference_points = sum(policy.employee_pattern_preferences.get(
        item.employee_id, {}).get(item.pattern_name, 0) * x[i]
        for i, item in enumerate(candidates))
    fairness_slots = []
    fairness_target_count = 0
    for employee in snapshot.employees:
        expected = _expected_weekly_minutes(policy, rules, employee)
        if expected is None:
            continue
        for monday in selected_mondays:
            selected_week_days = {day for day in selected_dates
                                  if day - timedelta(days=day.weekday()) == monday}
            target = round(expected * len(selected_week_days) / 7)
            existing_minutes = sum(_existing_net_minutes(item)
                for item in snapshot.existing_shifts
                if item.employee_id == employee.id
                and not (item.store_id == snapshot.store_id and item.status == "DRAFT")
                and item.start.astimezone(zone).date() in selected_week_days)
            indexes = by_week.get((employee.id, monday), [])
            if not indexes and not existing_minutes:
                continue
            upper = target + existing_minutes + sum(
                _candidate_net_minutes(candidates[i]) for i in indexes)
            difference = model.new_int_var(-upper, upper,
                                           f"expected_delta_{employee.id}_{monday}")
            absolute = model.new_int_var(0, upper,
                                         f"expected_abs_{employee.id}_{monday}")
            deviation_slots = model.new_int_var(0, upper // rules.slot_minutes + 1,
                                                f"expected_slots_{employee.id}_{monday}")
            model.add(difference == existing_minutes + sum(
                _candidate_net_minutes(candidates[i]) * x[i] for i in indexes) - target)
            model.add_abs_equality(absolute, difference)
            model.add_division_equality(deviation_slots, absolute, rules.slot_minutes)
            fairness_slots.append(deviation_slots)
            fairness_target_count += 1
    objective_terms = []
    operating_terms = []
    quality_terms_for_objective = []
    if policy.excess_slot_weight:
        term = sum(round(policy.excess_slot_weight
            * minutes_between(slot.start, slot.end) / (5 if two_layer else 30)) * variable
            for slot, variable in zip(requirements, overstaff))
        objective_terms.append(term)
        operating_terms.append(term)
        if two_layer and under_target:
            short_term = sum(round(policy.excess_slot_weight
                * minutes_between(slot.start, slot.end) / 5) * variable
                for slot, variable in zip(requirements, under_target))
            objective_terms.append(short_term)
            operating_terms.append(short_term)
    if policy.net_work_slot_weight:
        term = policy.net_work_slot_weight * work_slots
        objective_terms.append(term)
        operating_terms.append(term)
    if policy.shift_count_weight:
        term = policy.shift_count_weight * (6 if two_layer else 1) * sum(x)
        objective_terms.append(term)
        operating_terms.append(term)
    if policy.labor_cost_weight:
        term = policy.labor_cost_weight * (labor_cost_dollars if two_layer else labor_cost_cents)
        objective_terms.append(term)
        quality_terms_for_objective.append(term)
    if policy.fairness_weight and fairness_slots:
        term = policy.fairness_weight * sum(fairness_slots)
        objective_terms.append(term)
        quality_terms_for_objective.append(term)
    if policy.official_score_weight and quality_terms:
        term = -policy.official_score_weight * (normalized_quality_points if two_layer else quality_points)
        objective_terms.append(term)
        quality_terms_for_objective.append(term)
    if policy.pattern_preference_weight and policy.employee_pattern_preferences:
        term = -policy.pattern_preference_weight * pattern_preference_points
        objective_terms.append(term)
        quality_terms_for_objective.append(term)
    if two_layer and rules.weights.stability:
        quality_terms_for_objective.append(-rules.weights.stability * sum(
            x[i] for i, item in enumerate(candidates) if item.matched_existing))
    if two_layer and rules.weights.regular_pattern:
        quality_terms_for_objective.append(-rules.weights.regular_pattern * sum(
            x[i] for i, item in enumerate(candidates) if item.preferred))
    if two_layer and rules.weights.early_late_start:
        quality_terms_for_objective.append(rules.weights.early_late_start * sum(
            x[i] for i, item in enumerate(candidates) if item.early_late_start))
    balanced_objective = sum(objective_terms)
    if two_layer:
        stages = ([('requirement_gap', sum(gaps) + sum(weighted_pattern_gaps))]
                  if mode == SolveMode.BEST_EFFORT and (gaps or weighted_pattern_gaps) else [])
        stages.extend([('operating_fit', sum(operating_terms)),
                       ('schedule_quality', sum(quality_terms_for_objective))])
    else:
        stages = ([('coverage_gap', sum(gaps))] if mode == SolveMode.BEST_EFFORT else [])
        stages.append(('balanced_objective', balanced_objective))
    solver = None
    solved = SolveStatus.UNKNOWN
    stage_name = ''
    proven = True
    for index, (name, objective) in enumerate(stages):
        model.minimize(objective)
        trial = cp_model.CpSolver()
        trial.parameters.num_search_workers = 1
        trial.parameters.random_seed = rules.random_seed
        if policy.solve_seconds:
            remaining = max(0.01, policy.solve_seconds - (monotonic() - begun))
            if two_layer and len(stages) == 3:
                stage_budget = (policy.solve_seconds * policy.coverage_time_fraction if index == 0
                                else policy.solve_seconds * (1 - policy.coverage_time_fraction) / 2)
            else:
                stage_budget = policy.solve_seconds * policy.coverage_time_fraction / max(1, len(stages) - 1)
            trial.parameters.max_time_in_seconds = (min(remaining, stage_budget)
                if index + 1 < len(stages) else remaining)
        status = {cp_model.OPTIMAL: SolveStatus.OPTIMAL,
                  cp_model.FEASIBLE: SolveStatus.FEASIBLE,
                  cp_model.INFEASIBLE: SolveStatus.INFEASIBLE}.get(trial.solve(model), SolveStatus.UNKNOWN)
        if status not in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}:
            if solver is None:
                code = 'V2_INFEASIBLE' if status == SolveStatus.INFEASIBLE else 'V2_TIME_LIMIT'
                if status == SolveStatus.INFEASIBLE and (exact_days or exact_scheduled):
                    code = 'V2_EXACT_STAFFING_INFEASIBLE'
                return result(status, [Diagnostic(code=code, certainty='PROVEN' if status == SolveStatus.INFEASIBLE else 'LIKELY',
                    message=('Exact scheduled headcounts, legal shifts, availability, and one shift per day have no joint feasible assignment'
                             if exact_scheduled else
                             'Exact pattern counts, legal breaks, availability, one shift per day, and effective minimum coverage have no joint feasible assignment'
                             if exact_days else 'Coverage and structural constraints have no feasible assignment') if status == SolveStatus.INFEASIBLE
                    else 'Time limit ended without a feasible assignment')])
            proven = False
            break
        solver, solved, stage_name = trial, status, name
        if status != SolveStatus.OPTIMAL:
            proven = False
        if index + 1 < len(stages):
            bound = round(trial.objective_value)
            model.add(objective == bound if status == SolveStatus.OPTIMAL else objective <= bound)
            model.clear_hints()
            for variable_index in range(len(model.proto.variables)):
                variable = model.get_int_var_from_proto_index(variable_index)
                model.add_hint(variable, trial.value(variable))
    assert solver is not None
    if not proven:
        solved = SolveStatus.FEASIBLE
    chosen = []
    for i, item in enumerate(fixed):
        option = next(j for j, variable in enumerate(f[i]) if solver.value(variable))
        chosen.append(item.model_copy(update={'breaks': fixed_options[i][option]}))
    for i, item in enumerate(candidates):
        if not solver.value(x[i]):
            continue
        option = next(j for j, variable in enumerate(z[i]) if solver.value(variable))
        breaks = item.break_options[option]
        credited = sum(solver.value(variable)
            for slot_index, slot in enumerate(requirements)
            if item.start <= slot.start and slot.end <= item.end
            for variable in credited_by_person_slot[(item.employee_id, slot_index)])
        reasons = ['Qualified and available complete shift',
                   f'Credited demand slots: {credited}']
        score = people[item.employee_id].score
        if score is not None:
            reasons.append(f'Official score in source Snapshot: {score:g}')
        preference = policy.employee_pattern_preferences.get(item.employee_id, {}).get(
            item.pattern_name, 0)
        if preference:
            reasons.append(f'Explicit employee pattern preference: {preference:+d}')
        chosen.append(AssignedShift(employee_id=item.employee_id,
            employee_name=people[item.employee_id].name, store_id=snapshot.store_id,
            date=item.date, pattern_name=item.pattern_name, role_code=item.role_code,
            start=item.start, end=item.end, breaks=breaks, paid_break=item.paid_break,
            net_work_minutes=minutes_between(item.start, item.end) -
                (0 if item.paid_break else sum(minutes_between(a, b) for a, b in breaks)),
            reasons=reasons))
    chosen.sort(key=lambda item: (item.start, item.employee_id))
    coverage = replay_coverage(snapshot, chosen, requirements)
    if two_layer:
        limits_by_day = {day.day: _pattern_limits(rules, day.day) for day in days}
        counts_by_pattern = defaultdict(int)
        for item in chosen:
            counts_by_pattern[(item.date, item.pattern_name)] += 1
        for item in chosen:
            if item.fixed:
                continue
            minimum, _maximum = limits_by_day[item.date][item.pattern_name]
            actual = counts_by_pattern[(item.date, item.pattern_name)]
            if actual <= minimum:
                item.reasons.append(f'Contributes to {item.pattern_name} minimum: {actual}/{minimum} assigned')
            affected = [(index, slot) for index, slot in enumerate(requirements)
                        if item.start < slot.end and slot.start < item.end]
            without = replay_coverage(snapshot, [shift for shift in chosen if shift is not item],
                                      [slot for _index, slot in affected])
            shortage_minutes = sum(max(0, replayed.gap - coverage[index].gap)
                                   * minutes_between(slot.start, slot.end)
                                   for (index, slot), replayed in zip(affected, without))
            target_minutes = sum(max(0, replayed.target_shortfall - coverage[index].target_shortfall)
                                 * minutes_between(slot.start, slot.end)
                                 for (index, slot), replayed in zip(affected, without)) if not exact_scheduled else 0
            if shortage_minutes:
                item.reasons.append((f'Removing this shift breaks the exact scheduled headcount for '
                                     f'{shortage_minutes} person-minutes' if exact_scheduled else
                                     f'Removing this shift increases minimum-staff shortage by '
                                     f'{shortage_minutes} person-minutes'))
            elif target_minutes:
                item.reasons.append(f'Removing this shift increases target-staff shortage by {target_minutes} person-minutes')
            else:
                item.reasons.append('Selected by the current global objective; this local removal does not prove it indispensable')
    diagnostics = [*eligibility_conflicts, *coverage_conflicts] + [Diagnostic(code=('V2_SCHEDULED_GAP' if exact_scheduled or not two_layer else 'V2_EFFECTIVE_GAP'), certainty='PROVEN', date=slot.date,
        start=slot.start, end=slot.end,
        message=(f'Working {slot.effective} of minimum {slot.required}; short {slot.gap}'
                 if two_layer and not exact_scheduled else
                 f'Scheduled {slot.scheduled} of {slot.required}; short {slot.gap}'))
        for slot in coverage if slot.gap]
    if two_layer:
        for day in days:
            for pattern_name, (minimum, _maximum) in _pattern_limits(rules, day.day).items():
                actual = sum(item.date == day.day and item.pattern_name == pattern_name
                             for item in chosen)
                if actual < minimum:
                    diagnostics.append(Diagnostic(code='V2_PATTERN_GAP', certainty='PROVEN',
                        date=day.day, message=f'{pattern_name}: {actual} of minimum {minimum}; short {minimum-actual}'))
    errors = verify_v2(snapshot, rules, policy, candidates, chosen, requirements, mode)
    if not two_layer and sum(solver.value(v) for v in gaps) != sum(slot.gap for slot in coverage):
        errors.append('Solver demand credit does not match independent coverage replay')
    model_effective_gap = sum(solver.value(v) for v in effective_gaps)
    replayed_effective_gap = sum(slot.effective_gap for slot in coverage)
    if not two_layer and model_effective_gap < replayed_effective_gap:
        errors.append('Solver effective staffing exceeds independent coverage replay')
    value = result(SolveStatus.DATA_ERROR if errors else solved, diagnostics,
                   chosen, coverage, round(solver.objective_value), proven)
    value.parameters['objective_stage'] = stage_name
    value.parameters['objective_priority'] = (('requirement_gap > operating_fit > schedule_quality'
        if mode == SolveMode.BEST_EFFORT else 'operating_fit > schedule_quality')
        if two_layer else ('coverage_gap > balanced_objective'
        if mode == SolveMode.BEST_EFFORT else 'balanced_objective'))
    value.parameters['score_optimization'] = ('ACTIVE' if stage_name in {'balanced_objective', 'schedule_quality'}
        and policy.official_score_weight and any(p.score is not None for p in snapshot.employees)
        else 'NOT_REACHED' if stage_name not in {'balanced_objective', 'schedule_quality'} else 'DISABLED_OR_MISSING')
    value.parameters['cost_optimization'] = ('ACTIVE' if stage_name in {'balanced_objective', 'schedule_quality'}
        and policy.labor_cost_weight else 'NOT_REACHED' if policy.labor_cost_weight
        else 'DISABLED')
    if two_layer:
        value.parameters['metric_pattern_gap'] = sum(max(0, minimum - sum(
            item.date == day.day and item.pattern_name == name for item in chosen))
            for day in days for name, (minimum, _maximum) in _pattern_limits(rules, day.day).items())
        value.parameters['metric_weighted_pattern_gap'] = sum(solver.value(term)
            for term in weighted_pattern_gaps)
        value.parameters['metric_target_shortfall'] = sum(slot.target_shortfall for slot in coverage)
        value.parameters['metric_target_excess'] = sum(slot.target_excess for slot in coverage)
        value.parameters['coverage_slot_minutes'] = min(
            minutes_between(slot.start, slot.end) for slot in requirements)
    value.parameters['fairness_targets'] = fairness_target_count
    value.parameters['pattern_preferences'] = sum(len(item)
        for item in policy.employee_pattern_preferences.values())
    value.parameters['metric_credited_quality_points'] = solver.value(quality_points)
    value.parameters['metric_credited_demand_slots'] = sum(solver.value(v)
        for variables in credited_by_person_slot.values() for v in variables)
    value.parameters['metric_labor_cost_cents'] = (solver.value(labor_cost_cents)
        if policy.labor_cost_weight else 0)
    value.parameters['metric_pattern_preference_points'] = solver.value(pattern_preference_points)
    value.parameters['metric_model_gap'] = sum(solver.value(v) for v in gaps)
    value.parameters['metric_replayed_gap'] = sum(slot.gap for slot in coverage)
    value.parameters['metric_effective_gap'] = sum(slot.effective_gap for slot in coverage)
    value.parameters['metric_model_effective_gap'] = model_effective_gap
    value.parameters['metric_excess_penalty'] = sum(round(policy.excess_slot_weight
        * minutes_between(slot.start, slot.end) / (5 if two_layer else 30)) * solver.value(variable)
        for slot, variable in zip(requirements, overstaff))
    value.parameters['metric_work_penalty'] = policy.net_work_slot_weight * solver.value(work_slots)
    value.parameters['metric_shift_penalty'] = policy.shift_count_weight * (6 if two_layer else 1) * sum(
        solver.value(v) for v in x)
    value.parameters['metric_fairness_penalty'] = policy.fairness_weight * sum(
        solver.value(v) for v in fairness_slots)
    value.parameters['metric_quality_reward'] = policy.official_score_weight * solver.value(
        normalized_quality_points if two_layer else quality_points)
    value.parameters['metric_cost_penalty'] = policy.labor_cost_weight * (
        solver.value(labor_cost_dollars) if two_layer and policy.labor_cost_weight
        else value.parameters['metric_labor_cost_cents'])
    value.parameters['metric_pattern_preference_reward'] = (policy.pattern_preference_weight
        * solver.value(pattern_preference_points))
    value.parameters['weight_official_score'] = policy.official_score_weight
    value.parameters['weight_excess_slot'] = policy.excess_slot_weight
    value.parameters['weight_net_work_slot'] = policy.net_work_slot_weight
    value.parameters['weight_shift_count'] = policy.shift_count_weight
    value.parameters['slot_minutes'] = rules.slot_minutes
    value.parameters['weight_labor_cost'] = policy.labor_cost_weight
    value.parameters['weight_fairness'] = policy.fairness_weight
    value.parameters['weight_pattern_preference'] = policy.pattern_preference_weight
    if two_layer:
        value.parameters['quality_unit'] = 'score_points_per_30min'
        value.parameters['cost_unit'] = 'rounded_dollars_per_shift'
        value.parameters['work_unit_minutes'] = 5
        value.parameters['weight_regular_pattern'] = rules.weights.regular_pattern
        value.parameters['weight_early_late_start'] = rules.weights.early_late_start
        value.parameters['weight_stability'] = rules.weights.stability
        value.parameters['metric_regular_pattern_reward'] = rules.weights.regular_pattern * sum(
            solver.value(x[i]) for i, item in enumerate(candidates) if item.preferred)
        value.parameters['metric_early_late_start_penalty'] = rules.weights.early_late_start * sum(
            solver.value(x[i]) for i, item in enumerate(candidates) if item.early_late_start)
        value.parameters['metric_stability_reward'] = rules.weights.stability * sum(
            solver.value(x[i]) for i, item in enumerate(candidates) if item.matched_existing)
    candidate_counts: dict[str, int] = defaultdict(int)
    for shift in chosen:
        if not shift.fixed:
            candidate_counts[shift.employee_id] += 1
    value.score_allocation = sorted((ScoreAllocation(
        employee_id=employee.id, employee_name=employee.name,
        official_score=employee.score, candidate_shifts=candidate_counts[employee.id],
        credited_demand_minutes=sum(minutes_between(slot.start, slot.end) * solver.value(v)
            for slot_index, slot in enumerate(requirements)
            for v in credited_by_person_slot.get((employee.id, slot_index), [])),
        credited_quality_points=sum(round(employee.score * 10
            * minutes_between(slot.start, slot.end) / 30) * solver.value(v)
            for slot_index, slot in enumerate(requirements)
            for v in credited_by_person_slot.get((employee.id, slot_index), [])
            if employee.score is not None))
        for employee in snapshot.employees),
        key=lambda item: (item.official_score is None,
                          -(item.official_score or 0), item.employee_name))
    value.validation_errors = errors
    return value
