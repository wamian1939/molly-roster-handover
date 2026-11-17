import json
import time
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from multi_agent import api
from multi_agent import roster_integration as integration
from multi_agent.contracts import Policy
from adapters.real import SourceAccessError
from test_engine import engine, MON
from scripted_provider import ScriptedProvider


@pytest.fixture
def setup(monkeypatch, tmp_path):
    e = engine(1)
    def access(store, cookie):
        if cookie != 'evaluate_molly_session=fixture-session' or store != e.rules.store_id:
            raise SourceAccessError('Store is outside access')
    def source(store, start, end, cookie):
        access(store, cookie)
        return e.rules, e.snapshot, {}
    monkeypatch.setattr(integration, 'require_access', access)
    monkeypatch.setattr(integration, 'real_inputs', source)
    monkeypatch.setattr(integration, 'default_policy', lambda *_: Policy(fairness_weight=0))
    monkeypatch.setattr(api, 'DATA', tmp_path)
    monkeypatch.setattr(api, 'runs', {})
    monkeypatch.setattr(api, 'AnthropicProvider', ScriptedProvider)
    return TestClient(api.app), e, tmp_path


def request_values(e):
    return {'store_id': e.rules.store_id, 'start_date': str(MON), 'end_date': str(MON), 'preserve_existing': True}


COOKIE = {'cookie': 'evaluate_molly_session=fixture-session'}


def test_real_inputs_are_store_scoped_and_exclude_fake_policy_overrides(setup):
    client, e, _ = setup
    assert client.get('/multi-api/roster/inputs', params=request_values(e)).status_code == 403
    preview = client.get('/multi-api/roster/inputs', params=request_values(e), headers=COOKIE)
    assert preview.status_code == 200
    assert preview.json()['policy']['fairness_weight'] == 0
    payload = {**request_values(e), 'expected_rule_version': e.rules.version, 'expected_snapshot_version': e.snapshot.version, 'policy': {}}
    assert client.post('/multi-api/roster/runs', json=payload, headers=COOKIE).status_code == 422


def test_stale_snapshot_rejected_before_launch(setup):
    client, e, folder = setup
    payload = {**request_values(e), 'expected_rule_version': e.rules.version, 'expected_snapshot_version': 'stale'}
    assert client.post('/multi-api/roster/runs', json=payload, headers=COOKIE).status_code == 409
    assert not list(folder.iterdir())


def test_rule_settings_use_scoped_authority_and_return_saved_versions(setup,monkeypatch):
    from multi_agent import source
    client,e,_=setup
    monkeypatch.setattr(source,'latest_rules',lambda store:e.rules)
    query={'store_id':e.rules.store_id,'week_start':str(MON)}
    assert client.get('/multi-api/roster/rules',params=query).status_code==403
    view=client.get('/multi-api/roster/rules',params=query,headers=COOKIE).json()
    body={'store_id':e.rules.store_id,'scope':'WEEK','week_start':str(MON),'expected_version':0,'base_rule_version':e.rules.version,'weekly':view['weekly']}
    response=client.post('/multi-api/roster/rules',json=body,headers=COOKIE)
    assert response.status_code==200,response.text
    assert response.json()['version']==1
    assert client.post('/multi-api/roster/rules',json=body,headers=COOKIE).status_code==409
    updated=client.get('/multi-api/roster/rules',params=query,headers=COOKIE).json()
    assert updated['effective_scope']=='WEEK' and updated['week_version']==1
    assert updated['base_rule_version']==e.rules.version


def test_session_store_scope_and_restart_recovery_with_independent_export(setup):
    client, e, folder = setup
    payload = {**request_values(e), 'expected_rule_version': e.rules.version, 'expected_snapshot_version': e.snapshot.version}
    response = client.post('/multi-api/roster/runs', json=payload, headers=COOKIE)
    assert response.status_code == 202
    run_id = response.json()['run_id']
    path = f'/multi-api/roster/runs/{run_id}'
    query = {'store_id': e.rules.store_id}
    for _ in range(100):
        state = client.get(path, params=query, headers=COOKIE)
        assert state.status_code == 200, state.text
        if state.json()['status'] != 'RUNNING': break
        time.sleep(.01)
    assert state.json()['status'] == 'DRAFT_VALIDATED', state.text
    assert state.json()['timezone'] == e.snapshot.timezone
    preview=state.json()['calendar_preview']
    assert preview['saved'] is False and preview['accepted_dates']==[str(MON)]
    assert len(preview['shifts'])==len(state.json()['result']['assignments'])
    assert all(s['agentPreview'] and s['id'].startswith('agent-preview:') for s in preview['shifts'])
    assert client.get(path, params=query, headers={'cookie': 'other-session'}).status_code == 403
    # A different otherwise-authorized session must not read this owner's state.
    original_owner = api.runs[run_id]['owner']
    api.runs[run_id]['owner'] = 'different-owner'
    assert client.get(path, params=query, headers=COOKIE).status_code == 404
    api.runs[run_id]['owner'] = original_owner
    api.runs.clear()
    restored = client.get(path, params=query, headers=COOKIE)
    assert restored.json()['result'] == state.json()['result']
    assert client.get(path + '/export', params=query, headers=COOKIE).status_code == 200
    saved = folder / run_id / 'result.json'
    bad = json.loads(saved.read_text(encoding='utf-8'))
    bad['assignments'][0]['employee_id'] = 'invented-person'
    saved.write_text(json.dumps(bad), encoding='utf-8')
    assert client.get(path + '/export', params=query, headers=COOKIE).status_code == 409
    # Invalid persisted candidates cannot be displayed as independently accepted previews.
    assert 'calendar_preview' not in client.get(path,params=query,headers=COOKIE).json()


def test_recent_calendar_run_is_store_and_owner_scoped(setup):
    from uuid import uuid4
    client,e,root=setup
    query={'store_id':e.rules.store_id}
    path='/multi-api/roster/runs-recent'
    assert client.get(path,params=query).status_code==403
    assert client.get(path,params=query,headers=COOKIE).json()=={'run':None}
    def save(owner,store,token):
        run_id=str(uuid4());folder=root/run_id;folder.mkdir()
        (folder/'session.json').write_text(json.dumps({'owner':owner,'store_id':store,'calendar_token':token,'start_date':str(MON),'end_date':str(MON)}),encoding='utf-8')
        return run_id
    own=api.owner(COOKIE['cookie'])
    save('different-owner',e.rules.store_id,'token')
    save(own,'different-store','token')
    save(own,e.rules.store_id,None)
    assert client.get(path,params=query,headers=COOKIE).json()=={'run':None}
    expected=save(own,e.rules.store_id,'calendar-token')
    assert client.get(path,params=query,headers=COOKIE).json()['run']['run_id']==expected


def test_failed_week_can_save_independently_validated_days_as_editable_drafts(setup,monkeypatch):
    client,e,root=setup
    example=engine(3)
    e.snapshot=example.snapshot.model_copy(update={'source':'REAL'})
    missing=MON+timedelta(days=1)
    from zoneinfo import ZoneInfo
    e.snapshot.availability=[a for a in e.snapshot.availability if a.start.astimezone(ZoneInfo(e.snapshot.timezone)).date()!=missing]
    roles={code:{'id':'roster-'+code,'storeId':e.rules.store_id,'code':code,'nameZh':code,'colorToken':'#334455','requiredSkillCodes':[]} for person in e.snapshot.employees for code in person.qualified_roles}
    monkeypatch.setattr(integration,'real_inputs',lambda *_:(e.rules,e.snapshot,roles))
    monkeypatch.setattr(integration,'default_policy',lambda *_:Policy(fairness_weight=0,continue_on_day_failure=True))
    payload={**request_values(e),'end_date':str(MON+timedelta(days=2)),'expected_rule_version':e.rules.version,'expected_snapshot_version':e.snapshot.version,'calendar_token':'calendar-token'}
    created=client.post('/multi-api/roster/runs',json=payload,headers=COOKIE)
    assert created.status_code==202,created.text
    run_id=created.json()['run_id'];path=f'/multi-api/roster/runs/{run_id}'
    query={'store_id':e.rules.store_id}
    for _ in range(100):
        state=client.get(path,params=query,headers=COOKIE)
        assert state.status_code==200,state.text
        if state.json()['status']!='RUNNING':break
        time.sleep(.01)
    assert state.json()['status']=='FAILED'
    assert client.post(path+'/apply-payload',params=query,json={},headers=COOKIE).status_code==409
    response=client.post(path+'/apply-payload',params=query,json={'allow_partial':True},headers=COOKIE)
    assert response.status_code==200,response.text
    value=response.json()
    assert value['mode']=='PARTIAL_DRAFT' and value['result']['status']=='FAILED'
    assert value['result']['validation']['valid'] is False
    assert value['daily_validation']=={'valid':True,'validated_dates':[str(MON),str(MON+timedelta(days=2))],'shortfall_dates':[]}
    assert {s['date'] for s in value['result']['calendar']['shifts']}==set(value['accepted_dates'])
    assert value['result']['calendar']['publishable'] is False
    assert client.get(path+'/export',params=query,headers=COOKIE).status_code==409
    persisted=json.loads((root/run_id/'result.json').read_text(encoding='utf-8'))
    assert persisted['status']=='FAILED' and persisted['calendar'] is None
    role_file=root/run_id/'roles.json'
    role_file.write_text('{}',encoding='utf-8')
    assert client.post(path+'/apply-payload',params=query,json={'allow_partial':True},headers=COOKIE).status_code==409
    role_file.write_text(json.dumps(roles),encoding='utf-8')
    e.snapshot=e.snapshot.model_copy(update={'version':'changed-source'})
    assert client.post(path+'/apply-payload',params=query,json={'allow_partial':True},headers=COOKIE).status_code==409


def test_best_effort_save_includes_shifts_on_incomplete_dates_and_cannot_hide_unsafe_work(setup,monkeypatch):
    from test_best_effort import Selecting,policy
    client,e,root=setup
    e.snapshot=e.snapshot.model_copy(update={'source':'REAL'})
    ids={p.id for p in e.snapshot.employees[:2]}
    e.snapshot.availability=[w for w in e.snapshot.availability if w.employee_id in ids]
    roles={code:{'id':'role-'+code,'storeId':e.rules.store_id,'code':code,'nameZh':code,'colorToken':'#334455','requiredSkillCodes':[]} for p in e.snapshot.employees for code in p.qualified_roles}
    monkeypatch.setattr(integration,'real_inputs',lambda *_:(e.rules,e.snapshot,roles))
    monkeypatch.setattr(integration,'default_policy',lambda *_:policy())
    monkeypatch.setattr(api,'AnthropicProvider',Selecting)
    response=client.post('/multi-api/roster/runs',headers=COOKIE,json={**request_values(e),'expected_rule_version':e.rules.version,'expected_snapshot_version':e.snapshot.version,'calendar_token':'token'})
    assert response.status_code==202,response.text
    run_id=response.json()['run_id'];path=f'/multi-api/roster/runs/{run_id}';query={'store_id':e.rules.store_id}
    for _ in range(100):
        state=client.get(path,params=query,headers=COOKIE)
        assert state.status_code==200,state.text
        if state.json()['status']!='RUNNING':break
        time.sleep(.01)
    assert state.json()['result']['incomplete_dates']==[str(MON)]
    assert len(state.json()['result']['calendar']['shifts'])==2
    assert len(state.json()['calendar_preview']['shifts'])==2
    saved=client.post(path+'/apply-payload',params=query,headers=COOKIE,json={'allow_partial':True})
    assert saved.status_code==200,saved.text
    assert saved.json()['daily_validation']=={'valid':True,'validated_dates':[str(MON)],'shortfall_dates':[str(MON)]}
    assert len(saved.json()['result']['calendar']['shifts'])==2
    assert saved.json()['result']['validation']['valid'] is False
    assert client.get(path+'/export',params=query,headers=COOKIE).status_code==409
    # An explicit shortage cannot excuse corrupted assignments or a stale ledger.
    api.runs.clear()
    result_file=root/run_id/'result.json';bad=json.loads(result_file.read_text(encoding='utf-8'))
    bad['assignments'][0]['employee_id']='unknown-employee'
    result_file.write_text(json.dumps(bad),encoding='utf-8')
    assert client.post(path+'/apply-payload',params=query,headers=COOKIE,json={'allow_partial':True}).status_code==409


def test_editable_target_shifts_detach_regardless_of_legacy_publication_status(setup):
    from engine.models import ExistingShift
    from engine.clock import local_instant, timezone_for
    client, e, _ = setup
    person = e.snapshot.employees[0]
    zone = timezone_for(e.rules.timezone)
    for day, status in [(MON, 'PUBLISHED'), (MON, 'DRAFT'), (MON, 'LOCKED'), (MON + timedelta(days=1), 'PUBLISHED')]:
        e.snapshot.existing_shifts.append(ExistingShift(employee_id=person.id, store_id=e.rules.store_id, source_shift_id=str(len(e.snapshot.existing_shifts)), status=status, role_code='full', start=local_instant(day,'10:00',zone), end=local_instant(day,'22:00',zone)))
    values = {**request_values(e), 'preserve_existing': False}
    preview = client.get('/multi-api/roster/inputs', params=values, headers=COOKIE)
    assert preview.status_code == 200, preview.text
    assert preview.json()['detached_existing_count'] == 2
    assert preview.json()['scheduling_mode']=='REPLAN_EDITABLE'
    assert preview.json()['existing_shift_count'] == 2
    assert len(e.snapshot.existing_shifts) == 4
    defaults={k:v for k,v in values.items() if k!='preserve_existing'}
    default_preview=client.get('/multi-api/roster/inputs',params=defaults,headers=COOKIE)
    assert default_preview.status_code==200
    assert default_preview.json()['preserve_existing'] is False
    assert default_preview.json()['detached_existing_count']==2


def test_worker_exception_does_not_leave_running_forever(setup, monkeypatch):
    client, e, _ = setup
    def broken(*args, **kwargs): raise RuntimeError('provider token=secret')
    monkeypatch.setattr(api, 'Orchestrator', broken)
    payload = {**request_values(e), 'expected_rule_version': e.rules.version, 'expected_snapshot_version': e.snapshot.version}
    run_id = client.post('/multi-api/roster/runs', json=payload, headers=COOKIE).json()['run_id']
    for _ in range(100):
        state = client.get(f'/multi-api/roster/runs/{run_id}', params={'store_id': e.rules.store_id}, headers=COOKIE).json()
        if state['status'] != 'RUNNING': break
        time.sleep(.01)
    assert state['status'] == 'FAILED'
    assert 'secret' not in json.dumps(state)
