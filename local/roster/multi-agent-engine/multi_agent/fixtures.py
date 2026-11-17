"""Synthetic employees for explicit MOCK scenarios; never used for REAL requests."""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from engine.models import RuleSet, Snapshot, StaffMember, TimeWindow
from . import LAB_ROOT
from .domain import dates


def example_rules():
    original=RuleSet.model_validate_json((LAB_ROOT/"configs/hurstville-exact-scheduled.json").read_text(encoding="utf-8"))
    return original.model_copy(update={"version":original.version+":multi-agent-v1-derived",
                                       "copied_from":original.version},deep=True)


def synthetic_snapshot(start,end,rules,scenario="balanced"):
    roles={p.role_code for p in rules.base_day.patterns}
    count=3 if scenario=="staff_shortage" else 18
    people=[StaffMember(id=f"synthetic-{i:02}",name=f"Test employee {i:02}",store_id=rules.store_id,
        qualified_roles=roles if scenario!="skill_shortage" else set(),score=98-i*3,
        opening_qualified=True) for i in range(count)]
    zone=ZoneInfo(rules.timezone)
    windows=[]
    for day in dates(start,end):
        for employee in people:
            left=datetime.combine(day,datetime.min.time(),tzinfo=zone)+timedelta(hours=10)
            right=left+timedelta(hours=12)
            if scenario=="availability_conflict":
                left+=timedelta(hours=8)
            windows.append(TimeWindow(employee_id=employee.id,start=left,end=right))
    return Snapshot(store_id=rules.store_id,timezone=rules.timezone,generated_at=datetime.now(timezone.utc),
        version="synthetic-v1-"+scenario,employees=people,availability=windows,source="MOCK",
        run_purpose="EXPLORATORY",staffing_rules_confirmed=True)
