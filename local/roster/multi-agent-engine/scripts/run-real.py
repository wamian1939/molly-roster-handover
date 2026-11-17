"""Run actual database employees/availability, no fairness, no production writes."""
from datetime import date, datetime, timezone, timedelta
from pathlib import Path
import argparse,json,sys,secrets,os
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from multi_agent.local_source import local_database_inputs
from multi_agent.contracts import Policy,BusinessRuleSet
from multi_agent.orchestrator import Orchestrator
from multi_agent.provider import AnthropicProvider
from multi_agent.working_snapshot import replan_snapshot
from multi_agent.rule_settings import effective
from multi_agent.business import validate_scope

p=argparse.ArgumentParser()
p.add_argument('--start',type=date.fromisoformat,default=date(2026,10,26))
p.add_argument('--end',type=date.fromisoformat,default=date(2026,11,1))
p.add_argument('--output',default=None)
p.add_argument('--business-rules',default='configs/hurstville-business-v1.json')
args=p.parse_args()
folder=Path(args.output or '.data/live-real-targets-bob-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+secrets.token_hex(3))
if folder.exists() and any(folder.iterdir()):
    raise ValueError('Output directory must be new or empty; preserve prior snapshots and traces')
rules,original,roles=local_database_inputs('hurstville',args.start,args.end,folder)
token_path=folder/'view-token.txt'
if not token_path.is_file():token_path.write_text(secrets.token_urlsafe(24),encoding='utf-8')
(folder.parent/'local-real-current.json').write_text(json.dumps({'folder':folder.name}),encoding='utf-8')
snapshot,removed=replan_snapshot(original,args.start,args.end)
(folder/'snapshot-scheduling.json').write_text(snapshot.model_dump_json(indent=2),encoding='utf-8')
(folder/'roles.json').write_text(json.dumps(roles,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'source':'LIVE_DATABASE','employees':len(snapshot.employees),'availability':len(snapshot.availability),
    'rule':rules.version,'detached_existing_in_memory':removed,'fairness':False}),flush=True)
def event(e):
    if e['kind'] in {'AGENT_RUNNING','COMMITTED','PARTIAL_COMMITTED','DAY_INCOMPLETE','DAY_FAILED','RUN_FINISHED'}:
        print(json.dumps({k:v for k,v in e.items() if k not in {'input','output','ledger','errors'}},default=str),flush=True)
business_path=Path(args.business_rules)
business=BusinessRuleSet.model_validate_json(business_path.read_text(encoding='utf-8')) if business_path.is_file() else None
if args.business_rules and business is None:raise ValueError('Business RuleSet file is missing')
policy=Policy(fairness_weight=0,preference_weight=0,continue_on_day_failure=True,incremental_daily_selection=True,best_effort=True,business_rules=business)
validate_scope(rules,snapshot,policy)
rules,_=effective(Path(os.getenv('MULTI_AGENT_DATA_DIR',str(Path(__file__).resolve().parents[1]/'.data'))),rules,args.start-timedelta(days=args.start.weekday()))
if business:
    business=business.model_copy(update={'base_rule_version':rules.version})
    policy=policy.model_copy(update={'business_rules':business})
    (folder/'business-rules.json').write_text(business.model_dump_json(indent=2),encoding='utf-8')
(folder/'rules.json').write_text(rules.model_dump_json(indent=2),encoding='utf-8')
engine=Orchestrator(AnthropicProvider(),rules,snapshot,args.start,args.end,
    policy=policy,
    trace_dir=folder,on_event=event,roster_roles=roles)
result=engine.run()
print(json.dumps({'status':result.status,'accepted_dates':sorted(str(d) for d in engine.accepted_dates),
    'failed_dates':[d['date'] for d in result.failed_days],'shift_count':len(result.assignments),
    'full_count':sum(s.pattern_name=='Full' for s in result.assignments)},ensure_ascii=False),flush=True)
