import json
from pathlib import Path
from datetime import timedelta

import pytest
from pydantic import ValidationError as SchemaError

from multi_agent.contracts import Policy,BusinessRuleSet
from multi_agent.business import available_minutes,rating_targets,business_report,target_progress,target_selection_term
from multi_agent.domain import context_for,ledger_for,candidates_for
from multi_agent.preflight import eligibility_bounds
from multi_agent.validator import validate
from engine.models import TimeWindow
from test_engine import engine,MON
from scripted_provider import ScriptedProvider


def policy_for(e,employee_id=None,weekdays=None):
    raw=json.loads((Path(__file__).resolve().parents[1]/'configs/hurstville-business-v1.json').read_text(encoding='utf-8'))
    raw.update(store_id=e.rules.store_id,base_rule_version=e.rules.version)
    raw['mandatory_coverage']=([{'employee_id':employee_id,'weekdays':weekdays if weekdays is not None else [1,3],
        'start':'17:00','end':'22:00','label':'Mandatory evening coverage'}] if employee_id else [])
    return Policy(fairness_weight=0,preference_weight=0,business_rules=BusinessRuleSet.model_validate(raw))


def test_target_percentages_are_based_on_actual_available_hours_and_official_scores():
    e=engine(7);policy=policy_for(e)
    rows=rating_targets(e.snapshot,policy,e.start,e.end)
    top=rows[e.snapshot.employees[0].id]
    assert top['available_minutes']==84*60 and top['target_fraction']==.8
    assert top['target_scheduled_minutes']==4032
    for person,score,fraction in [(e.snapshot.employees[1],89.4,.75),(e.snapshot.employees[2],80.3,.7),
                                   (e.snapshot.employees[3],49,.35)]:
        person.score=score
        row=rating_targets(e.snapshot,policy,e.start,e.end)[person.id]
        assert row['target_fraction']==fraction
        assert row['target_scheduled_minutes']==int(84*60*fraction)


def test_top_score_ties_unknown_scores_and_zero_availability():
    e=engine(1);policy=policy_for(e)
    e.snapshot.employees[1].score=e.snapshot.employees[0].score
    e.snapshot.employees[2].score=None
    zero=e.snapshot.employees[3].id
    e.snapshot.availability=[w for w in e.snapshot.availability if w.employee_id!=zero]
    rows=rating_targets(e.snapshot,policy,e.start,e.end)
    assert rows[e.snapshot.employees[1].id]['target_fraction']==.8
    assert rows[e.snapshot.employees[2].id]['target_scheduled_minutes'] is None
    assert rows[zero]['available_minutes']==0 and rows[zero]['target_scheduled_minutes']==0


def test_target_basis_merges_windows_clips_date_range_and_subtracts_leave():
    e=engine(1);p=e.snapshot.employees[0]
    window=next(w for w in e.snapshot.availability if w.employee_id==p.id)
    e.snapshot.availability=[TimeWindow(employee_id=p.id,start=window.start-timedelta(hours=12),end=window.end),
        TimeWindow(employee_id=p.id,start=window.start,end=window.end+timedelta(days=1))]
    e.snapshot.approved_leave=[TimeWindow(employee_id=p.id,start=window.start+timedelta(hours=2),end=window.start+timedelta(hours=4))]
    # The union covers the entire requested local day, not 2 duplicate windows or the next day.
    assert available_minutes(e.snapshot,p.id,e.start,e.end)==22*60


def test_soft_targets_do_not_invalidate_necessary_coverage():
    e=engine(1);r=e.run();policy=policy_for(e)
    assert validate(e.context,e.snapshot,e.rules,policy,e.shifts).valid
    ledger=ledger_for(e.snapshot,e.rules,policy,e.shifts,e.start,e.end,e.version)
    full=next(s for s in e.shifts if s.pattern_name=='Full')
    row=next(r for r in ledger.employees if r.employee_id==full.employee_id)
    assert row.target_excess_minutes>0 and row.total_scheduled_minutes==720
    assert row.total_paid_minutes is None


def test_target_progress_changes_priority_without_equal_hours_fairness():
    e=engine(1);policy=policy_for(e)
    target={'target_scheduled_minutes':600}
    fresh=target_progress(target,0);fulfilled=target_progress(target,600)
    assert target_selection_term(fresh,300,policy)>target_selection_term(fulfilled,300,policy)
    assert policy.fairness_weight==0
    assert target_selection_term(fresh,600,policy)>target_selection_term(fresh,300,policy)


def test_business_rule_scope_and_employee_identity_fail_closed():
    e=engine(1);policy=policy_for(e,employee_id='not-in-snapshot',weekdays=[0])
    with pytest.raises(ValueError,match='unknown employees'):context_for(e.rules,e.snapshot,e.start,e.end,policy)
    policy=policy_for(e)
    wrong=policy.model_copy(update={'business_rules':policy.business_rules.model_copy(update={'store_id':'other-store'})})
    with pytest.raises(ValueError,match='store'):context_for(e.rules,e.snapshot,e.start,e.end,wrong)
    wrong=policy.model_copy(update={'business_rules':policy.business_rules.model_copy(update={'base_rule_version':'obsolete'})})
    with pytest.raises(ValueError,match='version'):context_for(e.rules,e.snapshot,e.start,e.end,wrong)


def test_rule_manifest_hash_and_schema_include_business_rules():
    e=engine(1);a=context_for(e.rules,e.snapshot,e.start,e.end);policy=policy_for(e)
    b=context_for(e.rules,e.snapshot,e.start,e.end,policy)
    assert a.source_hash!=b.source_hash
    assert b.business_rule_version==policy.business_rules.version
    assert len(b.rating_hour_targets)==len(e.snapshot.employees)


def test_mandatory_full_satisfies_tuesday_and_thursday_in_one_shift_each():
    e=engine(7);e.run()
    person=next(s.employee_id for s in e.shifts if s.date==MON+timedelta(days=1) and s.pattern_name=='Full')
    policy=policy_for(e,person)
    # Score-based test transcript with fairness=1 can rotate Full employees across days; replace only rule days' selected employee.
    for weekday in [1,3]:
        day=MON+timedelta(days=weekday)
        full=next(s for s in e.shifts if s.date==day and s.pattern_name=='Full')
        if full.employee_id!=person:
            other=next((s for s in e.shifts if s.date==day and s.employee_id==person),None)
            e.shifts=[s.model_copy(update={'employee_id':full.employee_id}) if other and s.id==other.id else
                      s.model_copy(update={'employee_id':person}) if s.id==full.id else s for s in e.shifts]
    report=validate(e.context,e.snapshot,e.rules,policy,e.shifts)
    assert report.valid,report.errors
    business=business_report(e.snapshot,e.rules,policy,e.start,e.end,e.shifts)
    assert len(business['mandatory_coverage'])==2
    assert all(r['satisfied'] for r in business['mandatory_coverage'])
    assert all(r['shifts'][0]['pattern_name']=='Full' for r in business['mandatory_coverage'])


def test_early_shift_ending_at_17_does_not_satisfy_evening_requirement():
    e=engine(1);e.run()
    early=next(s for s in e.shifts if s.pattern_name=='Early')
    policy=policy_for(e,early.employee_id,weekdays=[0])
    report=validate(e.context,e.snapshot,e.rules,policy,e.shifts)
    assert 'MANDATORY_COVERAGE' in {error.code for error in report.errors}


def test_mandatory_employee_availability_cannot_be_overridden():
    e=engine(1);person=e.snapshot.employees[0]
    policy=policy_for(e,person.id,weekdays=[0])
    e.snapshot.availability=[w.model_copy(update={'end':w.end-timedelta(hours=5)}) if w.employee_id==person.id else w
        for w in e.snapshot.availability]
    context=context_for(e.rules,e.snapshot,e.start,e.end,policy)
    bounds=eligibility_bounds(context,e.snapshot,e.rules,policy,[])
    assert 'MANDATORY_EMPLOYEE_UNAVAILABLE' in {x['code'] for x in bounds[0]['proven_slot_conflicts']}


def test_mandatory_candidates_preserve_qualifications_and_full_is_optional():
    e=engine(1);person=e.snapshot.employees[0]
    full_role=next(p.role_code for p in e.rules.base_day.patterns if p.name=='Full')
    person.qualified_roles.discard(full_role)
    policy=policy_for(e,person.id,weekdays=[0])
    candidates=candidates_for(e.start,e.rules,e.snapshot,e.ledger,policy)
    own=[c for c in candidates if c.employee_id==person.id]
    assert own and all(c.pattern_name=='Late' for c in own)
    report=business_report(e.snapshot,e.rules,policy,e.start,e.end,[])
    row=next(r for r in report['rows'] if r['employee_id']==person.id)
    assert row['maximum_candidate_minutes']==360
    assert row['target_exceeds_individual_capacity'] is True


def test_incremental_agent_must_choose_mandatory_employee_first():
    class Choosing(ScriptedProvider):
        def generate(self,a,p,s):
            if a=='daily' and p.get('interaction_mode')=='SELECT_ONE':
                self.payloads.append((a,p))
                earliest=p['remaining_deficits'][0]['start']
                candidates=p['legal_candidates']
                if not p['mandatory_pending']:candidates=[c for c in candidates if c['start']<=earliest<c['end']]
                chosen=max(candidates,key=lambda c:(c['end'],c['selection_priority']))
                return {'candidate_id':chosen['id'],'reason':'Transcript selects legal mandatory interval before optional staffing'},{}
            return super().generate(a,p,s)
    provider=Choosing();e=engine(3,provider=provider)
    person=e.snapshot.employees[4]
    e.policy=policy_for(e,person.id,weekdays=[1]).model_copy(update={'incremental_daily_selection':True})
    e.ledger=ledger_for(e.snapshot,e.rules,e.policy,[],e.start,e.end,0)
    result=e.run()
    assert result.status=='DRAFT_VALIDATED',result.validation.errors
    first=next(p for a,p in provider.payloads if a=='daily' and p['date']==str(MON+timedelta(days=1)))
    assert first['mandatory_pending']
    assert {c['employee_id'] for c in first['legal_candidates']}=={person.id}
    assert all('target_scheduled_minutes' in c for c in first['legal_candidates'])
    assert result.business_rule_report['mandatory_coverage'][0]['satisfied']


def test_invalid_rating_bands_are_rejected():
    e=engine(1);policy=policy_for(e)
    raw=policy.business_rules.model_dump()
    raw['rating_hours']['bands'][0]['fraction']=.95
    with pytest.raises(SchemaError):BusinessRuleSet.model_validate(raw)
