from datetime import timedelta
from zoneinfo import ZoneInfo
from multi_agent.contracts import Policy
from multi_agent.validator import validate
from test_engine import engine,MON
from scripted_provider import ScriptedProvider


class Selecting(ScriptedProvider):
    def generate(self,agent,payload,schema):
        if agent=='daily' and payload.get('interaction_mode')=='SELECT_ONE':
            self.payloads.append((agent,payload))
            chosen=max(payload['legal_candidates'],key=lambda c:(c['coverage_gain_minutes'],c['selection_priority']))
            return {'candidate_id':chosen['id'],'reason':'Test transcript maximizes marginal coverage among legal options'},{}
        return super().generate(agent,payload,schema)


def policy(**extra):
    return Policy(fairness_weight=0,preference_weight=0,best_effort=True,continue_on_day_failure=True,
        incremental_daily_selection=True,max_repairs=1,**extra)


def test_shortage_day_keeps_legal_shifts_updates_hours_and_continues_next_day():
    e=engine(3,provider=Selecting(),policy=policy())
    missing=MON+timedelta(days=1)
    ids={p.id for p in e.snapshot.employees[:2]}
    zone=ZoneInfo(e.snapshot.timezone)
    e.snapshot.availability=[w for w in e.snapshot.availability if w.start.astimezone(zone).date()!=missing or w.employee_id in ids]
    result=e.run()
    assert result.status=='FAILED' and result.validation.valid is False
    assert result.incomplete_dates==[missing]
    assert result.calendar is not None and result.publishable is False
    partial=[s for s in result.assignments if s.date==missing]
    assert len(partial)==2 and all(s.pattern_name=='Full' for s in partial)
    assert len(e.history)==3 and MON+timedelta(days=2) in e.accepted_dates
    assert all(s.difference<=0 for s in result.validation.coverage)
    assert validate(result.context,e.snapshot,e.rules,e.policy,result.assignments,ledger=result.ledger,shortfall_dates={missing}).valid
    tuesday=e.history[1]['ledger']
    wednesday=next(p for a,p in e.provider.payloads if a=='daily' and p['date']==str(MON+timedelta(days=2)))
    assert {r['employee_id']:r['scheduled_minutes'] for r in wednesday['ledger']}=={r['employee_id']:r['total_scheduled_minutes'] for r in tuesday['employees']}
    row=next(d for d in result.failed_days if d['date']==str(missing))
    assert row['reason']=='BEST_EFFORT_INCOMPLETE' and row['scheduled_shift_count']==2
    assert any(s['difference']<0 for s in row['coverage'])
    assert {a for a,_ in e.provider.payloads}=={'requirement','daily','review','audit'}


def test_unfillable_opening_does_not_prevent_filling_the_evening():
    e=engine(1,provider=Selecting(),policy=policy())
    e.snapshot.availability=[w.model_copy(update={'start':w.start+timedelta(hours=7)}) for w in e.snapshot.availability]
    result=e.run()
    assert result.incomplete_dates==[MON]
    assert len(result.assignments)==4 and all(s.pattern_name=='Late' for s in result.assignments)
    evening=[s for s in result.validation.coverage if s.start.astimezone(ZoneInfo(e.snapshot.timezone)).hour>=17]
    assert evening and all(s.difference==0 for s in evening)
    assert any(s.difference<0 for s in result.validation.coverage)


def test_best_legal_attempt_is_retained_when_later_attempts_fail():
    class LaterFailure(Selecting):
        def generate(self,a,p,s):
            if a=='daily' and p.get('previous_attempt_feedback'):
                raise RuntimeError('Test later attempt unavailable')
            return super().generate(a,p,s)
    e=engine(1,provider=LaterFailure(),policy=policy())
    e.snapshot.employees=e.snapshot.employees[:6]
    ids={p.id for p in e.snapshot.employees}
    e.snapshot.availability=[w for w in e.snapshot.availability if w.employee_id in ids]
    full_role=next(p.role_code for p in e.rules.base_day.patterns if p.name=='Full')
    for p in e.snapshot.employees:p.qualified_roles.discard(full_role)
    result=e.run()
    assert len(result.assignments)==6
    assert result.incomplete_dates==[MON]
    assert all(s.pattern_name!='Full' for s in result.assignments)
    assert validate(result.context,e.snapshot,e.rules,e.policy,result.assignments,ledger=result.ledger,shortfall_dates={MON}).valid


def test_best_effort_does_not_relax_individual_caps_or_invalid_assignments():
    e=engine(1,provider=Selecting(),policy=policy(daily_cap_minutes=300))
    result=e.run()
    assert result.assignments and result.incomplete_dates==[MON]
    assert all((s.end-s.start).total_seconds()/60<=300 for s in result.assignments)
    safe=validate(result.context,e.snapshot,e.rules,e.policy,result.assignments,shortfall_dates={MON})
    assert safe.valid
    bad=[result.assignments[0].model_copy(update={'employee_id':'unknown'})]+result.assignments[1:]
    assert not validate(result.context,e.snapshot,e.rules,e.policy,bad,shortfall_dates={MON}).valid
    duplicate=result.assignments+[result.assignments[0].model_copy(update={'id':'duplicate'})]
    assert not validate(result.context,e.snapshot,e.rules,e.policy,duplicate,shortfall_dates={MON}).valid


def test_zero_available_people_produces_an_explicit_empty_incomplete_day():
    e=engine(1,provider=Selecting(),policy=policy())
    e.snapshot.availability=[]
    result=e.run()
    assert result.status=='FAILED' and result.calendar['shifts']==[]
    assert result.incomplete_dates==[MON] and result.assignments==[]
    assert len(e.history)==1
    assert all(s.scheduled==0 and s.difference==-s.required for s in result.validation.coverage)
    assert result.failed_days[0]['scheduled_shift_count']==0
