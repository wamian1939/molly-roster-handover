from datetime import timedelta
from engine.models import ExistingShift
from engine.clock import local_instant, timezone_for
from multi_agent.working_snapshot import replan_snapshot
from multi_agent.domain import fixed_shifts, ledger_for
from test_engine import engine, MON


def test_publication_is_not_an_edit_lock_and_original_calendar_is_untouched():
    e=engine(1)
    zone=timezone_for(e.snapshot.timezone)
    person=e.snapshot.employees[0]
    for store,day,status in [(e.snapshot.store_id,MON,'DRAFT'),(e.snapshot.store_id,MON,'PUBLISHED'),
        (e.snapshot.store_id,MON,'LOCKED'),(e.snapshot.store_id,MON+timedelta(days=1),'DRAFT'),('other-store',MON,'PUBLISHED')]:
        e.snapshot.existing_shifts.append(ExistingShift(employee_id=person.id,store_id=store,status=status,
            source_shift_id=str(len(e.snapshot.existing_shifts)),role_code='full',
            start=local_instant(day,'10:00',zone),end=local_instant(day,'22:00',zone)))
    original=e.snapshot.model_dump_json()
    working,count=replan_snapshot(e.snapshot,MON,MON)
    assert count==2
    assert {s.source_shift_id for s in working.existing_shifts}=={'2','3','4'}
    assert e.snapshot.model_dump_json()==original
    assert '|multi-agent-replan:' in working.version
    assert len(fixed_shifts(working,MON,MON))==1


def test_existing_calendar_hours_are_not_double_counted_in_a_fresh_candidate():
    e=engine(1);e.run()
    accepted=e.shifts[0]
    person=next(p for p in e.snapshot.employees if p.id==accepted.employee_id)
    for status in ['DRAFT','PUBLISHED']:
        snapshot=e.snapshot.model_copy(deep=True)
        snapshot.existing_shifts=[ExistingShift(employee_id=person.id,store_id=snapshot.store_id,status=status,
            source_shift_id='editable-current',role_code=accepted.role_code,start=accepted.start,end=accepted.end)]
        working,_=replan_snapshot(snapshot,MON,MON)
        ledger=ledger_for(working,e.rules,e.policy,[accepted],MON,MON,1)
        row=next(r for r in ledger.employees if r.employee_id==person.id)
        assert row.shift_count==1
        assert row.total_scheduled_minutes==int((accepted.end-accepted.start).total_seconds()/60)
