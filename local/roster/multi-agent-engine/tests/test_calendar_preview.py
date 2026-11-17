from multi_agent.calendar_preview import calendar_preview
from test_engine import engine,MON


def test_preview_only_contains_accepted_dates_and_never_invents_real_roles():
    e=engine(3);e.run()
    preview=calendar_preview('run',e.snapshot,{},e.shifts,MON,e.end,False,3,{MON})
    assert preview['saved'] is False and preview['version']==3
    monday=[s for s in e.shifts if s.date==MON]
    assert len(preview['shifts'])==len(monday)
    assert {s['date'] for s in preview['shifts']}=={str(MON)}
    assert all(s['agentPreview'] for s in preview['shifts'])
    fixed=monday[0].model_copy(update={'fixed':True,'source_shift_id':'saved-id'})
    preserved=calendar_preview('run',e.snapshot,{},[fixed]+monday[1:],MON,MON,True,1,{MON})
    assert preserved['preserved_shift_ids']==['saved-id']
    assert len(preserved['shifts'])==len(monday)-1
    e.snapshot=e.snapshot.model_copy(update={'source':'REAL'})
    missing=calendar_preview('run',e.snapshot,{},monday,MON,MON,False,1,{MON})
    assert missing['shifts']==[]
