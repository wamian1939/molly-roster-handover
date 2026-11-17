from datetime import timedelta
from multi_agent.preflight import eligibility_bounds, group_conflicts
from multi_agent.domain import context_for, fixed_shifts
from multi_agent.contracts import Policy
from engine.models import ExistingShift
from engine.clock import local_instant, timezone_for
from adapters.reference import comparison_snapshot
from test_engine import engine, MON


def test_contiguous_fixed_excess_slots_are_one_explanation_not_employee_conflicts():
    e=engine(1)
    zone=timezone_for(e.rules.timezone)
    for person in e.snapshot.employees[:6]:
        e.snapshot.existing_shifts.append(ExistingShift(employee_id=person.id,store_id=e.rules.store_id,
            source_shift_id=person.id,status='PUBLISHED',role_code='full',
            start=local_instant(MON,'10:00',zone),end=local_instant(MON,'22:00',zone)))
    policy=Policy(fairness_weight=0)
    context=context_for(e.rules,e.snapshot,MON,MON,policy)
    preserve=eligibility_bounds(context,e.snapshot,e.rules,policy,fixed_shifts(e.snapshot,MON,MON))[0]
    assert len(preserve['proven_slot_conflicts'])==24
    assert {c['code'] for c in preserve['proven_slot_conflicts']}=={'FIXED_EXACT_EXCESS'}
    assert len(preserve['conflict_groups'])==2
    assert sum(c['slot_count'] for c in preserve['conflict_groups'])==24
    assert preserve['conflict_groups'][0]['required']==3
    assert len(preserve['conflict_groups'][0]['fixed_employee_ids'])==6
    detached,removed=comparison_snapshot(e.snapshot,MON,MON)
    fresh=eligibility_bounds(context_for(e.rules,detached,MON,MON,policy),detached,e.rules,policy,[])[0]
    assert removed==6 and not fresh['proven_slot_conflicts']
    assert len(e.snapshot.existing_shifts)==6


def test_slot_groups_do_not_merge_changed_people_or_noncontiguous_intervals():
    base={'code':'ELIGIBILITY_SHORTAGE','required':4,'eligible_employee_ids':['a','b','c'],
          'fixed_employee_ids':[],'available_employee_ids':['a','b','c']}
    a={**base,'start':'2026-10-28T00:00:00Z','end':'2026-10-28T00:30:00Z'}
    b={**base,'start':a['end'],'end':'2026-10-28T01:00:00Z'}
    c={**base,'start':b['end'],'end':'2026-10-28T01:30:00Z','eligible_employee_ids':['a','b','d']}
    d={**base,'start':'2026-10-28T02:00:00Z','end':'2026-10-28T02:30:00Z'}
    groups=group_conflicts([a,b,c,d])
    assert len(groups)==3 and groups[0]['slot_count']==2
    assert a['end']!=groups[0]['end'] # Original validator findings remain untouched.


def test_real_availability_shortage_remains_when_published_shifts_are_detached():
    e=engine(1)
    keep={p.id for p in e.snapshot.employees[:3]}
    e.snapshot.availability=[w for w in e.snapshot.availability if w.employee_id in keep]
    day=eligibility_bounds(e.context or context_for(e.rules,e.snapshot,MON,MON),e.snapshot,e.rules,e.policy,[])[0]
    assert any(c['code']=='ELIGIBILITY_SHORTAGE' for c in day['conflict_groups'])
    assert not any(c['code']=='COMBINED_PERIOD_STAFF_SHORTAGE' for c in day['conflict_groups'])
    for c in day['conflict_groups']:
        if c['code']=='ELIGIBILITY_SHORTAGE':
            assert len(c['available_employee_ids'])==3
            assert len(c['eligible_employee_ids'])<=3
