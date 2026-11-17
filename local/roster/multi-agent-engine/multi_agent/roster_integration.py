"""Authenticated integration for the main Roster UI. No formal shift writes."""
import json
from datetime import date,timedelta
from pathlib import Path
from uuid import UUID, uuid4
from fastapi import Header, HTTPException
from pydantic import BaseModel, ConfigDict
from .contracts import BusinessRuleSet, Policy, FinalSchedule, ScheduledShift
from .domain import context_for, fixed_shifts
from .preflight import eligibility_bounds
from .source import real_inputs, require_access
from .validator import validate, validate_calendar
from adapters.real import SourceReadError
from .working_snapshot import replan_snapshot
from . import rule_settings
from engine.models import RuleSet, Snapshot


class RosterRun(BaseModel):
    model_config = ConfigDict(extra="forbid")
    store_id: str
    start_date: date
    end_date: date
    preserve_existing: bool = False
    expected_rule_version: str
    expected_snapshot_version: str
    calendar_token: str | None = None


class CalendarApply(BaseModel):
    model_config=ConfigDict(extra='forbid')
    allow_partial:bool=False


def default_policy(api, rules):
    path = api.ROOT / 'configs' / f'{rules.store_id}-business-v1.json'
    business = BusinessRuleSet.model_validate_json(path.read_text(encoding='utf-8')) if path.is_file() else None
    return Policy(fairness_weight=0, preference_weight=0, continue_on_day_failure=True,
                  incremental_daily_selection=True, best_effort=True, business_rules=business)


def prepare(api, store, start, end, cookie, preserve):
    rules, original, roles = real_inputs(store, start, end, cookie)
    policy = default_policy(api, rules)
    from .business import validate_scope
    validate_scope(rules,original,policy)
    rules,_=rule_settings.effective(api.DATA,rules,start-timedelta(days=start.weekday()))
    if policy.business_rules:
        policy=policy.model_copy(update={'business_rules':policy.business_rules.model_copy(update={'base_rule_version':rules.version})})
    snapshot, removed = (original, 0) if preserve else replan_snapshot(original, start, end)
    context = context_for(rules, snapshot, start, end, policy)
    return rules, original, snapshot, roles, policy, context, removed


def visible_events(folder):
    events = []
    if (folder / 'events.jsonl').is_file():
        for line in (folder / 'events.jsonl').read_text(encoding='utf-8').splitlines():
            try:
                e = json.loads(line)
                events.append({k: v for k, v in e.items() if k not in {'input', 'output', 'context'}})
            except json.JSONDecodeError:
                pass
    return events


def register(app):
    from . import api

    def base_rules(store,cookie):
        from .source import latest_rules
        try:
            require_access(store,cookie)
            base=latest_rules(store)
            if not base:raise ValueError('该门店尚未确认基础 RuleSet')
            return base
        except (ValueError,SourceReadError) as error:raise api.source_error(error)

    @app.get('/multi-api/roster/rules')
    def rules_view(store_id:str,week_start:date,cookie:str|None=Header(default=None)):
        try:
            base=base_rules(store_id,cookie)
            _,settings=rule_settings.effective(api.DATA,base,week_start,allow_stale=True)
            policy=default_policy(api,base)
            return {**settings,'business_rules':policy.business_rules.model_dump(mode='json') if policy.business_rules else None,
                    'timezone':base.timezone,'patterns':[p.model_dump(mode='json') for p in base.base_day.patterns]}
        except (ValueError,SourceReadError) as error:raise api.source_error(error)

    @app.post('/multi-api/roster/rules')
    def save_rules(payload:rule_settings.RuleSettings,cookie:str|None=Header(default=None)):
        try:
            base=base_rules(payload.store_id,cookie)
            version=rule_settings.save(api.DATA,base,payload,api.owner(cookie))
            return {'saved':True,'version':version,'scope':payload.scope,'store_id':payload.store_id}
        except RuntimeError as error:raise HTTPException(409,str(error))
        except (ValueError,SourceReadError) as error:raise api.source_error(error)

    @app.get('/multi-api/roster/health')
    def health(cookie: str | None = Header(default=None)):
        if not cookie:
            raise HTTPException(401, '请先登录')
        from .source import accessible_stores
        try:
            accessible_stores(cookie)
        except SourceReadError as error:
            raise api.source_error(error)
        return api.health()

    @app.get('/multi-api/roster/inputs')
    def preview(store_id: str, start_date: date, end_date: date, preserve_existing: bool = False, cookie: str | None = Header(default=None)):
        try:
            rules, _, snapshot, roles, policy, context, removed = prepare(api, store_id, start_date, end_date, cookie, preserve_existing)
            return {'rules': rules.model_dump(mode='json'), 'context': context.model_dump(mode='json'),
                    'snapshot_version': snapshot.version, 'source': 'REAL', 'policy': policy.model_dump(mode='json'),
                    'employees': [e.model_dump(mode='json') for e in snapshot.employees],
                    'availability_count': len(snapshot.availability), 'existing_shift_count': len(snapshot.existing_shifts),
                    'detached_existing_count': removed, 'preserve_existing': preserve_existing,
                    'scheduling_mode': 'PRESERVE_EXISTING' if preserve_existing else 'REPLAN_EDITABLE',
                    'rating_source': 'Evaluate latest valid CLOSED aggregate',
                    'source_diagnostics': eligibility_bounds(context, snapshot, rules, policy, fixed_shifts(snapshot, start_date, end_date))}
        except (ValueError, SourceReadError) as error:
            raise api.source_error(error)

    @app.post('/multi-api/roster/runs', status_code=202)
    def create(payload: RosterRun, cookie: str | None = Header(default=None)):
        try:
            rules, original, snapshot, roles, policy, context, removed = prepare(api, payload.store_id, payload.start_date, payload.end_date, cookie, payload.preserve_existing)
            if rules.version != payload.expected_rule_version or snapshot.version != payload.expected_snapshot_version:
                raise HTTPException(409, '规则或员工报班数据已变化，请重新读取输入')
            provider = api.AnthropicProvider()
        except (ValueError, SourceReadError) as error:
            raise api.source_error(error)
        run_id = str(uuid4())
        folder = api.DATA / run_id
        with api.guard:
            if any(r['owner'] == api.owner(cookie) and r['status'] == 'RUNNING' for r in api.runs.values()):
                raise HTTPException(409, '当前登录已有排班任务在运行')
            folder.mkdir(parents=True)
            metadata = {'owner': api.owner(cookie), 'store_id': payload.store_id, 'start_date': str(payload.start_date), 'end_date': str(payload.end_date), 'preserve_existing': payload.preserve_existing,
                        'detached_existing_count': removed, 'scheduling_mode': 'PRESERVE_EXISTING' if payload.preserve_existing else 'REPLAN_EDITABLE',
                        'calendar_token':payload.calendar_token}
            for name, value in [('snapshot-original.json', original), ('snapshot-scheduling.json', snapshot), ('rules.json', rules)]:
                (folder / name).write_text(value.model_dump_json(indent=2), encoding='utf-8')
            (folder / 'roles.json').write_text(json.dumps(roles, default=str), encoding='utf-8')
            (folder / 'session.json').write_text(json.dumps(metadata), encoding='utf-8')
            api.runs[run_id] = {**metadata, 'status': 'RUNNING', 'events': [], 'result': None, 'history': []}

        def event(item):
            with api.guard:
                api.runs[run_id]['events'].append({k: v for k, v in item.items() if k not in {'input', 'output', 'context'}})

        def work():
            try:
                engine = api.Orchestrator(provider, rules, snapshot, payload.start_date, payload.end_date,
                                          policy=policy, trace_dir=folder, on_event=event, run_id=run_id, roster_roles=roles)
                result = engine.run()
                with api.guard:
                    api.runs[run_id].update(status=result.status, result=result.model_dump(mode='json'), history=engine.history)
            except Exception:
                # Surface worker failures without leaking provider credentials or DB connection details.
                with api.guard:
                    api.runs[run_id].update(status='FAILED', error='排班任务中断，请检查引擎日志后重新运行')
        api.pool.submit(work)
        return {'run_id': run_id, 'status': 'RUNNING'}

    def decorate(value, folder):
        rules = RuleSet.model_validate_json((folder / 'rules.json').read_text(encoding='utf-8'))
        snapshot = Snapshot.model_validate_json((folder / 'snapshot-scheduling.json').read_text(encoding='utf-8'))
        value['timezone'] = snapshot.timezone
        value['employees'] = [e.model_dump(mode='json') for e in snapshot.employees]
        commits = [e for e in value['events'] if e['kind'] in {'COMMITTED','PARTIAL_COMMITTED'}]
        accepted={date.fromisoformat(e['date']) for e in commits if e.get('date')}
        shortfalls={date.fromisoformat(e['date']) for e in commits if e['kind']=='PARTIAL_COMMITTED' and e.get('date')}
        if accepted:
            from .calendar_preview import calendar_preview
            assignments=[ScheduledShift.model_validate(s) for s in (value['result']['assignments'] if value['result'] else commits[-1]['assignments'])]
            first=next(e for e in value['events'] if e['kind']=='RUN_STARTED')
            policy=Policy.model_validate(first['policy'])
            start,end=date.fromisoformat(value['start_date']),date.fromisoformat(value['end_date'])
            context=context_for(rules,snapshot,start,end,policy)
            checked=validate(context,snapshot,rules,policy,assignments,active_dates=accepted,shortfall_dates=shortfalls)
            if checked.valid:
                roles=json.loads((folder/'roles.json').read_text(encoding='utf-8'))
                value['calendar_preview']=calendar_preview(folder.name,snapshot,roles,assignments,
                    start,end,value['preserve_existing'],max(e['ledger']['version'] for e in commits),accepted)
        if commits and not value['result']:
            first = next(e for e in value['events'] if e['kind'] == 'RUN_STARTED')
            policy = Policy.model_validate(first['policy'])
            start, end = date.fromisoformat(value['start_date']), date.fromisoformat(value['end_date'])
            context = context_for(rules, snapshot, start, end, policy)
            assignments = [ScheduledShift.model_validate(s) for s in commits[-1]['assignments']]
            report = validate(context, snapshot, rules, policy, assignments, active_dates={date.fromisoformat(e['date']) for e in commits},shortfall_dates=shortfalls)
            value['preview_coverage'] = [s.model_dump(mode='json') for s in report.coverage]
        return value

    def state(run_id, store, cookie):
        try:
            require_access(store, cookie)
        except SourceReadError as error:
            raise api.source_error(error)
        try:
            UUID(run_id)
        except ValueError:
            raise HTTPException(404, '排班任务不存在')
        with api.guard:
            present = api.runs.get(run_id)
        if present:
            value = api.authorized_run(run_id, cookie)
            if value.get('store_id') != store:
                raise HTTPException(404, '排班任务不存在')
            return decorate(value, api.DATA / run_id)
        folder = api.DATA / run_id
        meta = folder / 'session.json'
        if not meta.is_file():
            raise HTTPException(404, '排班任务不存在')
        saved = json.loads(meta.read_text(encoding='utf-8'))
        if saved['owner'] != api.owner(cookie) or saved['store_id'] != store:
            raise HTTPException(404, '排班任务不存在')
        result = json.loads((folder / 'result.json').read_text(encoding='utf-8')) if (folder / 'result.json').is_file() else None
        events = visible_events(folder)
        return decorate({**{k: v for k, v in saved.items() if k != 'owner'}, 'status': result['status'] if result else 'INTERRUPTED',
                'result': result, 'events': events, 'history': [{'date': e.get('date'), 'ledger': e['ledger']} for e in events if e['kind'] in {'COMMITTED','PARTIAL_COMMITTED'}]}, folder)

    @app.get('/multi-api/roster/runs/{run_id}')
    def status(run_id: str, store_id: str, cookie: str | None = Header(default=None)):
        return state(run_id, store_id, cookie)

    @app.get('/multi-api/roster/runs-recent')
    def recent_run(store_id:str,cookie:str|None=Header(default=None)):
        try:require_access(store_id,cookie)
        except SourceReadError as error:raise api.source_error(error)
        candidates=[]
        if api.DATA.is_dir():
            for folder in api.DATA.iterdir():
                try:
                    UUID(folder.name)
                    path=folder/'session.json'
                    if not path.is_file():continue
                    meta=json.loads(path.read_text(encoding='utf-8'))
                    if meta.get('owner')==api.owner(cookie) and meta.get('store_id')==store_id and meta.get('calendar_token'):
                        candidates.append((path.stat().st_mtime,folder.name,meta))
                except (ValueError,OSError,json.JSONDecodeError):continue
        if not candidates:return {'run':None}
        _,run_id,meta=max(candidates,key=lambda item:item[0])
        return {'run':{'run_id':run_id,'start_date':meta['start_date'],'end_date':meta['end_date']}}

    @app.get('/multi-api/roster/runs/{run_id}/export')
    def export(run_id: str, store_id: str, cookie: str | None = Header(default=None)):
        value = state(run_id, store_id, cookie)
        if value['status'] != 'DRAFT_VALIDATED':
            raise HTTPException(409, '只有完整验证通过的排班草稿可以导出')
        result = FinalSchedule.model_validate(value['result'])
        folder = api.DATA / run_id
        rules = RuleSet.model_validate_json((folder / 'rules.json').read_text(encoding='utf-8'))
        snapshot = Snapshot.model_validate_json((folder / 'snapshot-scheduling.json').read_text(encoding='utf-8'))
        roles = json.loads((folder / 'roles.json').read_text(encoding='utf-8'))
        report = validate(result.context, snapshot, rules, result.policy, result.assignments, ledger=result.ledger)
        if not report.valid or validate_calendar(result.calendar, result.assignments, snapshot, roles):
            raise HTTPException(409, '草稿独立重放失败，不能导出')
        return result.model_dump(mode='json')

    @app.post('/multi-api/roster/runs/{run_id}/apply-payload')
    def apply_payload(run_id:str,store_id:str,payload:CalendarApply=CalendarApply(),cookie:str|None=Header(default=None)):
        value=state(run_id,store_id,cookie)
        if not value.get('calendar_token'):
            raise HTTPException(409,'该任务不是从日历发起，不能直接写入；请在日历重新生成')
        start,end=date.fromisoformat(value['start_date']),date.fromisoformat(value['end_date'])
        mode='FULL'
        accepted=[]
        shortfalls=set()
        checked=None
        if value['status']=='DRAFT_VALIDATED':
            result=export(run_id,store_id,cookie)
        elif payload.allow_partial and value['status']=='FAILED' and value.get('result'):
            # A failed week stays FAILED. Only independently accepted dates become
            # ordinary editable drafts; failed dates and their existing shifts remain.
            mode='PARTIAL_DRAFT'
            folder=api.DATA/run_id
            rules=RuleSet.model_validate_json((folder/'rules.json').read_text(encoding='utf-8'))
            snapshot=Snapshot.model_validate_json((folder/'snapshot-scheduling.json').read_text(encoding='utf-8'))
            roles=json.loads((folder/'roles.json').read_text(encoding='utf-8'))
            final=FinalSchedule.model_validate(value['result'])
            if final.source!='REAL':raise HTTPException(409,'只能保存真实员工排班')
            accepted=sorted({e['date'] for e in value['events'] if e['kind'] in {'COMMITTED','PARTIAL_COMMITTED'} and e.get('date')})
            if not accepted:raise HTTPException(409,'没有通过当日验证的班次')
            days={date.fromisoformat(d) for d in accepted}
            shortfalls={date.fromisoformat(e['date']) for e in value['events'] if e['kind']=='PARTIAL_COMMITTED' and e.get('date')}
            if shortfalls!=set(final.incomplete_dates):raise HTTPException(409,'未满足日期与运行记录不一致')
            context=context_for(rules,snapshot,start,end,final.policy)
            checked=validate(context,snapshot,rules,final.policy,final.assignments,active_dates=days,ledger=final.ledger,shortfall_dates=shortfalls)
            if not checked.valid or any(not s.fixed and s.date not in days for s in final.assignments):
                raise HTTPException(409,'已完成日期独立重放失败，不能保存')
            from .retained_work import retained_work_conflict
            original=Snapshot.model_validate_json((folder/'snapshot-original.json').read_text(encoding='utf-8'))
            conflict=retained_work_conflict(original,rules,final.policy,final.assignments,final.ledger,days,start,end)
            if conflict:raise HTTPException(409,conflict)
            shifts=[s for s in final.assignments if s.date in days]
            from .serialization import serialize_calendar
            try:calendar=serialize_calendar(snapshot,rules,run_id,roles,shifts,start,end)
            except ValueError:raise HTTPException(409,'班次岗位映射不完整，不能保存')
            if validate_calendar(calendar,shifts,snapshot,roles):raise HTTPException(409,'班次数据不一致，不能保存')
            result=final.model_dump(mode='json')
            result['calendar']=calendar
        else:
            raise HTTPException(409,'没有可保存的已验证班次')
        try:
            current,_,snapshot,_,_,_,_=prepare(api,store_id,start,end,cookie,value['preserve_existing'])
            if current.version!=result['rule_version'] or snapshot.version!=result['snapshot_version']:
                raise HTTPException(409,'排班期间规则、员工或报班数据已变化，请重新生成，当前日历未修改')
        except (ValueError,SourceReadError) as error:raise api.source_error(error)
        return {'mode':mode,'accepted_dates':accepted,'daily_validation':None if checked is None else {'valid':True,'validated_dates':accepted,'shortfall_dates':sorted(map(str,shortfalls))},
                'calendar_token':value['calendar_token'],'preserve_existing':value['preserve_existing'],
                'result':result,'start_date':value['start_date'],'end_date':value['end_date']}

    @app.get('/multi-api/roster/latest')
    def latest(store_id: str, cookie: str | None = Header(default=None)):
        try:
            require_access(store_id, cookie)
        except SourceReadError as error:
            raise api.source_error(error)
        index = api.DATA / 'local-real-current.json'
        if not index.is_file():
            raise HTTPException(404, '该门店暂无已保存的真实排班结果')
        folder = api.DATA / json.loads(index.read_text(encoding='utf-8'))['folder']
        if folder.resolve().parent != api.DATA.resolve() or not (folder / 'snapshot-scheduling.json').is_file():
            raise HTTPException(404, '结果不存在')
        snapshot = Snapshot.model_validate_json((folder / 'snapshot-scheduling.json').read_text(encoding='utf-8'))
        if snapshot.store_id != store_id:
            raise HTTPException(404, '该门店暂无已保存的真实排班结果')
        value = api.local_real_result((folder / 'view-token.txt').read_text(encoding='utf-8').strip())
        if not value.get('result'):
            raise HTTPException(409, '最近的独立测试尚未完成')
        result = FinalSchedule.model_validate(value['result'])
        rules = RuleSet.model_validate_json((folder / 'rules.json').read_text(encoding='utf-8'))
        report = validate(result.context, snapshot, rules, result.policy, result.assignments, ledger=result.ledger)
        if report.model_dump(mode='json') != result.validation.model_dump(mode='json'):
            raise HTTPException(409, '历史结果与独立验证不一致')
        return value
