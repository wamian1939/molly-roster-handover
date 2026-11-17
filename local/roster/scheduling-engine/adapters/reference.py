from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from engine.candidates import completely_available
from engine.clock import local_instant, timezone_for
from engine.models import Snapshot


def observed_published_shifts(snapshot: Snapshot, start: date, end: date) -> list[dict]:
    """Aggregate existing assignments for reference, without treating them as legal rules."""
    zone = timezone_for(snapshot.timezone)
    range_start = local_instant(start, "00:00", zone)
    range_end = local_instant(end + timedelta(days=1), "00:00", zone)
    counts: dict[tuple, int] = defaultdict(int)
    for shift in snapshot.existing_shifts:
        if shift.store_id != snapshot.store_id or shift.status != "PUBLISHED":
            continue
        if not (shift.start < range_end and range_start < shift.end):
            continue
        key = (shift.start.astimezone(timezone.utc), shift.end.astimezone(timezone.utc),
               shift.role_code, shift.break_minutes_unknown)
        counts[key] += 1
    return [dict(date=start_instant.astimezone(zone).date().isoformat(),
                 start=start_instant.astimezone(zone).strftime("%H:%M"),
                 end=end_instant.astimezone(zone).strftime("%H:%M"),
                 start_instant=start_instant.isoformat().replace("+00:00", "Z"),
                 end_instant=end_instant.isoformat().replace("+00:00", "Z"),
                 end_next_day=end_instant.astimezone(zone).date() > start_instant.astimezone(zone).date(),
                 role_code=role_code,
                 break_minutes=break_minutes, assigned_people=count)
            for (start_instant, end_instant, role_code, break_minutes), count
            in sorted(counts.items(), key=lambda item: (item[0][0], item[0][1], str(item[0][2]), item[0][3]))]


def published_shift_source_alignment(snapshot: Snapshot, start: date, end: date) -> list[dict]:
    """Aggregate current formal-job and full-availability evidence for observed shifts.

    This is a source-data preflight, not a legal candidate count: approved leave,
    work policy and rest still need separate review.
    """
    employees = {person.id: person for person in snapshot.employees}
    results = []
    for reference in observed_published_shifts(snapshot, start, end):
        begin = datetime.fromisoformat(reference["start_instant"].replace("Z", "+00:00"))
        finish = datetime.fromisoformat(reference["end_instant"].replace("Z", "+00:00"))
        role = reference["role_code"]
        assigned = [shift for shift in snapshot.existing_shifts
            if shift.store_id == snapshot.store_id and shift.status == "PUBLISHED"
            and shift.start == begin and shift.end == finish
            and shift.role_code == role
            and shift.break_minutes_unknown == reference["break_minutes"]]
        eligible = [person for person in employees.values()
            if person.store_id == snapshot.store_id and role in person.qualified_roles
            and completely_available(person.id, begin, finish, snapshot.availability)]
        required_skills = snapshot.role_required_skills.get(role, set())
        skill_eligible = [person for person in eligible if required_skills <= person.skill_codes]
        without_external_overlap = [person for person in eligible
            if not any(shift.employee_id == person.id and shift.store_id != snapshot.store_id
                       and shift.start < finish and begin < shift.end
                       for shift in snapshot.existing_shifts)]
        skill_eligible_ids = {person.id for person in skill_eligible}
        results.append({**reference,
            "role_and_availability_pool": len(eligible),
            "role_skill_availability_pool": len(skill_eligible),
            "opening_qualified_role_and_availability_pool": sum(person.opening_qualified for person in eligible),
            "role_availability_no_external_overlap_pool": len(without_external_overlap),
            "role_skill_availability_no_external_overlap_pool": sum(
                person.id in skill_eligible_ids for person in without_external_overlap),
            "opening_qualified_no_external_overlap_pool": sum(
                person.opening_qualified for person in without_external_overlap),
            "assigned_without_current_role": sum(
                shift.employee_id not in employees or role not in employees[shift.employee_id].qualified_roles
                for shift in assigned),
            "assigned_without_required_skills": sum(
                shift.employee_id in employees and
                not required_skills <= employees[shift.employee_id].skill_codes
                for shift in assigned),
            "assigned_without_full_availability": sum(
                not completely_available(shift.employee_id, begin, finish, snapshot.availability)
                for shift in assigned)})
    return results


def comparison_snapshot(snapshot: Snapshot, start: date, end: date) -> tuple[Snapshot, int]:
    """Remove target-date published shifts only in a detached Lab comparison copy.

    The original snapshot remains the manual reference. Published shifts from
    other stores or dates, and locked shifts, remain hard constraints.
    """
    zone = timezone_for(snapshot.timezone)
    result = snapshot.model_copy(deep=True)
    result.existing_shifts = [shift for shift in result.existing_shifts
        if not (shift.store_id == snapshot.store_id and shift.status == "PUBLISHED"
                and start <= shift.start.astimezone(zone).date() <= end)]
    result.comparison_mode = "REPLACE_TARGET_PUBLISHED"
    removed = len(snapshot.existing_shifts) - len(result.existing_shifts)
    result.version = f"{snapshot.version}|lab-comparison:{start.isoformat()}:{end.isoformat()}"
    return result, removed
