from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from hashlib import sha256
import json
import os
import secrets
from pathlib import Path
from threading import Lock
from typing import Literal
from uuid import uuid4
from urllib.parse import urlparse

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict
from . import LAB_ROOT
from .contracts import Policy
from .domain import context_for
from .orchestrator import Orchestrator
from .provider import AnthropicProvider
from .source import inputs
from .contracts import FinalSchedule
from .domain import same_context, digest
from .validator import validate, validate_calendar
from engine.models import RuleSet, Snapshot
from adapters.real import SourceReadError, SourceAuthError, SourceAccessError

app=FastAPI(title="Roster Multi-Agent Draft Lab",version="1.0.0")
ROOT=Path(__file__).resolve().parents[1]
DATA=Path(os.getenv("MULTI_AGENT_DATA_DIR",str(ROOT/".data")))
pool=ThreadPoolExecutor(max_workers=2)
guard=Lock()
runs={}


class RunRequest(BaseModel):
    model_config=ConfigDict(extra="forbid")
    store_id:str="hurstville"
    start_date:date
    end_date:date
    source:Literal["REAL","MOCK"]="REAL"
    scenario:Literal["balanced","staff_shortage","skill_shortage","availability_conflict"]="balanced"
    policy:Policy=Policy()
    expected_rule_version:str
    expected_snapshot_version:str


@app.middleware("http")
async def local_origin(request:Request,call_next):
    origin=request.headers.get("origin")
    if request.method=="POST" and origin and urlparse(origin).netloc!=request.headers.get("host"):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=403,content={"detail":"Cross-origin mutations are disabled"})
    return await call_next(request)


def source_error(error):
    code=401 if isinstance(error,SourceAuthError) else 403 if isinstance(error,SourceAccessError) else 503 if isinstance(error,SourceReadError) else 422
    return HTTPException(code,str(error))


def owner(cookie):
    return sha256((cookie or "local-synthetic").encode()).hexdigest()


@app.get("/multi-api/health")
def health():
    return {"ok":True,"draft_only":True,"solver":False,"provider":"anthropic",
            "provider_configured":bool((os.getenv("MULTI_AGENT_API_KEY") or os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))
                and (os.getenv("MULTI_AGENT_MODEL") or os.getenv("ANTHROPIC_MODEL")))}


@app.get("/multi-api/inputs")
def preview(start_date:date,end_date:date,source:Literal["REAL","MOCK"]="REAL",store_id:str="hurstville",
    scenario:Literal["balanced","staff_shortage","skill_shortage","availability_conflict"]="balanced",cookie:str|None=Header(default=None)):
    try:
        rules,snapshot,roles=inputs(source,store_id,start_date,end_date,cookie,scenario)
        context=context_for(rules,snapshot,start_date,end_date)
    except (ValueError,SourceReadError) as error:
        raise source_error(error)
    return {"rules":rules.model_dump(mode="json"),"context":context.model_dump(mode="json"),
        "snapshot_version":snapshot.version,"source":source,"employees":[e.model_dump(mode="json") for e in snapshot.employees],
        "availability_count":len(snapshot.availability),"existing_shift_count":len(snapshot.existing_shifts),
        "rating_source":"Evaluate officialScore / latest valid CLOSED round" if source=="REAL" else "SYNTHETIC TEST SCORES",
        "roster_role_mapping":roles}


@app.get('/multi-api/local-real/{token}')
def local_real_result(token:str):
    """Read-only local diagnostic artifact, protected by a per-result capability URL."""
    index=DATA/'local-real-current.json'
    folder=DATA/json.loads(index.read_text(encoding='utf-8'))['folder'] if index.is_file() else DATA/'live-real-no-fairness'
    if folder.resolve().parent!=DATA.resolve():raise HTTPException(404,'Result not found')
    key=folder/'view-token.txt'
    if not key.is_file() or not secrets.compare_digest(token,key.read_text(encoding='utf-8').strip()):
        raise HTTPException(404,'Result not found')
    snapshot=Snapshot.model_validate_json((folder/'snapshot-scheduling.json').read_text(encoding='utf-8'))
    rules=RuleSet.model_validate_json((folder/'rules.json').read_text(encoding='utf-8'))
    if snapshot.source!='REAL' or any(e.id.startswith('synthetic-') for e in snapshot.employees):
        raise HTTPException(409,'Real database employees required')
    events=[]
    if (folder/'events.jsonl').is_file():
        for line in (folder/'events.jsonl').read_text(encoding='utf-8').splitlines():
            try:events.append(json.loads(line))
            except json.JSONDecodeError:pass # Concurrent append may leave the last line incomplete.
    original_context=next((e['context'] for e in events if e['kind']=='CONTEXT_ACCEPTED'),None)
    if original_context:
        start=date.fromisoformat(original_context['days'][0]['date']);end=date.fromisoformat(original_context['days'][-1]['date'])
    else:
        from zoneinfo import ZoneInfo
        days=[w.start.astimezone(ZoneInfo(snapshot.timezone)).date() for w in snapshot.availability]
        start=min(days);end=max(days)
    result=json.loads((folder/'result.json').read_text(encoding='utf-8')) if (folder/'result.json').is_file() else None
    from .preflight import eligibility_bounds
    from .business import business_report
    from .domain import fixed_shifts
    policy=Policy.model_validate(events[0]['policy']) if events else Policy(fairness_weight=0)
    diagnostics=eligibility_bounds(context_for(rules,snapshot,start,end,policy),snapshot,rules,
        policy,fixed_shifts(snapshot,start,end))
    accepted=next((e.get('assignments',[]) for e in reversed(events) if e['kind'] in {'COMMITTED','PARTIAL_COMMITTED'}),[])
    preview_coverage=[]
    if original_context and not result:
        from .contracts import SchedulingContext,ScheduledShift
        context=SchedulingContext.model_validate(original_context)
        policy=Policy.model_validate(events[0]['policy'])
        shortfalls={date.fromisoformat(e['date']) for e in events if e['kind']=='PARTIAL_COMMITTED' and e.get('date')}
        processed={date.fromisoformat(e['date']) for e in events if e['kind'] in {'COMMITTED','PARTIAL_COMMITTED'} and e.get('date')}
        replay=validate(context,snapshot,rules,policy,[ScheduledShift.model_validate(s) for s in accepted],active_dates=processed,shortfall_dates=shortfalls)
        preview_coverage=[s.model_dump(mode='json') for s in replay.coverage]
    from .contracts import ScheduledShift
    report_shifts=[ScheduledShift.model_validate(s) for s in (result['assignments'] if result else accepted)]
    allocation=business_report(snapshot,rules,policy,start,end,report_shifts)
    return {'status':result['status'] if result else 'RUNNING','result':result,
        'allocation_report':allocation,'business_rules':policy.business_rules.model_dump(mode='json') if policy.business_rules else None,
        'preview_assignments':accepted,'preview_coverage':preview_coverage,
        'source_diagnostics':diagnostics,
        'provenance':json.loads((folder/'provenance.json').read_text(encoding='utf-8')),
        'source':'REAL','timezone':snapshot.timezone,'start_date':str(start),'end_date':str(end),
        'employees':[e.model_dump(mode='json') for e in snapshot.employees],
        'events':[{k:v for k,v in e.items() if k not in {'input','output','context'}} for e in events],
        'history':[{'date':e.get('date'),'ledger':e['ledger']} for e in events if e['kind'] in {'COMMITTED','PARTIAL_COMMITTED'}]}


@app.post("/multi-api/runs",status_code=202)
def create(payload:RunRequest,cookie:str|None=Header(default=None)):
    try:
        rules,snapshot,roles=inputs(payload.source,payload.store_id,payload.start_date,payload.end_date,cookie,payload.scenario)
        context_for(rules,snapshot,payload.start_date,payload.end_date)
        provider=AnthropicProvider()
    except (ValueError,SourceReadError) as error:
        raise source_error(error)
    if rules.version!=payload.expected_rule_version or snapshot.version!=payload.expected_snapshot_version:
        raise HTTPException(409,"RuleSet/Snapshot changed since preview; reload inputs")
    run_id=str(uuid4())
    with guard:
        if any(r["owner"]==owner(cookie) and r["status"]=="RUNNING" for r in runs.values()):
            raise HTTPException(409,"One scheduling run is already active for this session")
        runs[run_id]={"owner":owner(cookie),"status":"RUNNING","events":[],"result":None,"history":[]}
    def event(item):
        # UI receives concise event summaries; full input/output is in local trace only.
        visible={k:v for k,v in item.items() if k not in {"input","output","context"}}
        with guard:
            runs[run_id]["events"].append(visible)
    def work():
        engine=Orchestrator(provider,rules,snapshot,payload.start_date,payload.end_date,policy=payload.policy,
            trace_dir=DATA/run_id,on_event=event,run_id=run_id,roster_roles=roles)
        result=engine.run()
        with guard:
            runs[run_id].update(status=result.status,result=result.model_dump(mode="json"),history=engine.history)
    pool.submit(work)
    return {"run_id":run_id,"status":"RUNNING"}


def authorized_run(run_id,cookie):
    with guard:
        item=runs.get(run_id)
        if item is None or item["owner"]!=owner(cookie):
            raise HTTPException(404,"Run not found in this session")
        return json.loads(json.dumps({k:v for k,v in item.items() if k!="owner"},default=str))


@app.get("/multi-api/runs/{run_id}")
def run_status(run_id:str,cookie:str|None=Header(default=None)):
    return authorized_run(run_id,cookie)


@app.get("/multi-api/runs/{run_id}/export")
def export(run_id:str,cookie:str|None=Header(default=None)):
    item=authorized_run(run_id,cookie)
    if item["status"]!="DRAFT_VALIDATED":
        raise HTTPException(409,"Only independently validated drafts can be exported")
    return item["result"]


@app.post("/multi-api/examples/synthetic-week")
def load_example(cookie:str|None=Header(default=None)):
    """Explicit, pre-generated MOCK example; never a fallback for REAL inputs."""
    folder=DATA/"live-synthetic-capped-week"
    if not (folder/"result.json").is_file():
        raise HTTPException(404,"Run the documented synthetic CLI example first")
    result=FinalSchedule.model_validate_json((folder/"result.json").read_text(encoding="utf-8"))
    if result.source!="MOCK" or result.status!="DRAFT_VALIDATED" or result.provider=="SCRIPTED_TEST_DOUBLE_NOT_LLM":
        raise HTTPException(409,"Example must be a validated real-LLM synthetic run")
    events=[json.loads(line) for line in (folder/"events.jsonl").read_text(encoding="utf-8").splitlines()]
    requirement=next(e["input"] for e in events if e["kind"]=="AGENT_OUTPUT" and e.get("agent")=="requirement")
    rules=RuleSet.model_validate(requirement["rules"])
    snapshot=Snapshot.model_validate(requirement["snapshot"])
    policy=Policy.model_validate(events[0]["policy"])
    context=result.context
    start,end=context.days[0].date,context.days[-1].date
    expected=context_for(rules,snapshot,start,end)
    legacy_hash=digest({"rules":requirement["rules"],"snapshot":requirement["snapshot"],"start":start,"end":end})
    if context.source_hash==legacy_hash:
        context=context.model_copy(update={"source_hash":expected.source_hash})
    if not same_context(context,expected):
        raise HTTPException(409,"Example context no longer matches its source")
    # Trace snapshots are authoritative; deterministically enrich older manifest-only artifacts.
    context=expected.model_copy(update={"priorities":context.priorities},deep=True)
    result=result.model_copy(update={"context":context,"policy":policy})
    report=validate(context,snapshot,rules,policy,result.assignments,ledger=result.ledger)
    if not report.valid or validate_calendar(result.calendar,result.assignments,snapshot,{}):
        raise HTTPException(409,"Example failed independent replay")
    state={"status":result.status,"events":[{k:v for k,v in e.items() if k not in {"input","output","context"}} for e in events],
        "result":result.model_dump(mode="json"),"history":[{"date":str(e.get("date") or "REVIEW"),"ledger":e["ledger"]}
            for e in events if e["kind"]=="COMMITTED"]}
    with guard:
        runs[result.run_id]={"owner":owner(cookie),**state}
    return {"run_id":result.run_id,"run":state,"preview":{
        "rules":rules.model_dump(mode="json"),"context":context.model_dump(mode="json"),
        "snapshot_version":snapshot.version,"source":"MOCK","rating_source":"SYNTHETIC TEST SCORES",
        "employees":[e.model_dump(mode="json") for e in snapshot.employees],"availability_count":len(snapshot.availability),
        "existing_shift_count":len(snapshot.existing_shifts)}}


from .roster_integration import register as register_roster_integration
register_roster_integration(app)

DIST=LAB_ROOT/"lab-ui/dist"
if DIST.is_dir():
    @app.get("/")
    def ui(request:Request):
        if 'real' not in request.query_params:
            index=DATA/'local-real-current.json'
            if index.is_file():
                folder=DATA/json.loads(index.read_text(encoding='utf-8'))['folder']
                key=folder/'view-token.txt'
                if folder.resolve().parent==DATA.resolve() and key.is_file():
                    from fastapi.responses import RedirectResponse
                    return RedirectResponse('/?real='+key.read_text(encoding='utf-8').strip())
        return FileResponse(DIST/"multi-agent.html")
    app.mount("/assets",StaticFiles(directory=DIST/"assets"),name="assets")
