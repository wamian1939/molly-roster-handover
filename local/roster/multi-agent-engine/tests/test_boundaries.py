from datetime import timedelta
import json
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from test_engine import engine,MON
from scripted_provider import ScriptedProvider
from multi_agent.validator import validate,validate_calendar
from multi_agent.domain import ledger_for
from multi_agent.contracts import Policy


def test_approved_leave_veto_and_required_skill():
    from engine.models import TimeWindow
    e=engine(1);e.run()
    s=e.shifts[0]
    e.snapshot.approved_leave=[TimeWindow(employee_id=s.employee_id,start=s.start+timedelta(hours=1),end=s.end)]
    report=validate(e.context,e.snapshot,e.rules,e.policy,e.shifts)
    assert 'AVAILABILITY' in {x.code for x in report.errors}
    e.snapshot.approved_leave=[]
    e.snapshot.role_required_skills[s.role_code]={'missing-skill'}
    report=validate(e.context,e.snapshot,e.rules,e.policy,e.shifts)
    assert 'SKILL' in {x.code for x in report.errors}


def test_existing_external_hours_and_overlap_are_not_ignored():
    from engine.models import ExistingShift
    e=engine(1);e.run()
    s=e.shifts[0]
    e.snapshot.existing_shifts=[ExistingShift(employee_id=s.employee_id,store_id='other-store',
        source_shift_id='external',start=s.start-timedelta(hours=1),end=s.end,status='PUBLISHED')]
    row=next(r for r in ledger_for(e.snapshot,e.rules,e.policy,e.shifts,e.start,e.end,1).employees if r.employee_id==s.employee_id)
    assert row.existing_committed_minutes==780 and row.total_scheduled_minutes==1500
    assert 'OVERLAP' in {x.code for x in validate(e.context,e.snapshot,e.rules,e.policy,e.shifts).errors}


class ValidReplacement(ScriptedProvider):
    def generate(self,a,p,s):
        out,u=super().generate(a,p,s)
        if a=='review':
            out['replacements']=[{'shift_id':p['shifts'][0]['id'],'employee_id':p['unassigned_employee_ids'][0],
                                  'reason':'Same qualifications and full availability, lower hours with acceptable rating'}]
        if a=='audit':out['approved_replacement_indices']=[0]
        return out,u


def test_valid_same_day_replacement_recomputes_ledger():
    e=engine(1,provider=ValidReplacement());result=e.run()
    assert result.status=='DRAFT_VALIDATED' and e.version==2
    assert len(e.history)==2
    target=e.review.replacements[0]
    assert next(s for s in e.shifts if s.id==target.shift_id).employee_id==target.employee_id
    assert sum(r.total_scheduled_minutes for r in e.ledger.employees)==2820
    assert validate(e.context,e.snapshot,e.rules,e.policy,e.shifts,ledger=e.ledger).valid


class RouteOldDay(ScriptedProvider):
    def generate(self,a,p,s):
        out,u=super().generate(a,p,s)
        if a=='audit':out['actions']=[{'target':'DAILY','date':'2026-10-26','reason':'Try a different Monday'}]
        return out,u


def test_agent4_routes_but_cannot_replan_committed_dates():
    e=engine(3,provider=RouteOldDay());result=e.run()
    assert result.status=='FAILED' and e.version==3
    assert any(v['kind']=='REPAIR_REQUIRES_NEW_RUN' for v in e.events)


def test_provider_cannot_modify_other_agents_shared_state():
    class Mutating(ScriptedProvider):
        def generate(self,a,p,s):
            out,u=super().generate(a,p,s)
            if a=='review':p['snapshot']['employees'].clear();p['shifts'].clear()
            return out,u
    e=engine(1,provider=Mutating());r=e.run()
    assert r.status=='DRAFT_VALIDATED' and len(e.snapshot.employees)==18 and len(e.shifts)==5


def test_serialized_json_cannot_drift_from_state():
    e=engine(1);result=e.run()
    assert not validate_calendar(result.calendar,e.shifts,e.snapshot,{})
    bad=json.loads(json.dumps(result.calendar))
    bad['shifts'][0]['startAt']=bad['shifts'][0]['endAt']
    assert validate_calendar(bad,e.shifts,e.snapshot,{})


def test_existing_unchanged_rules_and_real_source_adapter_provenance():
    from multi_agent import LAB_ROOT
    rules=LAB_ROOT/'configs/hurstville-exact-scheduled.json'
    before=rules.read_bytes()
    e=engine(1);e.run()
    assert rules.read_bytes()==before
    source=(LAB_ROOT/'adapters/real.py').read_text(encoding='utf-8')
    assert 'score=raw["officialScore"]["score"]' in source
    assert '_effective_availability(availability_rows, known)' in source


def test_live_provider_response_parser_with_mock_http(monkeypatch):
    import httpx
    from multi_agent.provider import AnthropicProvider
    monkeypatch.setenv('MULTI_AGENT_API_KEY','unit-secret')
    monkeypatch.setenv('MULTI_AGENT_MODEL','unit-model')
    monkeypatch.setenv('MULTI_AGENT_BASE_URL','https://example.invalid')
    def fake_post(client,url,**kwargs):
        assert kwargs['json']['tool_choice']=={'type':'tool','name':'submit_result'}
        assert kwargs['json']['tools'][0]['input_schema']=={'type':'object'}
        return httpx.Response(200,json={'model':'unit-model','stop_reason':'tool_use',
            'content':[{'type':'tool_use','name':'submit_result','input':{'ok':True}}],
            'usage':{'input_tokens':123,'output_tokens':45}})
    monkeypatch.setattr(httpx.Client,'post',fake_post)
    out,usage=AnthropicProvider().generate('audit',{}, {'type':'object'})
    assert out=={'ok':True} and usage['input_tokens']==123
    assert 'unit-secret' not in json.dumps(usage)


def test_api_real_auth_required_and_origin_protection(monkeypatch):
    from multi_agent.api import app
    client=TestClient(app)
    assert client.get('/multi-api/health').json()['draft_only'] is True
    assert client.get('/multi-api/inputs',params={'start_date':str(MON),'end_date':str(MON),'source':'REAL'}).status_code==401
    assert client.post('/multi-api/runs',headers={'origin':'https://untrusted.example'},json={}).status_code==403
    assert client.get('/multi-api/runs/not-owned').status_code==404
    assert client.get('/multi-api/inputs',params={'start_date':str(MON),'end_date':str(MON),'source':'MOCK'}).status_code==200


def test_api_stale_snapshot_rejected(monkeypatch):
    from multi_agent.api import app
    monkeypatch.setenv('MULTI_AGENT_API_KEY','unit-secret');monkeypatch.setenv('MULTI_AGENT_MODEL','unit-model')
    client=TestClient(app)
    response=client.post('/multi-api/runs',json={'source':'MOCK','start_date':str(MON),'end_date':str(MON),
        'expected_rule_version':'outdated','expected_snapshot_version':'outdated'})
    assert response.status_code==409


def test_api_async_run_and_failed_export_isolation(monkeypatch,tmp_path):
    import time
    import multi_agent.api as api
    monkeypatch.setattr(api,'AnthropicProvider',ScriptedProvider)
    monkeypatch.setattr(api,'DATA',tmp_path)
    client=TestClient(api.app)
    preview=client.get('/multi-api/inputs',params={'start_date':str(MON),'end_date':str(MON),'source':'MOCK'}).json()
    response=client.post('/multi-api/runs',json={'source':'MOCK','start_date':str(MON),'end_date':str(MON),
        'expected_rule_version':preview['rules']['version'],'expected_snapshot_version':preview['snapshot_version']})
    assert response.status_code==202
    run=response.json()['run_id']
    for _ in range(100):
        state=client.get('/multi-api/runs/'+run).json()
        if state['status']!='RUNNING':break
        time.sleep(.01)
    assert state['status']=='DRAFT_VALIDATED'
    assert client.get(f'/multi-api/runs/{run}/export').status_code==200
    assert client.get(f'/multi-api/runs/{run}',headers={'cookie':'different-owner=yes'}).status_code==404
    assert all('input' not in e and 'output' not in e for e in state['events'])


def test_context_contains_authoritative_source_layers():
    e=engine(1);r=e.run()
    assert len(r.context.employees)==18 and len(r.context.availability)==18
    assert len(r.context.pattern_definitions)==4
    assert r.context.employees[0]['score']==98
    assert r.context.rule_hour_limits['enforced'] is False


def test_source_digest_is_stable_across_python_hash_seeds():
    import subprocess,os
    code='''from datetime import date,datetime,timezone
from multi_agent.fixtures import example_rules,synthetic_snapshot
from multi_agent.domain import context_for
r=example_rules(); d=date(2026,10,26); s=synthetic_snapshot(d,d,r)
s.generated_at=datetime(2026,10,26,tzinfo=timezone.utc)
print(context_for(r,s,d,d).source_hash)
'''
    root=Path(__file__).resolve().parents[1]
    hashes=[subprocess.check_output([sys.executable,'-c',code],cwd=root,
        env={**os.environ,'PYTHONHASHSEED':seed},text=True).strip() for seed in ['17','291']]
    assert hashes[0]==hashes[1]


def test_failed_result_cannot_be_exported(monkeypatch,tmp_path):
    import multi_agent.api as api
    from test_engine import BadReview
    import time
    monkeypatch.setattr(api,'AnthropicProvider',BadReview);monkeypatch.setattr(api,'DATA',tmp_path)
    client=TestClient(api.app)
    p=client.get('/multi-api/inputs',params={'start_date':str(MON),'end_date':str(MON),'source':'MOCK'}).json()
    r=client.post('/multi-api/runs',json={'source':'MOCK','start_date':str(MON),'end_date':str(MON),
        'policy':{'max_repairs':0},'expected_rule_version':p['rules']['version'],
        'expected_snapshot_version':p['snapshot_version']})
    assert r.status_code==202
    run_id=r.json()['run_id']
    for _ in range(100):
        state=client.get('/multi-api/runs/'+run_id).json()
        if state['status']!='RUNNING':break
        time.sleep(.01)
    assert state['status']=='FAILED'
    assert client.get('/multi-api/runs/'+run_id+'/export').status_code==409


def test_partial_real_style_run_continues_after_proven_shortage_without_committing_failed_date():
    from multi_agent.contracts import Policy
    from datetime import timedelta
    from zoneinfo import ZoneInfo
    e=engine(7,policy=Policy(fairness_weight=0,preference_weight=0,continue_on_day_failure=True))
    missing=MON+timedelta(days=2)
    e.snapshot.availability=[w for w in e.snapshot.availability if w.start.astimezone(ZoneInfo(e.snapshot.timezone)).date()!=missing]
    result=e.run()
    assert result.status=='FAILED' and result.calendar is None
    assert str(missing) in {d['date'] for d in result.failed_days}
    assert missing not in e.accepted_dates and MON+timedelta(days=3) in e.accepted_dates
    assert len(e.history)==6
    assert len(result.validation.coverage)==168
    assert all(s.date!=missing for s in result.assignments)
    assert result.review.replacements==[]


def test_short_candidate_references_resolve_to_real_schedule_identity():
    e=engine(1);result=e.run()
    payload=next(p for a,p in e.provider.payloads if a=='daily')
    assert all(c['id'].startswith('C') and c['id'][1:].isdigit() for c in payload['candidates'])
    assert all(s.employee_id in {p.id for p in e.snapshot.employees} for s in result.assignments)
    assert all(not s.id.startswith('C') for s in result.assignments)


def test_incremental_llm_choices_commit_only_a_complete_validated_day():
    from multi_agent.contracts import Policy
    class Selecting(ScriptedProvider):
        def generate(self,a,p,s):
            if a=='daily' and p.get('interaction_mode')=='SELECT_ONE':
                earliest=p['remaining_deficits'][0]['start']
                options=[c for c in p['legal_candidates'] if c['start']<=earliest<c['end']]
                chosen=max(options,key=lambda c:(c['end'],c['rating'] or 0))
                return {'candidate_id':chosen['id'],'reason':'Test LLM transcript selection'},{}
            return super().generate(a,p,s)
    e=engine(3,provider=Selecting(),policy=Policy(fairness_weight=0,incremental_daily_selection=True))
    result=e.run()
    assert result.status=='DRAFT_VALIDATED'
    assert len(e.history)==3 and e.version==3
    assert len([e for e in e.events if e['kind']=='DAILY_CHOICE'])>3
    assert all(slot.difference==0 for slot in result.validation.coverage)
    assert result.review.replacements==[]


def test_combined_period_bound_counts_full_as_one_employee_covering_both_periods():
    from multi_agent.preflight import eligibility_bounds
    from multi_agent.domain import context_for
    from multi_agent.contracts import Policy
    e=engine(1)
    e.snapshot.employees=e.snapshot.employees[:6]
    known={p.id for p in e.snapshot.employees}
    e.snapshot.availability=[w for w in e.snapshot.availability if w.employee_id in known]
    full_role=next(p.role_code for p in e.rules.base_day.patterns if p.name=='Full')
    for person in e.snapshot.employees:person.qualified_roles.discard(full_role)
    context=context_for(e.rules,e.snapshot,e.start,e.end)
    bounds=eligibility_bounds(context,e.snapshot,e.rules,Policy(),[])
    assert any(x['code']=='COMBINED_PERIOD_STAFF_SHORTAGE' for x in bounds[0]['proven_slot_conflicts'])
    for person in e.snapshot.employees[:2]:person.qualified_roles.add(full_role)
    context=context_for(e.rules,e.snapshot,e.start,e.end)
    bounds=eligibility_bounds(context,e.snapshot,e.rules,Policy(),[])
    assert not bounds[0]['proven_slot_conflicts']
