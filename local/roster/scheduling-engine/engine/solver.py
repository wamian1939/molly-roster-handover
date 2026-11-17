from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timezone
from time import monotonic
from uuid import uuid4

from ortools.sat.python import cp_model

from .candidates import break_options, generate_candidates
from .clock import aligned_to_slot, local_instant, minutes_between, overlaps, timezone_for
from .config import CompiledDay, DemandSlot, compile_rules, opening_slots
from .models import (AssignedShift, BreakRule, Candidate, CoverageSlot, DayRules, Diagnostic, RuleSet,
                     RunResult, ScoreAllocation, Snapshot, SolveMode, SolveStatus)
from .validation import calculate_coverage, verify_result

ENGINE_VERSION = "0.1.29"


def _status(value: int) -> SolveStatus:
    return {
        cp_model.OPTIMAL: SolveStatus.OPTIMAL,
        cp_model.FEASIBLE: SolveStatus.FEASIBLE,
        cp_model.INFEASIBLE: SolveStatus.INFEASIBLE,
        cp_model.UNKNOWN: SolveStatus.UNKNOWN,
        cp_model.MODEL_INVALID: SolveStatus.DATA_ERROR,
    }.get(value, SolveStatus.UNKNOWN)


def _solver(rules: RuleSet, seconds: float | None) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    if seconds is not None:
        solver.parameters.max_time_in_seconds = max(0.01, seconds)
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = rules.random_seed
    return solver


def _result(snapshot: Snapshot, rules: RuleSet, start: date, end: date, mode: SolveMode,
            status: SolveStatus, elapsed: float, diagnostics: list[Diagnostic],
            assignments: list[AssignedShift] | None = None, coverage: list[CoverageSlot] | None = None,
            objective: int | None = None) -> RunResult:
    parameters = {"slot_minutes": rules.slot_minutes, "solve_seconds": rules.solve_seconds,
                  "pattern_only": int(rules.pattern_only),
                  "random_seed": rules.random_seed,
                  **{f"weight_{key}": value for key, value in rules.weights.model_dump().items()
                     if not rules.pattern_only or key != "excess_coverage"}}
    if not rules.pattern_only:
        parameters["work_rest_limits_enabled"] = int(rules.enforce_work_rest_limits)
    if snapshot.source == "REAL":
        complete_coverage = (coverage is not None and all(
            not slot.gap and all(slot.role_effective.get(role, 0) >= required
                                 for role, required in slot.role_required.items())
            for slot in coverage))
        eligible_for_manual_review = (snapshot.run_purpose == "REVIEWED"
            and status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}
            and mode == SolveMode.STRICT and complete_coverage
            and snapshot.comparison_mode == "PRESERVE_PUBLISHED"
            and snapshot.leave_data_complete and snapshot.compliance_policy_confirmed
            and snapshot.staffing_rules_confirmed and rules.enforce_work_rest_limits
            and not rules.pattern_only)
        parameters.update({
            "comparison_mode": snapshot.comparison_mode,
            "approved_leave_review": "MANUAL_CONFIRMED" if snapshot.leave_data_complete else "UNKNOWN",
            "acceptance_gate": "MANUAL_REVIEW_REQUIRED" if eligible_for_manual_review else "NOT_ELIGIBLE",
        })
        if not rules.pattern_only:
            parameters.update({
                "work_break_policy_review": "MANUAL_CONFIRMED" if snapshot.compliance_policy_confirmed else "UNKNOWN",
                "staffing_rules_review": "MANUAL_CONFIRMED" if snapshot.staffing_rules_confirmed else "UNKNOWN",
            })
    return RunResult(run_id=str(uuid4()), engine_version=ENGINE_VERSION, store_id=snapshot.store_id,
        timezone=rules.timezone, start_date=start, end_date=end, source=snapshot.source,
        run_purpose=snapshot.run_purpose,
        snapshot_version=snapshot.version, rule_version=rules.version, mode=mode, status=status,
        elapsed_ms=int(elapsed * 1000), objective_score=objective,
        assignments=assignments or [], coverage=coverage or [], diagnostics=diagnostics,
        parameters=parameters)


def _candidate_net_minutes(candidate: Candidate) -> int:
    minutes = minutes_between(candidate.start, candidate.end)
    if candidate.paid_break or not candidate.break_options:
        return minutes
    return minutes - sum(minutes_between(start, end) for start, end in candidate.break_options[0])


def _official_score_tenths(score: float | None) -> int:
    # Only the current CLOSED-round Evaluate score may influence this preference.
    # Missing scores add no preference; never manufacture a default score.
    return 0 if score is None else round(score * 10)


def _skill_bucket(score: float | None) -> int:
    """Historical coverage-mode weighting, retained for old saved rule runs."""
    return int((50 if score is None else score) // 10)


def _candidate_covers(candidate: Candidate, slot: DemandSlot) -> bool:
    return candidate.start <= slot.start and slot.end <= candidate.end


def _option_breaks(candidate: Candidate, option: int, slot: DemandSlot) -> bool:
    return any(start < slot.end and slot.start < end for start, end in candidate.break_options[option])


def solve(snapshot: Snapshot, rules: RuleSet, start_date: date, end_date: date, mode: SolveMode = SolveMode.STRICT) -> RunResult:
    begun = monotonic()
    if rules.pattern_only:
        pattern_names = {pattern.name for pattern in rules.base_day.patterns}
        default_day = DayRules(patterns=rules.base_day.patterns)
        default_break = BreakRule()
        if (rules.enforce_work_rest_limits or rules.dates or rules.employee_limits
            or {"dates", "compliance", "employee_limits"} & rules.model_fields_set
            or rules.compliance.model_fields_set
            or "excess_coverage" in rules.weights.model_fields_set
            or rules.base_day.model_dump(exclude={"patterns"}) != default_day.model_dump(exclude={"patterns"})
            or rules.base_day.model_fields_set != {"patterns"}
            or any(pattern.break_rule.model_dump(exclude={"count", "duration_minutes", "paid"})
                   != default_break.model_dump(exclude={"count", "duration_minutes", "paid"})
                   or pattern.break_rule.model_fields_set - {"count", "duration_minutes", "paid"}
                   for pattern in rules.base_day.patterns)
            or set(rules.weekly) != set(range(7))
            or any(set(override.model_dump(exclude_none=True)) != {"pattern_minimums"}
                   or override.pattern_minimums is None
                   or set(override.pattern_minimums) != pattern_names
                   for override in rules.weekly.values())):
            return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR,
                monotonic() - begun, [Diagnostic(code="PATTERN_ONLY_RULE", certainty="CONFIG",
                    message="Current rules require only shared shift patterns and explicit counts for every pattern on all seven weekdays")])
    if snapshot.store_id != rules.store_id or snapshot.timezone != rules.timezone:
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.DATA_ERROR, monotonic() - begun,
            [Diagnostic(code="STORE_SCOPE", message="Snapshot store or timezone differs from rules", certainty="CONFIG")])
    employee_ids = [employee.id for employee in snapshot.employees]
    if len(employee_ids) != len(set(employee_ids)):
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.DATA_ERROR, monotonic() - begun,
            [Diagnostic(code="DUPLICATE_EMPLOYEE", message="Snapshot contains the same employee more than once", certainty="PROVEN")])
    if {leave.employee_id for leave in snapshot.approved_leave} - set(employee_ids):
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.DATA_ERROR, monotonic() - begun,
            [Diagnostic(code="UNKNOWN_LEAVE_EMPLOYEE", message="Approved leave refers to an employee outside the active store snapshot", certainty="PROVEN")])
    unknown_employee_limits = set(rules.employee_limits) - set(employee_ids)
    if rules.enforce_work_rest_limits and unknown_employee_limits:
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
            [Diagnostic(code="UNKNOWN_EMPLOYEE_LIMIT", message="Individual work limits refer to an employee outside the active store snapshot", certainty="CONFIG")])
    if set(rules.employee_preferences) - set(employee_ids):
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
            [Diagnostic(code="UNKNOWN_EMPLOYEE_PREFERENCE", message="Individual preferences refer to an employee outside the active store snapshot", certainty="CONFIG")])
    shift_keys = [(shift.source_shift_id, shift.employee_id) for shift in snapshot.existing_shifts
                  if shift.source_shift_id is not None]
    if len(shift_keys) != len(set(shift_keys)):
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.DATA_ERROR, monotonic() - begun,
            [Diagnostic(code="DUPLICATE_SHIFT_ASSIGNMENT", message="Snapshot contains the same source shift assignment more than once", certainty="PROVEN")])
    if (snapshot.source == "REAL" and snapshot.run_purpose == "REVIEWED"
        and (not snapshot.leave_data_complete or
             (not rules.pattern_only and
              (not snapshot.compliance_policy_confirmed or not snapshot.staffing_rules_confirmed)))):
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
            [Diagnostic(code="MISSING_POLICY_ATTESTATION", message="Reviewed real data requires confirmed approved leave, work/break policy, and operating staffing rules", certainty="CONFIG")])
    days, configuration = compile_rules(rules, start_date, end_date)
    if configuration:
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun, configuration)
    overlapping_locked = [shift for shift in snapshot.existing_shifts
        if shift.store_id == snapshot.store_id and shift.status in {"PUBLISHED", "LOCKED"}
        and any(shift.start < day.work_end and day.preparation < shift.end for day in days)]
    staff_by_id = {employee.id: employee for employee in snapshot.employees}
    invalid_locked = [shift for shift in overlapping_locked
        if shift.employee_id not in staff_by_id or shift.role_code is None
        or (shift.break_start is None) != (shift.break_end is None)
        or (shift.break_start is not None and
            (shift.break_start < shift.start or shift.break_end > shift.end
             or minutes_between(shift.break_start, shift.break_end) != shift.break_minutes_unknown
             or not aligned_to_slot(shift.start, shift.break_start, rules.slot_minutes)
             or not aligned_to_slot(shift.start, shift.break_end, rules.slot_minutes)))]
    if invalid_locked:
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
            [Diagnostic(code="LOCKED_TARGET_INPUT", message="A fixed target shift lacks a current employee or mapped formal role, or has an invalid or off-grid recorded break interval", certainty="CONFIG")])
    for shift in overlapping_locked:
        if (shift.role_code not in staff_by_id[shift.employee_id].qualified_roles
            or not snapshot.role_required_skills.get(shift.role_code, set())
                <= staff_by_id[shift.employee_id].skill_codes):
            return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
                [Diagnostic(code="LOCKED_QUALIFICATION", message="A published or locked shift lacks a current formal job grant or required role skills", certainty="CONFIG")])
        if any(leave.employee_id == shift.employee_id and overlaps(shift.start, shift.end, leave.start, leave.end)
               for leave in snapshot.approved_leave):
            return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
                [Diagnostic(code="LOCKED_LEAVE_CONFLICT", message="An approved leave interval conflicts with a published or locked shift", certainty="CONFIG")])
        for other in snapshot.existing_shifts:
            if other is shift or other.employee_id != shift.employee_id:
                continue
            if other.store_id == snapshot.store_id and other.status not in {"PUBLISHED", "LOCKED"}:
                continue
            earlier, later = (shift, other) if shift.start <= other.start else (other, shift)
            rest_minutes = (rules.compliance_for(shift.employee_id).minimum_rest_minutes
                            if rules.enforce_work_rest_limits else 0)
            if minutes_between(earlier.end, later.start) < rest_minutes:
                return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
                    [Diagnostic(code="LOCKED_SHIFT_CONFLICT", message="A published or locked shift overlaps another fixed shift or violates minimum rest", certainty="CONFIG")])
    zone = timezone_for(rules.timezone)
    fixed_rule_days = {day.day: day for day in days}
    for work_date in {shift.start.astimezone(zone).date() for shift in overlapping_locked} - fixed_rule_days.keys():
        adjacent_days, adjacent_errors = compile_rules(rules, work_date, work_date)
        if adjacent_errors:
            return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR,
                monotonic() - begun, adjacent_errors)
        fixed_rule_days[work_date] = adjacent_days[0]

    def fixed_pattern(shift):
        day = fixed_rule_days[shift.start.astimezone(zone).date()]
        matching_times = []
        for pattern in day.rules.patterns:
            if (pattern.role_code == shift.role_code
                and any(local_instant(day.day, clock, zone) == shift.start for clock in pattern.starts)
                and any(local_instant(day.day, clock, zone, pattern.end_next_day) == shift.end
                        for clock in pattern.ends)):
                matching_times.append(pattern)
        matching_break = [pattern for pattern in matching_times
            if pattern.break_rule.count * pattern.break_rule.duration_minutes == shift.break_minutes_unknown]
        if shift.break_start is not None:
            matching_break = [pattern for pattern in matching_break
                if [(shift.break_start, shift.break_end)] in break_options(
                    shift.start.astimezone(zone).date(), shift.start, shift.end, rules, pattern)]
        return matching_break, bool(matching_times)
    fixed_matches = [fixed_pattern(shift) for shift in overlapping_locked]
    fixed_patterns = [matches[0] if len(matches) == 1 else None
                      for matches, _matching_time in fixed_matches]
    fixed_break_options: list[list[list[tuple[datetime, datetime]]]] = []
    for shift, (matches, matching_time) in zip(overlapping_locked, fixed_matches):
        if len(matches) > 1:
            return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
                [Diagnostic(code="FIXED_PATTERN_AMBIGUOUS", message="Multiple complete patterns match one published or locked target shift; its break policy and pattern count cannot be chosen safely", certainty="CONFIG")])
        pattern = matches[0] if matches else None
        if pattern is None:
            code = "FIXED_BREAK_RULE" if matching_time else "FIXED_PATTERN_MISMATCH"
            message = ("A published or locked target shift has no configured pattern matching its recorded break duration and permitted interval"
                       if matching_time else
                       "A published or locked target shift does not match any configured complete pattern for its formal role and start/end times")
            return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
                [Diagnostic(code=code, message=message, certainty="CONFIG")])
        if shift.break_start is not None or shift.break_minutes_unknown == 0:
            fixed_break_options.append([])
            continue
        options = break_options(shift.start.astimezone(zone).date(), shift.start, shift.end, rules, pattern)
        if not options or len(options) > 500:
            return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
                [Diagnostic(code="FIXED_BREAK_RULE", message="No permitted break placement exists for a published shift within its configured break window", certainty="CONFIG")])
        fixed_break_options.append(options)
    def fixed_break_paid(shift, pattern) -> bool:
        if pattern and pattern.break_rule.count * pattern.break_rule.duration_minutes == shift.break_minutes_unknown:
            return pattern.break_rule.paid
        return shift.paid_break
    fixed_assignments = [AssignedShift(employee_id=shift.employee_id,
        employee_name=staff_by_id[shift.employee_id].name, store_id=snapshot.store_id,
        date=shift.start.astimezone(zone).date(), pattern_name=pattern.name if pattern else "Locked",
        role_code=shift.role_code, start=shift.start, end=shift.end,
        breaks=[(shift.break_start, shift.break_end)] if shift.break_start is not None else [],
        paid_break=fixed_break_paid(shift, pattern), fixed=True,
        break_time_inferred=shift.break_minutes_unknown > 0 and shift.break_start is None,
        net_work_minutes=minutes_between(shift.start, shift.end)
            - (0 if fixed_break_paid(shift, pattern) else shift.break_minutes_unknown),
        reasons=["Existing published or locked shift is preserved"])
        for shift, pattern in zip(overlapping_locked, fixed_patterns)]
    if rules.pattern_only:
        for compiled_day in days:
            for pattern_name, target in compiled_day.rules.pattern_minimums.items():
                fixed_count = sum(shift.date == compiled_day.day and shift.pattern_name == pattern_name
                                  for shift in fixed_assignments)
                if fixed_count > target:
                    return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR,
                        monotonic() - begun, [Diagnostic(code="FIXED_PATTERN_EXCESS", certainty="CONFIG",
                            date=compiled_day.day, message=f"{pattern_name} has {fixed_count} preserved shifts, "
                            f"above the configured count of {target}")])
    fixed_target_net = {(shift.employee_id, shift.store_id, shift.start, shift.end): assignment.net_work_minutes
                        for shift, assignment in zip(overlapping_locked, fixed_assignments)}
    fixed_daily_count: dict[tuple[str, date], int] = defaultdict(int)
    fixed_daily_minutes: dict[tuple[str, date], int] = defaultdict(int)
    fixed_weekly_minutes: dict[tuple[str, date], int] = defaultdict(int)
    selected_dates = {day.day for day in days}
    selected_mondays = {date.fromordinal(day.day.toordinal() - day.day.weekday()) for day in days}
    for shift in snapshot.existing_shifts:
        if shift.employee_id not in staff_by_id or (shift.store_id == snapshot.store_id and shift.status == "DRAFT"):
            continue
        work_date = shift.start.astimezone(zone).date()
        monday = date.fromordinal(work_date.toordinal() - work_date.weekday())
        net_minutes = fixed_target_net.get((shift.employee_id, shift.store_id, shift.start, shift.end),
            minutes_between(shift.start, shift.end))
        fixed_daily_count[(shift.employee_id, work_date)] += 1
        fixed_daily_minutes[(shift.employee_id, work_date)] += net_minutes
        fixed_weekly_minutes[(shift.employee_id, monday)] += net_minutes
    if rules.enforce_work_rest_limits and (any(work_date in selected_dates and
           (count > rules.compliance_for(employee_id).maximum_shifts_per_day or
            fixed_daily_minutes[(employee_id, work_date)] > rules.compliance_for(employee_id).maximum_daily_work_minutes)
           for (employee_id, work_date), count in fixed_daily_count.items()) or any(
            monday in selected_mondays and minutes > rules.compliance_for(employee_id).maximum_weekly_work_minutes
            for (employee_id, monday), minutes in fixed_weekly_minutes.items())):
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
            [Diagnostic(code="FIXED_WORK_CAP", message="Existing fixed shifts already exceed a configured daily or weekly work limit", certainty="CONFIG")])
    candidates, candidate_errors = generate_candidates(snapshot, rules, days)
    if candidate_errors:
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun, candidate_errors)
    cost_by_employee = {employee.id: (
        rules.employee_preferences[employee.id].hourly_cost_cents
        if employee.id in rules.employee_preferences and
           rules.employee_preferences[employee.id].hourly_cost_cents is not None
        else employee.hourly_cost_cents) for employee in snapshot.employees}
    if rules.weights.labor_cost and any(cost_by_employee[candidate.employee_id] is None for candidate in candidates):
        return _result(snapshot, rules, start_date, end_date, mode, SolveStatus.CONFIG_ERROR, monotonic() - begun,
            [Diagnostic(code="MISSING_LABOR_COST", message="Labor cost optimization requires an hourly cost for every candidate employee", certainty="CONFIG")])
    employees = staff_by_id
    model = cp_model.CpModel()
    x = [model.new_bool_var(f"x_{index}") for index in range(len(candidates))]
    b = [[model.new_bool_var(f"b_{index}_{option}") for option in range(len(candidate.break_options))]
         for index, candidate in enumerate(candidates)]
    for index, options in enumerate(b):
        model.add(sum(options) == x[index])
    fb = [[model.new_bool_var(f"fb_{index}_{option}") for option in range(len(options))]
          for index, options in enumerate(fixed_break_options)]
    for options in fb:
        if options:
            model.add(sum(options) == 1)

    def fixed_slot_breaks(slot: DemandSlot, role: str | None = None):
        return sum(fb[index][option]
            for index, options in enumerate(fixed_break_options)
            if (role is None or fixed_assignments[index].role_code == role)
            and fixed_assignments[index].start <= slot.start and slot.end <= fixed_assignments[index].end
            for option, breaks in enumerate(options)
            if any(begin < slot.end and slot.start < finish for begin, finish in breaks))

    by_employee: dict[str, list[int]] = defaultdict(list)
    by_employee_date: dict[tuple[str, date], list[int]] = defaultdict(list)
    by_employee_week: dict[tuple[str, date], list[int]] = defaultdict(list)
    for index, candidate in enumerate(candidates):
        by_employee[candidate.employee_id].append(index)
        by_employee_date[(candidate.employee_id, candidate.date)].append(index)
        monday = date.fromordinal(candidate.date.toordinal() - candidate.date.weekday())
        by_employee_week[(candidate.employee_id, monday)].append(index)
    if rules.enforce_work_rest_limits:
        for (employee_id, work_date), indexes in by_employee_date.items():
            employee_compliance = rules.compliance_for(employee_id)
            model.add(sum(x[index] for index in indexes) + fixed_daily_count[(employee_id, work_date)]
                      <= employee_compliance.maximum_shifts_per_day)
            model.add(sum(_candidate_net_minutes(candidates[index]) * x[index] for index in indexes)
                      + fixed_daily_minutes[(employee_id, work_date)]
                      <= employee_compliance.maximum_daily_work_minutes)
        for indexes in by_employee_week.values():
            first = candidates[indexes[0]]
            monday = date.fromordinal(first.date.toordinal() - first.date.weekday())
            model.add(sum(_candidate_net_minutes(candidates[index]) * x[index] for index in indexes)
                      + fixed_weekly_minutes[(first.employee_id, monday)]
                      <= rules.compliance_for(first.employee_id).maximum_weekly_work_minutes)
    for indexes in by_employee.values():
        for offset, left in enumerate(indexes):
            first = candidates[left]
            for right in indexes[offset + 1:]:
                second = candidates[right]
                earlier, later = (first, second) if first.start <= second.start else (second, first)
                rest_minutes = (rules.compliance_for(first.employee_id).minimum_rest_minutes
                                if rules.enforce_work_rest_limits else 0)
                if minutes_between(earlier.end, later.start) < rest_minutes:
                    model.add(x[left] + x[right] <= 1)

    gaps: list[cp_model.IntVar] = []
    excess: list[cp_model.IntVar] = []
    all_slots = [] if rules.pattern_only else [slot for day in days for slot in day.slots]
    slot_total = len(all_slots)
    for slot in all_slots:
        covering = [index for index, candidate in enumerate(candidates) if _candidate_covers(candidate, slot)]
        fixed_present = [shift for shift in fixed_assignments if shift.start <= slot.start and slot.end <= shift.end
                         and not any(begin < slot.end and slot.start < finish for begin, finish in shift.breaks)]
        effective = len(fixed_present) - fixed_slot_breaks(slot) + sum(x[index] for index in covering) - sum(
            b[index][option] for index in covering for option in range(len(b[index]))
            if _option_breaks(candidates[index], option, slot))
        if mode == SolveMode.BEST_EFFORT:
            gap = model.new_int_var(0, slot.required, f"gap_{len(gaps)}")
            model.add(effective + gap >= slot.required)
            gaps.append(gap)
        else:
            model.add(effective >= slot.required)
        over = model.new_int_var(0, len(candidates) + len(fixed_assignments), f"excess_{len(excess)}")
        model.add(effective - slot.required <= over)
        excess.append(over)
        for role, required in slot.role_required.items():
            role_indexes = [index for index in covering if candidates[index].role_code == role]
            role_effective = sum(shift.role_code == role for shift in fixed_present) - fixed_slot_breaks(slot, role) + sum(x[index] for index in role_indexes) - sum(
                b[index][option] for index in role_indexes for option in range(len(b[index]))
                if _option_breaks(candidates[index], option, slot))
            if mode == SolveMode.BEST_EFFORT:
                role_gap = model.new_int_var(0, required, f"role_gap_{len(gaps)}")
                model.add(role_effective + role_gap >= required)
                gaps.append(role_gap)
            else:
                model.add(role_effective >= required)
    for day in days:
        for opening_slot in (() if rules.pattern_only else opening_slots(day)):
            covering = [index for index, candidate in enumerate(candidates) if _candidate_covers(candidate, opening_slot)]
            fixed_present = [shift for shift in fixed_assignments
                if shift.start <= opening_slot.start and opening_slot.end <= shift.end
                and not any(begin < opening_slot.end and opening_slot.start < finish for begin, finish in shift.breaks)]
            present = len(fixed_present) - fixed_slot_breaks(opening_slot) + sum(x[index] for index in covering) - sum(
                b[index][option] for index in covering for option in range(len(b[index]))
                if _option_breaks(candidates[index], option, opening_slot))
            if mode == SolveMode.BEST_EFFORT:
                gap = model.new_int_var(0, day.rules.opening_minimum, f"opening_gap_{len(gaps)}")
                model.add(present + gap >= day.rules.opening_minimum)
                gaps.append(gap)
            else:
                model.add(present >= day.rules.opening_minimum)
            qualified = [index for index in covering if employees[candidates[index].employee_id].opening_qualified]
            qualified_present = sum(employees[shift.employee_id].opening_qualified for shift in fixed_present) - sum(
                fb[index][option] for index, options in enumerate(fixed_break_options)
                if employees[fixed_assignments[index].employee_id].opening_qualified
                and fixed_assignments[index].start <= opening_slot.start and opening_slot.end <= fixed_assignments[index].end
                for option, breaks in enumerate(options)
                if any(begin < opening_slot.end and opening_slot.start < finish for begin, finish in breaks)) + sum(
                x[index] for index in qualified) - sum(
                b[index][option] for index in qualified for option in range(len(b[index]))
                if _option_breaks(candidates[index], option, opening_slot))
            if mode == SolveMode.BEST_EFFORT:
                qualified_gap = model.new_int_var(0, day.rules.opening_qualified_minimum, f"qualified_gap_{len(gaps)}")
                model.add(qualified_present + qualified_gap >= day.rules.opening_qualified_minimum)
                gaps.append(qualified_gap)
            else:
                model.add(qualified_present >= day.rules.opening_qualified_minimum)
        for pattern_name, minimum in day.rules.pattern_minimums.items():
            matching = [index for index, candidate in enumerate(candidates)
                        if candidate.date == day.day and candidate.pattern_name == pattern_name]
            fixed_count = sum(shift.date == day.day and shift.pattern_name == pattern_name
                              for shift in fixed_assignments)
            assigned_count = sum(x[index] for index in matching) + fixed_count
            if mode == SolveMode.BEST_EFFORT:
                gap = model.new_int_var(0, minimum, f"pattern_gap_{day.day}_{pattern_name}")
                model.add(assigned_count + gap == minimum if rules.pattern_only else
                          assigned_count + gap >= minimum)
                gaps.append(gap)
            else:
                model.add(assigned_count == minimum if rules.pattern_only else
                          assigned_count >= minimum)

    fairness: list[cp_model.IntVar] = []
    estimated_per_employee = (sum(
        minimum * min(minutes_between(
            local_instant(day.day, pattern.starts[0], timezone_for(rules.timezone)),
            local_instant(day.day, pattern.ends[0], timezone_for(rules.timezone), pattern.end_next_day))
            for pattern in day.rules.patterns if pattern.name == name)
        for day in days for name, minimum in day.rules.pattern_minimums.items())
        if rules.pattern_only else sum(slot.required for slot in all_slots) * rules.slot_minutes) // max(1, len(employees))
    for employee in snapshot.employees:
        indexes = by_employee.get(employee.id, [])
        fixed_minutes = sum(fixed_daily_minutes[(employee.id, work_date)] for work_date in selected_dates)
        configured = rules.employee_preferences.get(employee.id)
        desired = (round(configured.desired_weekly_minutes * len(selected_dates) / 7)
                   if configured is not None and configured.desired_weekly_minutes is not None
                   else employee.desired_minutes if employee.desired_minutes is not None
                   else estimated_per_employee)
        upper = sum(_candidate_net_minutes(candidates[index]) for index in indexes) + fixed_minutes + desired
        difference = model.new_int_var(-upper, upper, f"hours_delta_{employee.id}")
        absolute = model.new_int_var(0, upper, f"hours_abs_{employee.id}")
        model.add(difference == fixed_minutes
                  + sum(_candidate_net_minutes(candidates[index]) * x[index] for index in indexes) - desired)
        model.add_abs_equality(absolute, difference)
        absolute_slots = model.new_int_var(0, upper // rules.slot_minutes + 1, f"hours_abs_slots_{employee.id}")
        model.add_division_equality(absolute_slots, absolute, rules.slot_minutes)
        fairness.append(absolute_slots)
    weights = rules.weights
    efficiency = ((weights.excess_coverage * sum(excess) if weights.excess_coverage else 0)
        + sum((weights.unnecessary_work * (_candidate_net_minutes(candidate) // rules.slot_minutes)
               + weights.labor_cost * (cost_by_employee[candidate.employee_id] or 0)
                 * _candidate_net_minutes(candidate) // 6000) * x[index]
              for index, candidate in enumerate(candidates)))
    official_score_preference = sum(
        -weights.skill * _official_score_tenths(employees[candidate.employee_id].score) * x[index]
        for index, candidate in enumerate(candidates))
    preferences = ((weights.fairness * sum(fairness) if weights.fairness else 0)
        + sum((-(0 if rules.pattern_only else weights.skill * _skill_bucket(
                     employees[candidate.employee_id].score))
               - weights.regular_pattern * int(candidate.preferred)
               + weights.early_late_start * int(candidate.early_late_start)) * x[index]
              for index, candidate in enumerate(candidates))
        + sum(-weights.stability * b[index][option]
            for index, candidate in enumerate(candidates)
            for option in candidate.stable_break_options))

    tiers = []
    if mode == SolveMode.BEST_EFFORT:
        tiers.append(("pattern_gap" if rules.pattern_only else "staffing_gap",
                      sum(gaps), rules.solve_seconds * 0.4 if rules.solve_seconds else None))
    if rules.pattern_only and weights.skill and any(employee.score is not None for employee in snapshot.employees):
        tiers.append(("official_score", official_score_preference,
                      rules.solve_seconds * (0.5 if mode == SolveMode.BEST_EFFORT else 0.6)
                      if rules.solve_seconds else None))
    if weights.excess_coverage or weights.unnecessary_work or weights.labor_cost:
        tiers.append(("work_efficiency" if rules.pattern_only else "coverage_efficiency", efficiency,
                      rules.solve_seconds * (0.3 if mode == SolveMode.BEST_EFFORT else 0.6)
                      if rules.solve_seconds else None))
    tiers.append(("preferences", preferences, None))
    solver: cp_model.CpSolver | None = None
    solved = SolveStatus.UNKNOWN
    objective_stage = ""
    all_tiers_proven = True
    for tier_index, (tier_name, expression, cap) in enumerate(tiers):
        remaining = (rules.solve_seconds - (monotonic() - begun)
                     if rules.solve_seconds else None)
        model.minimize(expression)
        if solver is not None:
            model.clear_hints()
            for variable in [*x, *(option for options in b for option in options),
                             *(option for options in fb for option in options), *gaps, *excess]:
                model.add_hint(variable, solver.value(variable))
        trial = _solver(rules, min(cap, remaining) if cap is not None and remaining is not None
                        else remaining)
        trial_status = _status(trial.solve(model))
        if trial_status not in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}:
            if solver is None:
                return _failure(snapshot, rules, start_date, end_date, mode, trial_status, begun,
                                days, candidates, fixed_assignments)
            all_tiers_proven = False
            break
        solver, solved, objective_stage = trial, trial_status, tier_name
        if trial_status != SolveStatus.OPTIMAL:
            all_tiers_proven = False
        if tier_index + 1 < len(tiers):
            incumbent = int(round(trial.objective_value))
            model.add(expression == incumbent if trial_status == SolveStatus.OPTIMAL
                      else expression <= incumbent)
    assert solver is not None
    if not all_tiers_proven:
        solved = SolveStatus.FEASIBLE

    assignments = list(fixed_assignments)
    for index, options in enumerate(fb):
        if options:
            selected = next(option for option, variable in enumerate(options) if solver.value(variable))
            assignments[index] = assignments[index].model_copy(update={
                "breaks": fixed_break_options[index][selected],
                "reasons": ["Existing published or locked shift is preserved", "Untimed recorded break placed within the configured window"],
            })
    for index, candidate in enumerate(candidates):
        if not solver.value(x[index]):
            continue
        option = next(option for option, variable in enumerate(b[index]) if solver.value(variable))
        selected_breaks = candidate.break_options[option]
        employee = employees[candidate.employee_id]
        reasons = [f"Complete legal {candidate.pattern_name} pattern", f"Qualified for {candidate.role_code}",
                   "Availability covers the full shift"]
        if employee.score is not None:
            reasons.append(f"Evaluate official CLOSED-round score: {employee.score:g}")
        if option in candidate.stable_break_options:
            reasons.append("Preserves an existing draft shift")
        assignments.append(AssignedShift(employee_id=employee.id, employee_name=employee.name,
            store_id=snapshot.store_id, date=candidate.date, pattern_name=candidate.pattern_name,
            role_code=candidate.role_code, start=candidate.start, end=candidate.end,
            breaks=selected_breaks, paid_break=candidate.paid_break,
            net_work_minutes=_candidate_net_minutes(candidate), reasons=reasons))
    assignments.sort(key=lambda item: (item.date, item.start, item.employee_id))
    coverage = calculate_coverage(assignments, days)
    diagnostics = _coverage_diagnostics(coverage)
    coverage_by_start = {slot.start: slot for slot in coverage}
    for day in days:
        for opening_slot in (() if rules.pattern_only else opening_slots(day)):
            effective = coverage_by_start[opening_slot.start].effective
            if effective < day.rules.opening_minimum:
                diagnostics.append(Diagnostic(code="OPENING_STAFFING_GAP", certainty="PROVEN",
                    date=day.day, start=opening_slot.start, end=opening_slot.end,
                    message=f"Preparation requires {day.rules.opening_minimum} staff but only {effective} are on duty"))
            qualified_count = sum(employees[shift.employee_id].opening_qualified
                for shift in assignments if shift.start <= opening_slot.start and opening_slot.end <= shift.end
                and not any(begin < opening_slot.end and opening_slot.start < finish for begin, finish in shift.breaks))
            if qualified_count < day.rules.opening_qualified_minimum:
                diagnostics.append(Diagnostic(code="OPENING_QUALIFICATION_GAP", certainty="PROVEN",
                    date=day.day, start=opening_slot.start, end=opening_slot.end,
                    message=f"Preparation requires {day.rules.opening_qualified_minimum} qualified staff but only {qualified_count} are on duty"))
        for pattern_name, minimum in day.rules.pattern_minimums.items():
            actual = sum(shift.date == day.day and shift.pattern_name == pattern_name for shift in assignments)
            if actual < minimum:
                diagnostics.append(Diagnostic(code="PATTERN_STAFFING_GAP", certainty="PROVEN",
                    date=day.day, message=f"{pattern_name} requires {minimum} shifts but only {actual} are assigned"))
    errors = verify_result(snapshot, rules, days, assignments, mode)
    if errors:
        result = _result(snapshot, rules, start_date, end_date, mode, SolveStatus.DATA_ERROR,
            monotonic() - begun, diagnostics, assignments, coverage)
        result.validation_errors = errors
        return result
    objective = int(round(solver.objective_value))
    result = _result(snapshot, rules, start_date, end_date, mode, solved,
        monotonic() - begun, diagnostics, assignments, coverage, objective)
    result.parameters["objective_stage"] = objective_stage
    result.parameters["official_score_source"] = "Evaluate officialScore.score (latest valid CLOSED round)"
    result.parameters["official_score_scored_employees"] = sum(
        employee.score is not None for employee in snapshot.employees)
    result.parameters["official_score_unscored_employees"] = sum(
        employee.score is None for employee in snapshot.employees)
    result.parameters["official_score_weighted_shift_total"] = sum(
        _official_score_tenths(employees[shift.employee_id].score)
        for shift in assignments if not shift.fixed)
    if snapshot.source == "REAL":
        counts = {employee.id: 0 for employee in snapshot.employees}
        for shift in assignments:
            if not shift.fixed:
                counts[shift.employee_id] += 1
        result.score_allocation = sorted((ScoreAllocation(
            employee_id=employee.id, employee_name=employee.name,
            official_score=employee.score, candidate_shifts=counts[employee.id])
            for employee in snapshot.employees),
            key=lambda item: (item.official_score is None,
                              -(item.official_score or 0), item.employee_name))
    if rules.pattern_only:
        score_stage = "official_score > " if rules.weights.skill and result.parameters["official_score_scored_employees"] else ""
        result.parameters["objective_priority"] = (("pattern_gap > " if mode == SolveMode.BEST_EFFORT else "")
            + score_stage + "work_efficiency > preferences")
    else:
        result.parameters["objective_priority"] = ("staffing_gap > coverage_efficiency > preferences"
            if mode == SolveMode.BEST_EFFORT else "coverage_efficiency > preferences")
    result.parameters["priority_proven"] = int(all_tiers_proven)
    return result


def _coverage_diagnostics(coverage: list[CoverageSlot]) -> list[Diagnostic]:
    diagnostics = []
    for slot in coverage:
        role_gap = {role: required - slot.role_effective.get(role, 0)
                    for role, required in slot.role_required.items() if slot.role_effective.get(role, 0) < required}
        if slot.gap or role_gap:
            detail = f"{slot.gap} total staff missing"
            if role_gap:
                detail += "; role gaps " + ", ".join(f"{role}: {number}" for role, number in role_gap.items())
            diagnostics.append(Diagnostic(code="STAFFING_GAP", message=detail,
                certainty="PROVEN", start=slot.start, end=slot.end))
    return diagnostics


def _failure(snapshot: Snapshot, rules: RuleSet, start: date, end: date, mode: SolveMode,
             status: SolveStatus, begun: float, days: list[CompiledDay], candidates: list[Candidate],
             fixed_assignments: list[AssignedShift]) -> RunResult:
    diagnostics: list[Diagnostic] = []
    if status == SolveStatus.INFEASIBLE:
        for day in days:
            for pattern_name, minimum in day.rules.pattern_minimums.items():
                possible = {candidate.employee_id for candidate in candidates
                            if candidate.date == day.day and candidate.pattern_name == pattern_name}
                possible.update(shift.employee_id for shift in fixed_assignments
                    if shift.date == day.day and shift.pattern_name == pattern_name)
                if len(possible) < minimum:
                    diagnostics.append(Diagnostic(code="PATTERN_CANDIDATES", certainty="PROVEN", date=day.day,
                        message=f"{pattern_name} requires {minimum} shifts but only {len(possible)} employees have a complete available pattern"))
            opening_qualified_ids = {person.id for person in snapshot.employees if person.opening_qualified}
            for opening_slot in (() if rules.pattern_only else opening_slots(day)):
                available = {candidate.employee_id for candidate in candidates
                    if _candidate_covers(candidate, opening_slot)}
                available.update(shift.employee_id for shift in fixed_assignments
                    if shift.start <= opening_slot.start and opening_slot.end <= shift.end
                    and not any(a < opening_slot.end and opening_slot.start < b for a, b in shift.breaks))
                if len(available) < day.rules.opening_minimum:
                    diagnostics.append(Diagnostic(code="OPENING_CANDIDATES", certainty="PROVEN", date=day.day,
                        start=opening_slot.start, end=opening_slot.end,
                        message=f"Preparation requires {day.rules.opening_minimum} staff but only {len(available)} have a complete available qualified pattern"))
                qualified = available & opening_qualified_ids
                if len(qualified) < day.rules.opening_qualified_minimum:
                    diagnostics.append(Diagnostic(code="OPENING_QUALIFIED_CANDIDATES", certainty="PROVEN",
                        date=day.day, start=opening_slot.start, end=opening_slot.end,
                        message=f"Preparation requires {day.rules.opening_qualified_minimum} qualified staff but only {len(qualified)} have a complete candidate shift"))
            for slot in day.slots:
                possible = {candidate.employee_id for candidate in candidates if _candidate_covers(candidate, slot)}
                possible.update(shift.employee_id for shift in fixed_assignments
                    if shift.start <= slot.start and slot.end <= shift.end
                    and not any(a < slot.end and slot.start < b for a, b in shift.breaks))
                if len(possible) < slot.required:
                    diagnostics.append(Diagnostic(code="INSUFFICIENT_CANDIDATES", certainty="PROVEN", date=day.day,
                        start=slot.start, end=slot.end,
                        message=f"Demand requires {slot.required} staff but at most {len(possible)} qualified available employees have a complete candidate shift"))
        if not diagnostics:
            diagnostics.append(Diagnostic(code="COMBINED_CONSTRAINTS", certainty="LIKELY",
                message=("Individual pattern counts have candidates, but their combined availability, qualifications, fixed shifts or overlap constraints cannot all be satisfied"
                         if rules.pattern_only else
                         "Candidate counts suffice individually, but their combined availability, rest, breaks or coverage cannot all be satisfied")))
    elif status == SolveStatus.UNKNOWN:
        diagnostics.append(Diagnostic(code="TIME_LIMIT", certainty="PROVEN", message="Solver ended without a proven result or feasible assignment; this is not proof of infeasibility"))
    else:
        diagnostics.append(Diagnostic(code="SOLVER_ERROR", certainty="PROVEN", message="Solver rejected the generated model"))
    return _result(snapshot, rules, start, end, mode, status, monotonic() - begun, diagnostics)
