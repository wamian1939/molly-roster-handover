"""Check work retained on failed dates before saving accepted editable dates."""
from zoneinfo import ZoneInfo
from engine.clock import minutes_between,overlaps
from .domain import caps


def retained_work_conflict(original,rules,policy,assignments,ledger,accepted,start,end):
    zone=ZoneInfo(original.timezone)
    accounted={(s.employee_id,s.store_id,s.start,s.end) for s in assignments}
    extra=[s for s in original.existing_shifts if s.store_id==original.store_id
        and start<=s.start.astimezone(zone).date()<=end and s.start.astimezone(zone).date() not in accepted
        and (s.employee_id,s.store_id,s.start,s.end) not in accounted]
    if any(s.employee_id==a.employee_id and overlaps(s.start,s.end,a.start,a.end) for s in extra for a in assignments):
        return '保留日期的原班次与新班次重叠，不能保存'
    for row in ledger.employees:
        limit=caps(rules,policy,row.employee_id)[1]
        extra_minutes=sum(minutes_between(s.start,s.end) for s in extra if s.employee_id==row.employee_id)
        if limit is not None and row.total_scheduled_minutes+extra_minutes>limit:
            return '保留日期的原班次会导致员工超过周工时上限，不能保存'
    return None
