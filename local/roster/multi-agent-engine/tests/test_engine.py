from datetime import date,timedelta
import copy
import json
import pytest

from multi_agent.contracts import Policy, ScheduledShift
from multi_agent.domain import context_for, ledger_for, candidates_for, priority
from multi_agent.fixtures import example_rules,synthetic_snapshot
from multi_agent.orchestrator import Orchestrator
from multi_agent.validator import validate
from scripted_provider import ScriptedProvider

MON=date(2026,10,26)


def engine(days=7,scenario="balanced",provider=None,policy=None):
    rules=example_rules()
    snapshot=synthetic_snapshot(MON,MON+timedelta(days=days-1),rules,scenario)
    return Orchestrator(provider or ScriptedProvider(),rules,snapshot,MON,MON+timedelta(days=days-1),policy=policy)


def test_full_week_and_frontend_state_contract():
    e=engine()
    result=e.run()
    assert result.status=="DRAFT_VALIDATED",result.validation
    assert len(e.history)==7
    assert result.state_version==7
    assert len(result.assignments)!=69
    assert len(result.calendar["shifts"])==len(result.assignments)
    assert all(s["status"]=="DRAFT" and s["source"]=="MULTI_AGENT_V1" for s in result.calendar["shifts"])
    assert result.publishable is False and result.paid_minutes_status=="UNKNOWN"
    assert result.break_planning=="NOT_IMPLEMENTED"
    assert len(result.validation.coverage)==7*24
    assert all(s.difference==0 for s in result.validation.coverage)
    agents=[p[0] for p in e.provider.payloads]
    assert agents==["requirement"]+["daily"]*7+["review","audit"]
    for shift,serialized in zip(result.assignments,result.calendar["shifts"]):
        assert serialized["assignments"][0]["employeeId"]==shift.employee_id
        assert serialized["startAt"]==shift.start.isoformat()
        assert serialized["endAt"]==shift.end.isoformat()


def test_monday_full_overlap_opening_inclusion_and_single_ledger_count():
    e=engine(1)
    result=e.run()
    assert result.validation.valid
    assert len(result.assignments)==5  # 3 Full, 1 Early, 1 Late, not 8 or 11.
    assert len({s.employee_id for s in result.assignments})==5
    full=next(s for s in result.assignments if s.pattern_name=="Full")
    row=next(r for r in result.ledger.employees if r.employee_id==full.employee_id)
    assert row.total_scheduled_minutes==720 and row.shift_count==1 and row.total_paid_minutes is None
    assert all(full.employee_id in c.employee_ids for c in result.validation.coverage)
    assert [s.scheduled for s in result.validation.coverage[:3]]==[3,3,4]


def test_tuesday_reads_committed_monday_ledger():
    e=engine(3)
    assert e.run().validation.valid
    calls=[p for a,p in e.provider.payloads if a=="daily"]
    assert [p["ledger"]["version"] for p in calls]==[0,1,2]
    assert [(r['employee_id'],r['total_scheduled_minutes']) for r in calls[1]['ledger']['employees']]==[(r['employee_id'],r['total_scheduled_minutes']) for r in e.history[0]['ledger']['employees']]
    assert sum(r["total_scheduled_minutes"] for r in calls[1]["ledger"]["employees"])==2820


@pytest.mark.parametrize("scenario",["staff_shortage","skill_shortage","availability_conflict"])
def test_shortage_failure_never_exports_or_updates_ledger(scenario):
    e=engine(3,scenario,policy=Policy(max_repairs=1))
    result=e.run()
    assert result.status=="FAILED" and result.calendar is None
    assert e.version==0 and e.history==[]
    assert all(r.total_scheduled_minutes==0 for r in e.ledger.employees)


@pytest.mark.parametrize("field,value,code",[
    ("employee_id","not-real","UNKNOWN_EMPLOYEE"),
    ("role_code","not-qualified","QUALIFICATION"),
    ("start",None,"AVAILABILITY"),
    ("end",None,"EXACT_COVERAGE"),
    ("pattern_name","invented","PATTERN_TIME"),
])
def test_independent_validator_rejects_bad_actual_intervals(field,value,code):
    e=engine(1)
    e.run()
    shifts=list(e.shifts)
    first=shifts[0]
    if field=="start":value=first.start-timedelta(hours=1)
    if field=="end":value=first.end-timedelta(hours=6)  # Full ends 16:00, cannot count beyond 16.
    shifts[0]=first.model_copy(update={field:value})
    report=validate(e.context,e.snapshot,e.rules,e.policy,shifts)
    assert code in {x.code for x in report.errors}
    if field=="end":
        assert any(c.difference<0 for c in report.coverage if c.start>=value)


def test_half_open_boundary_and_duplicate_employee_not_counted_twice():
    e=engine(1);e.run()
    late=next(s for s in e.shifts if s.pattern_name=="Late")
    early=next(s for s in e.shifts if s.pattern_name=="Early")
    assert early.end==late.start
    duplicate=e.shifts[0].model_copy(update={"id":"duplicate"})
    report=validate(e.context,e.snapshot,e.rules,e.policy,e.shifts+[duplicate])
    assert "OVERLAP" in {x.code for x in report.errors}
    assert all(c.scheduled==c.required for c in report.coverage)


def test_configurable_rating_and_hours_really_change_priority_inputs():
    e=engine(1)
    a=e.snapshot.employees[0].model_copy(update={"score":92})
    b=e.snapshot.employees[1].model_copy(update={"score":85})
    assert priority(a,0,e.rules,Policy())["priority"]>priority(b,0,e.rules,Policy())["priority"]
    assert priority(a,1800,e.rules,Policy())["priority"]<priority(b,720,e.rules,Policy())["priority"]
    assert priority(a,1800,e.rules,Policy(fairness_weight=0))["priority"]>priority(b,720,e.rules,Policy(fairness_weight=0))["priority"]
    e.run()
    first=next(p for a,p in e.provider.payloads if a=="daily")
    assert all("rating_term" in c and "fairness_term" in c for c in first["ledger"]["employees"])


def test_weekly_and_daily_caps_are_hard():
    e=engine(1);e.run()
    report=validate(e.context,e.snapshot,e.rules,Policy(weekly_cap_minutes=600,daily_cap_minutes=600),e.shifts)
    assert {"WEEKLY_CAP","DAILY_CAP"}<={x.code for x in report.errors}


def test_missing_scores_stay_null():
    e=engine(1)
    e.snapshot.employees[0].score=None
    result=e.run()
    row=next(r for r in result.ledger.employees if r.employee_id==e.snapshot.employees[0].id)
    assert row.rating is None


class BadFirstDay(ScriptedProvider):
    def __init__(self): super().__init__();self.failed=False
    def generate(self,agent,payload,schema):
        output,usage=super().generate(agent,payload,schema)
        if agent=="daily" and not self.failed:
            self.failed=True
            output["choices"]=output["choices"][:-1]
        return output,usage


def test_same_day_repair_does_not_commit_failed_ledger():
    e=engine(3,provider=BadFirstDay())
    assert e.run().validation.valid
    calls=[p for a,p in e.provider.payloads if a=="daily"]
    assert [p["ledger"]["version"] for p in calls]==[0,0,1,2]
    assert calls[1]["validation_errors"]


class BadContext(ScriptedProvider):
    def generate(self,a,p,s):
        out,usage=super().generate(a,p,s)
        if a=="requirement":out["days"][0]["opening_count"]=99
        return out,usage


def test_requirement_agent_cannot_rewrite_rules():
    e=engine(1,provider=BadContext(),policy=Policy(max_repairs=1))
    before=e.rules.model_dump()
    assert e.run().status=="FAILED"
    assert e.rules.model_dump()==before and e.version==0


class WrongDate(ScriptedProvider):
    def generate(self,a,p,s):
        out,usage=super().generate(a,p,s)
        if a=="daily" and p["date"]!="2026-10-26":out["date"]="2026-10-26"
        return out,usage


def test_previous_accepted_day_is_never_rewritten():
    e=engine(3,provider=WrongDate(),policy=Policy(max_repairs=0))
    assert e.run().status=="FAILED"
    assert e.version==1 and len(e.history)==1
    assert {str(s.date) for s in e.shifts}=={"2026-10-26"}


def test_ledger_tampering_detected():
    e=engine(1);e.run()
    bad=e.ledger.model_copy(update={"employees":[]})
    report=validate(e.context,e.snapshot,e.rules,e.policy,e.shifts,ledger=bad)
    assert "LEDGER_MISMATCH" in {x.code for x in report.errors}


def test_review_finds_unassigned_without_adding_shifts():
    e=engine(1);result=e.run()
    assert len(result.review.unassigned_employee_ids)==13
    assert result.review.replacements==[]
    assert len(result.assignments)==5


def test_fixed_assignment_preserved_and_counted_once():
    from engine.models import ExistingShift
    e=engine(1);e.run()
    existing=e.shifts[0]
    e.snapshot.existing_shifts=[ExistingShift(source_shift_id="real-lock",employee_id=existing.employee_id,
        store_id=e.rules.store_id,start=existing.start,end=existing.end,role_code=existing.role_code,status="LOCKED")]
    from multi_agent.domain import fixed_shifts
    fixed=fixed_shifts(e.snapshot,e.start,e.end)[0]
    shifts=[fixed]+e.shifts[1:]
    ledger=ledger_for(e.snapshot,e.rules,e.policy,shifts,e.start,e.end,1)
    report=validate(e.context,e.snapshot,e.rules,e.policy,shifts,ledger=ledger)
    assert report.valid
    assert next(r for r in ledger.employees if r.employee_id==fixed.employee_id).total_scheduled_minutes==720
    bad=validate(e.context,e.snapshot,e.rules,e.policy,shifts[1:])
    assert "LOCKED_CHANGED" in {x.code for x in bad.errors}


class BadReview(ScriptedProvider):
    def generate(self,a,p,s):
        out,usage=super().generate(a,p,s)
        if a=="review":
            out["replacements"]=[{"shift_id":p["shifts"][0]["id"],"employee_id":"fake","reason":"illegal"}]
        if a=="audit":out["approved_replacement_indices"]=[0]
        return out,usage


def test_agent3_invalid_replacement_cannot_change_state():
    e=engine(1,provider=BadReview(),policy=Policy(max_repairs=1))
    result=e.run()
    assert result.status=="FAILED" and e.version==1 and result.calendar is None
    assert all(s.employee_id!="fake" for s in e.shifts)


def test_strict_schemas_and_solver_import_boundary():
    from multi_agent.contracts import UnassignedStaffReview
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        UnassignedStaffReview(unassigned_employee_ids=[],low_hours_employee_ids=[],analysis="",replacements=[],retain_reasons=[],add_shifts=[])
    import sys
    assert "ortools" not in sys.modules and "engine.solver" not in sys.modules and "engine.v2" not in sys.modules


@pytest.mark.parametrize("mode",["PHASE_HEADCOUNT","PATTERN_AND_COVERAGE"])
def test_legacy_rules_not_silently_reinterpreted(mode):
    e=engine(1)
    bad=e.rules.model_copy(update={"requirement_mode":mode})
    with pytest.raises(ValueError):context_for(bad,e.snapshot,e.start,e.end)
