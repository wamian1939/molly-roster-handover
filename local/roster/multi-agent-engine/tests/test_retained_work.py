from datetime import timedelta
from multi_agent.retained_work import retained_work_conflict
from multi_agent.contracts import Policy
from engine.models import ExistingShift
from test_engine import engine,MON


def test_retained_failed_date_work_counts_toward_weekly_limit_once():
    e=engine(1);e.run()
    full=next(s for s in e.shifts if s.pattern_name=='Full')
    tomorrow=MON+timedelta(days=1)
    extra=ExistingShift(employee_id=full.employee_id,store_id=full.store_id,source_shift_id='retained',status='DRAFT',role_code=full.role_code,start=full.start+timedelta(days=1),end=full.end+timedelta(days=1))
    original=e.snapshot.model_copy(update={'existing_shifts':[extra]})
    args=(original,e.rules,Policy(weekly_cap_minutes=1200),e.shifts,e.ledger,{MON},MON,tomorrow)
    assert retained_work_conflict(*args) is not None
    assert retained_work_conflict(original,e.rules,Policy(weekly_cap_minutes=1440),e.shifts,e.ledger,{MON},MON,tomorrow) is None
