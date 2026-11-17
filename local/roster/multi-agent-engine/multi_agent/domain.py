from __future__ import annotations

from datetime import date, timedelta
from hashlib import sha256
import json
from zoneinfo import ZoneInfo

from engine.models import RuleSet, Snapshot
from engine.clock import local_instant, minutes_between
from .contracts import (Band, DayContext, EmployeeHours, EmployeeHoursLedger,
                        Policy, ScheduledShift, SchedulingContext)
from .business import rating_targets,target_progress,mandatory_for_day,covers_requirement,validate_scope


def digest(value) -> str:
    return sha256(json.dumps(value, sort_keys=True, default=str, ensure_ascii=False).encode()).hexdigest()


def dates(start: date, end: date) -> list[date]:
    if (end - start).days not in range(7) or start.weekday() + (end-start).days > 6:
        raise ValueError("V1 supports 1 to 7 sequential dates within one Monday-Sunday week")
    return [start + timedelta(days=i) for i in range((end-start).days+1)]


def context_for(rules: RuleSet, snapshot: Snapshot, start: date, end: date, policy: Policy | None = None) -> SchedulingContext:
    policy=policy or Policy()
    validate_scope(rules,snapshot,policy)
    if rules.store_id != snapshot.store_id or rules.timezone != snapshot.timezone:
        raise ValueError("RuleSet and Snapshot store/timezone must agree")
    if rules.requirement_mode != "EXACT_SCHEDULED" or rules.slot_minutes != 30:
        raise ValueError("V1 requires an explicit EXACT_SCHEDULED RuleSet with 30-minute slots; no legacy headcount conversion is implicit")
    if len({e.id for e in snapshot.employees}) != len(snapshot.employees):
        raise ValueError("Duplicate employees in Snapshot")
    known = {e.id for e in snapshot.employees}
    if any(e.store_id != snapshot.store_id for e in snapshot.employees):
        raise ValueError("Snapshot contains an employee from another store")
    if any(w.employee_id not in known for w in snapshot.availability + snapshot.approved_leave):
        raise ValueError("Snapshot windows refer to unknown employees")
    days = []
    zone = ZoneInfo(rules.timezone)
    for day in dates(start, end):
        if (rules.valid_from and day < rules.valid_from) or (rules.valid_through and day > rules.valid_through):
            raise ValueError("Requested dates are outside RuleSet validity")
        bands = rules.weekly_exact_staffing.get(day.weekday())
        if not bands:
            raise ValueError(f"Missing explicit coverage for {day}")
        previous = None
        for band in bands:
            left, right = local_instant(day, band.start, zone), local_instant(day, band.end, zone)
            if right <= left or minutes_between(left, right) % 30 or any(x.minute % 30 for x in (left, right)):
                raise ValueError("Coverage must have positive aligned half-hour intervals")
            if previous is not None and left != previous:
                raise ValueError("Coverage bands must be ordered, contiguous and non-overlapping")
            previous = right
        patterns = rules.for_date(day).patterns
        day_rules=rules.for_date(day)
        if day_rules.demand or day_rules.pattern_minimums or day_rules.opening_minimum or day_rules.opening_qualified_minimum:
            raise ValueError("EXACT_SCHEDULED V1 cannot silently combine legacy demand/headcount rules; derive an explicit reviewed RuleSet")
        if len({p.name for p in patterns}) != len(patterns):
            raise ValueError("Pattern names must be unique")
        days.append(DayContext(date=day, coverage=[Band(**b.model_dump()) for b in bands],
                               opening_start=bands[0].start, opening_count=bands[0].staff,
                               patterns=[p.name for p in patterns]))
    snapshot_payload=snapshot.model_dump(mode="json")
    for employee in snapshot_payload["employees"]:
        employee["qualified_roles"]=sorted(employee["qualified_roles"])
        employee["skill_codes"]=sorted(employee["skill_codes"])
    snapshot_payload["role_required_skills"]={k:sorted(v) for k,v in snapshot_payload["role_required_skills"].items()}
    fingerprint=digest({"rules":rules.model_dump(mode='json'),'snapshot':snapshot_payload,'start':start,'end':end})
    if policy.business_rules:
        fingerprint=digest({'source_hash':fingerprint,'business_rules':policy.business_rules.model_dump(mode='json')})
    return SchedulingContext(source_hash=fingerprint,
        rule_version=rules.version, snapshot_version=snapshot.version, days=days,
        employee_ids=sorted(known), opening_is_included=True, full_counts_once=True,
        availability_is_hard=True, rating_is_soft=True, priorities=[],
        employees=[e.model_dump(mode="json") for e in snapshot.employees],
        availability=[w.model_dump(mode="json") for w in snapshot.availability],
        approved_leave=[w.model_dump(mode="json") for w in snapshot.approved_leave],
        existing_shifts=[s.model_dump(mode="json") for s in snapshot.existing_shifts],
        pattern_definitions=[p.model_dump(mode="json") for p in rules.base_day.patterns],
        rule_hour_limits={"enforced":rules.enforce_work_rest_limits,"compliance":rules.compliance.model_dump(),
                          "employee_limits":{k:v.model_dump() for k,v in rules.employee_limits.items()}},
        business_rule_version=policy.business_rules.version if policy.business_rules else None,
        business_rules=policy.business_rules.model_dump(mode='json') if policy.business_rules else None,
        rating_hour_targets=list(rating_targets(snapshot,policy,start,end).values()))


def same_context(actual: SchedulingContext, expected: SchedulingContext) -> bool:
    from .contracts import RequirementUnderstanding
    fields=set(RequirementUnderstanding.model_fields)-{"priorities"}
    return actual.model_dump(include=fields) == expected.model_dump(include=fields)


def fixed_shifts(snapshot: Snapshot, start: date, end: date) -> list[ScheduledShift]:
    zone = ZoneInfo(snapshot.timezone)
    known = {e.id for e in snapshot.employees}
    result = []
    seen = set()
    for item in snapshot.existing_shifts:
        if item.employee_id not in known:
            if item.store_id == snapshot.store_id:
                raise ValueError("Existing store shift refers to an inactive or missing employee; review source")
            continue
        key = (item.source_shift_id, item.employee_id, item.start, item.end)
        if key in seen:
            raise ValueError("Duplicate existing assignment in Snapshot")
        seen.add(key)
        day = item.start.astimezone(zone).date()
        if item.store_id == snapshot.store_id and start <= day <= end:
            result.append(ScheduledShift(id="fixed-"+digest(key)[:16], employee_id=item.employee_id,
                store_id=item.store_id, date=day, pattern_name="Existing", role_code=item.role_code or "",
                start=item.start, end=item.end, fixed=True, source_shift_id=item.source_shift_id,
                reason="Preserved existing Snapshot assignment"))
    return result


def caps(rules: RuleSet, policy: Policy, employee_id: str) -> tuple[int | None, int | None]:
    limits = rules.compliance_for(employee_id)
    daily = limits.maximum_daily_work_minutes if rules.enforce_work_rest_limits else None
    weekly = limits.maximum_weekly_work_minutes if rules.enforce_work_rest_limits else None
    if policy.daily_cap_minutes is not None:
        daily = min(daily, policy.daily_cap_minutes) if daily else policy.daily_cap_minutes
    if policy.weekly_cap_minutes is not None:
        weekly = min(weekly, policy.weekly_cap_minutes) if weekly else policy.weekly_cap_minutes
    return daily, weekly


def ledger_for(snapshot: Snapshot, rules: RuleSet, policy: Policy, shifts: list[ScheduledShift],
               start: date, end: date, version: int) -> EmployeeHoursLedger:
    zone = ZoneInfo(snapshot.timezone)
    week_start = start - timedelta(days=start.weekday())
    week_end = week_start + timedelta(days=7)
    output = []
    targets=rating_targets(snapshot,policy,start,end)
    for person in snapshot.employees:
        assigned = [s for s in shifts if s.employee_id == person.id]
        # Target-store existing shifts are already in state; only add surrounding/external work.
        existing = [s for s in snapshot.existing_shifts if s.employee_id == person.id
            and week_start <= s.start.astimezone(zone).date() < week_end
            and not (s.store_id == snapshot.store_id and start <= s.start.astimezone(zone).date() <= end)]
        outside_minutes = sum(minutes_between(s.start, s.end) for s in existing)
        committed = outside_minutes + sum(minutes_between(s.start,s.end) for s in assigned if s.fixed)
        total = outside_minutes + sum(minutes_between(s.start, s.end) for s in assigned)
        weekly = caps(rules, policy, person.id)[1]
        progress=target_progress(targets.get(person.id),sum(minutes_between(s.start,s.end) for s in assigned))
        target_fields={k:v for k,v in progress.items() if k in {'available_minutes','target_fraction','target_scheduled_minutes',
            'target_assigned_minutes','target_remaining_minutes','target_excess_minutes'}}
        output.append(EmployeeHours(employee_id=person.id, rating=person.score,
            assigned_dates=sorted({s.date for s in assigned}|{s.start.astimezone(zone).date() for s in existing}),
            assigned_shifts=[s.id for s in assigned]+["existing-"+digest((s.source_shift_id,s.employee_id,s.start,s.end))[:16] for s in existing],
            total_scheduled_minutes=total, total_paid_minutes=None,
            shift_count=len(assigned)+len(existing), existing_committed_minutes=committed,
            existing_committed_hours=committed/60,
            availability=[w.model_dump(mode="json") for w in snapshot.availability if w.employee_id == person.id],
            remaining_hours_capacity=max(0, weekly-total)/60 if weekly is not None else None,**target_fields))
    return EmployeeHoursLedger(version=version, employees=output)


def priority(person, minutes: int, rules: RuleSet, policy: Policy) -> dict:
    pref = rules.employee_preferences.get(person.id)
    desired = pref.desired_weekly_minutes if pref else person.desired_minutes
    rating_term = None if person.score is None else person.score * policy.rating_weight
    fairness_term = -(minutes/60) * policy.fairness_weight
    preference_term = max(0, (desired-minutes)/60) * policy.preference_weight if desired is not None else 0
    return {"rating": person.score, "rating_term": rating_term, "fairness_term": fairness_term,
            "preference_term": preference_term,
            "priority": (rating_term if rating_term is not None else 0)+fairness_term+preference_term,
            "missing_score": person.score is None}


def candidates_for(day: date, rules: RuleSet, snapshot: Snapshot, ledger: EmployeeHoursLedger | None, policy: Policy | None = None) -> list[ScheduledShift]:
    zone = ZoneInfo(rules.timezone)
    result = []
    # Enumerate individual legal intervals, never choose employees or solve a schedule.
    for person in snapshot.employees:
        for pattern in rules.for_date(day).patterns:
            if pattern.role_code not in person.qualified_roles:
                continue
            if not snapshot.role_required_skills.get(pattern.role_code, set()) <= person.skill_codes:
                continue
            for left in pattern.starts:
                for right in pattern.ends:
                    start = local_instant(day, left, zone)
                    end = local_instant(day, right, zone, pattern.end_next_day)
                    if end <= start or end.astimezone(zone).date() != day:
                        continue  # V1 explicitly rejects overnight generation.
                    if not availability_covers(snapshot, person.id, start, end):
                        continue
                    key = (day, person.id, pattern.name, pattern.role_code, start, end)
                    candidate=ScheduledShift(id=f"{person.id}:{pattern.name}:{day}:{left}-{right}", employee_id=person.id,
                        store_id=rules.store_id, date=day, pattern_name=pattern.name,
                        role_code=pattern.role_code, start=start, end=end)
                    mandatory=[r for r in mandatory_for_day(policy,day) if r.employee_id==person.id] if policy else []
                    if (rules.compliance_for(person.id).maximum_shifts_per_day==1 and
                        any(not covers_requirement(candidate,r,day,rules.timezone) for r in mandatory)):
                        continue
                    result.append(candidate)
    return result


def availability_covers(snapshot, employee_id, start, end):
    cursor = start
    for window in sorted((w for w in snapshot.availability if w.employee_id == employee_id), key=lambda w:w.start):
        if window.start <= cursor < window.end:
            cursor = max(cursor, window.end)
        if cursor >= end:
            break
    return cursor >= end and not any(w.employee_id == employee_id and w.start < end and start < w.end
                                     for w in snapshot.approved_leave)
