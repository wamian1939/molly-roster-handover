"""Independent hard-constraint replay. Does not import providers or orchestration."""
from datetime import timedelta
from zoneinfo import ZoneInfo

from engine.clock import local_instant, minutes_between, overlaps
from .contracts import CoverageSlot, ValidationError, ValidationReport
from .domain import availability_covers, caps, fixed_shifts, ledger_for
from .business import mandatory_for_day,covers_requirement,validate_scope


def validate(context, snapshot, rules, policy, shifts, through=None, ledger=None, active_dates=None, allow_incomplete_mandatory=False, shortfall_dates=None):
    # Draft-only shortfalls never permit overstaffing or illegal assignments.
    shortfall_dates=set(shortfall_dates or [])
    errors, coverage = [], []
    def fail(code, message, day=None, shift=None):
        errors.append(ValidationError(code=code, message=message, date=day, shift_id=shift))
    try:validate_scope(rules,snapshot,policy)
    except ValueError as error:
        fail('BUSINESS_RULES',str(error))
        return ValidationReport(valid=False,errors=errors,coverage=[])
    for shift in shifts:
        if shift.start.tzinfo is None or shift.end.tzinfo is None:
            fail("TIMEZONE", "Shift datetimes must be timezone-aware", shift.date, shift.id)
    if errors:
        return ValidationReport(valid=False,errors=errors,coverage=[])
    people = {e.id:e for e in snapshot.employees}
    zone = ZoneInfo(rules.timezone)
    start, end = context.days[0].date, context.days[-1].date
    day_set = {d.date for d in context.days if through is None or d.date <= through}
    if active_dates is not None:
        day_set &= set(active_dates)
    if len({s.id for s in shifts}) != len(shifts):
        fail("DUPLICATE_SHIFT", "Duplicate shift IDs")
    expected_fixed = fixed_shifts(snapshot, start, end)
    fixed_by_id = {s.id:s for s in expected_fixed}
    # Future locked shifts live in state from initialization, but are validated on their own day.
    for original in expected_fixed:
        if original not in shifts:
            fail("LOCKED_CHANGED", "Existing assignment removed or altered", original.date, original.id)
    for s in shifts:
        if s.date not in {d.date for d in context.days}:
            fail("DATE_RANGE", "Shift outside scheduling range", s.date, s.id)
        if s.fixed and s != fixed_by_id.get(s.id):
            fail("LOCKED_CHANGED", "Unrecognized or changed fixed assignment", s.date, s.id)
        if through is not None and s.date > through:
            if not s.fixed:
                fail("FUTURE_WRITE", "Daily proposal cannot write another date", s.date, s.id)
            continue
        person = people.get(s.employee_id)
        if person is None:
            fail("UNKNOWN_EMPLOYEE", "Employee is not in authoritative Snapshot", s.date, s.id)
            continue
        if s.start.tzinfo is None or s.end.tzinfo is None:
            fail("TIMEZONE", "Shift datetimes must be timezone-aware", s.date, s.id)
            continue
        if s.store_id != rules.store_id or s.date != s.start.astimezone(zone).date():
            fail("STORE_DATE", "Shift store/date mismatch", s.date, s.id)
        duration = minutes_between(s.start, s.end)
        minimum = rules.minimum_complete_shift_minutes or rules.compliance.minimum_shift_minutes
        if (duration < minimum or duration <= 0 or duration % 30 or
            s.start.astimezone(zone).minute % 30 or s.end.astimezone(zone).minute % 30 or
            s.start.second or s.end.second or s.start.microsecond or s.end.microsecond):
            fail("SHIFT_LENGTH", "Invalid, misaligned or isolated short shift", s.date, s.id)
        if s.end.astimezone(zone).date() != s.date:
            fail("OVERNIGHT_UNSUPPORTED", "V1 does not generate overnight assignments", s.date, s.id)
        if not s.fixed:
            legal = any(p.name == s.pattern_name and p.role_code == s.role_code and
                any(s.start == local_instant(s.date, clock, zone) for clock in p.starts) and
                any(s.end == local_instant(s.date, clock, zone, p.end_next_day) for clock in p.ends)
                for p in rules.for_date(s.date).patterns)
            if not legal:
                fail("PATTERN_TIME", "Actual interval does not match an allowed pattern", s.date, s.id)
        if not availability_covers(snapshot, s.employee_id, s.start, s.end):
            fail("AVAILABILITY", "Availability or approved leave excludes this interval", s.date, s.id)
        if s.role_code not in person.qualified_roles:
            fail("QUALIFICATION", "Missing formal position", s.date, s.id)
        if not snapshot.role_required_skills.get(s.role_code, set()) <= person.skill_codes:
            fail("SKILL", "Missing current required skills", s.date, s.id)
    for person in snapshot.employees:
        own = [s for s in shifts if s.employee_id == person.id]
        external = [s for s in snapshot.existing_shifts if s.employee_id == person.id and
            not (s.store_id == snapshot.store_id and start <= s.start.astimezone(zone).date() <= end)]
        all_work = sorted(own+external, key=lambda s:s.start)
        for i, left in enumerate(all_work):
            for right in all_work[i+1:]:
                if overlaps(left.start, left.end, right.start, right.end):
                    fail("OVERLAP", f"Employee {person.id} overlaps existing or proposed work")
        daily, weekly = caps(rules, policy, person.id)
        for day in day_set:
            today = [s for s in all_work if s.start.astimezone(zone).date() == day]
            if len(today) > rules.compliance_for(person.id).maximum_shifts_per_day:
                fail("DAILY_SHIFT_COUNT", f"Employee {person.id} exceeds daily shift limit", day)
            if daily is not None and sum(minutes_between(s.start,s.end) for s in today) > daily:
                fail("DAILY_CAP", f"Employee {person.id} exceeds nominal daily cap", day)
        if rules.enforce_work_rest_limits:
            limits = rules.compliance_for(person.id)
            for s in own:
                if minutes_between(s.start,s.end) > limits.maximum_shift_minutes:
                    fail("SHIFT_CAP", "Shift exceeds configured duration cap", s.date, s.id)
            for left, right in zip(all_work, all_work[1:]):
                if minutes_between(left.end, right.start) < limits.minimum_rest_minutes:
                    fail("REST_CAP", f"Employee {person.id} has insufficient inter-shift rest")
    recomputed = ledger_for(snapshot,rules,policy,shifts,start,end,ledger.version if ledger else 0)
    for row in recomputed.employees:
        limit = caps(rules,policy,row.employee_id)[1]
        if limit is not None and row.total_scheduled_minutes > limit:
            fail("WEEKLY_CAP", f"Employee {row.employee_id} exceeds nominal weekly cap")
    if ledger is not None and ledger != recomputed:
        fail("LEDGER_MISMATCH", "Ledger differs from independently recalculated ScheduleState")
    for day in context.days:
        if day.date not in day_set:
            continue
        own = [s for s in shifts if s.date == day.date]
        for requirement in mandatory_for_day(policy,day.date):
            if not any(covers_requirement(s,requirement,day.date,rules.timezone) for s in own):
                already_assigned=[s for s in own if s.employee_id==requirement.employee_id]
                no_capacity=len(already_assigned)>=rules.compliance_for(requirement.employee_id).maximum_shifts_per_day
                if day.date not in shortfall_dates and (no_capacity or not allow_incomplete_mandatory):
                    fail('MANDATORY_COVERAGE',f'{requirement.label}: {requirement.employee_id} must cover {requirement.start}–{requirement.end}',day.date)
        for band in day.coverage:
            left, right = local_instant(day.date, band.start, zone), local_instant(day.date, band.end, zone)
            while left < right:
                slot_end = left + timedelta(minutes=30)
                ids = sorted({s.employee_id for s in own if s.start <= left and s.end >= slot_end})
                coverage.append(CoverageSlot(date=day.date,start=left,end=slot_end,required=band.staff,
                    scheduled=len(ids),difference=len(ids)-band.staff,employee_ids=ids))
                if len(ids) != band.staff and not (day.date in shortfall_dates and len(ids)<band.staff):
                    fail("EXACT_COVERAGE", f"{left.astimezone(zone).strftime('%H:%M')} needs {band.staff}, got {len(ids)}", day.date)
                if any(s.start < slot_end and s.end > left and not (s.start <= left and s.end >= slot_end) for s in own):
                    fail("PARTIAL_SLOT", "Partial-slot work cannot be counted as full coverage", day.date)
                left = slot_end
        opening = local_instant(day.date, day.opening_start, zone)
        opening_actual=len({s.employee_id for s in own if s.start == opening})
        if opening_actual != day.opening_count and not (day.date in shortfall_dates and opening_actual<day.opening_count):
            fail("OPENING_COUNT", "Opening starts include Full and must equal configured opening count", day.date)
        if any(s.start < local_instant(day.date,day.coverage[0].start,zone) or
               s.end > local_instant(day.date,day.coverage[-1].end,zone) for s in own):
            fail("OUTSIDE_COVERAGE", "Work outside configured coverage horizon", day.date)
    return ValidationReport(valid=not errors,errors=errors,coverage=coverage)


def validate_calendar(calendar, shifts, snapshot, roster_roles):
    """Independently check serialized CalendarResponse against accepted state and live role map."""
    errors=[]
    def fail(message):
        errors.append(ValidationError(code="SERIALIZATION_MISMATCH",message=message))
    actual=calendar.get("shifts",[])
    if len(actual)!=len(shifts) or len({s.get("id") for s in actual})!=len(actual):
        fail("Calendar shift count/IDs differ from ScheduleState")
    by_id={s.get("id"):s for s in actual}
    people={e.id:e for e in snapshot.employees}
    if calendar.get("publishable") is not False or calendar.get("breaksPlanned") is not False or calendar.get("paidMinutes") is not None:
        fail("Draft compliance metadata is invalid")
    if calendar.get("storeId")!=snapshot.store_id:
        fail("Calendar store differs from Snapshot")
    periods=calendar.get("periods",[])
    if len(periods)!=1 or periods[0].get("status")!="DRAFT" or periods[0].get("publishedAt") is not None:
        fail("Calendar must have exactly one unpublished draft period")
    for shift in shifts:
        row=by_id.get(shift.id,{})
        role=roster_roles.get(shift.role_code)
        role_id=role["id"] if role else shift.role_code
        expected={"storeId":shift.store_id,"date":str(shift.date),"startAt":shift.start.isoformat(),
                  "endAt":shift.end.isoformat(),"shiftRoleId":role_id,"status":"DRAFT",
                  "source":"EXISTING_SNAPSHOT" if shift.fixed else "MULTI_AGENT_V1","patternName":shift.pattern_name}
        if any(row.get(k)!=v for k,v in expected.items()):
            fail(f"Calendar fields differ for {shift.id}")
        if len(row.get("assignments",[]))!=1:
            fail(f"Calendar must have one assignment for {shift.id}")
            continue
        assignment=row["assignments"][0]
        employee=people[shift.employee_id]
        if assignment.get("employeeId")!=employee.id or assignment.get("employeeNameSnapshot")!=employee.name:
            fail(f"Calendar employee differs for {shift.id}")
        expected_score=str(employee.score) if employee.score is not None else None
        if assignment.get("officialScoreSnapshot")!=expected_score:
            fail(f"Calendar official score differs for {shift.id}")
        if row.get("shiftRole",{}).get("id")!=role_id:
            fail(f"Calendar role object differs for {shift.id}")
        if periods and row.get("rosterPeriodId")!=periods[0].get("id"):
            fail(f"Calendar period differs for {shift.id}")
    return errors
