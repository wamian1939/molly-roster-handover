"""Read-only real-source/real-LLM regression. Never imports results into the calendar."""
import argparse,json,sys
from datetime import date,timedelta
from pathlib import Path
from uuid import uuid4
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from multi_agent.local_source import local_database_inputs
from multi_agent.contracts import Policy,BusinessRuleSet
from multi_agent.orchestrator import Orchestrator
from multi_agent.provider import AnthropicProvider
from multi_agent.working_snapshot import replan_snapshot
from multi_agent.rule_settings import effective
from multi_agent.validator import validate,validate_calendar

parser=argparse.ArgumentParser()
parser.add_argument('--start',required=True,type=date.fromisoformat)
parser.add_argument('--end',required=True,type=date.fromisoformat)
parser.add_argument('--store',default='hurstville')
parser.add_argument('--max-repairs',type=int,default=2)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1]
folder=root/'.data'/('best-effort-real-'+str(uuid4()))
rules,original,roles=local_database_inputs(args.store,args.start,args.end,folder)
rules,_=effective(root/'.data',rules,args.start-timedelta(days=args.start.weekday()))
snapshot,_=replan_snapshot(original,args.start,args.end)
business_path=root/'configs'/f'{args.store}-business-v1.json'
business=BusinessRuleSet.model_validate_json(business_path.read_text(encoding='utf-8')) if business_path.is_file() else None
if business:business=business.model_copy(update={'base_rule_version':rules.version})
policy=Policy(fairness_weight=0,preference_weight=0,continue_on_day_failure=True,incremental_daily_selection=True,
    best_effort=True,max_repairs=args.max_repairs,business_rules=business)
for name,item in [('snapshot-scheduling.json',snapshot),('rules.json',rules),('policy.json',policy)]:
    (folder/name).write_text(item.model_dump_json(indent=2),encoding='utf-8')
(folder/'roles.json').write_text(json.dumps(roles,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'folder':str(folder),'source':snapshot.source,'employees':len(snapshot.employees),'availability':len(snapshot.availability),'production_writes':False}),flush=True)
def event(e):
    if e['kind'] in {'AGENT_RUNNING','COMMITTED','PARTIAL_COMMITTED','DAY_FAILED','RUN_FINISHED'}:
        print(json.dumps({k:e[k] for k in ['kind','agent','date','state_version'] if k in e},default=str),flush=True)
engine=Orchestrator(AnthropicProvider(),rules,snapshot,args.start,args.end,policy=policy,roster_roles=roles,trace_dir=folder,on_event=event)
result=engine.run()
safe=validate(result.context,snapshot,rules,policy,result.assignments,ledger=result.ledger,shortfall_dates=set(result.incomplete_dates))
assert safe.valid,safe.errors
assert result.calendar is not None,'Best effort result must contain explicit draft JSON'
assert not validate_calendar(result.calendar,result.assignments,snapshot,roles)
summary={'status':result.status,'source':result.source,'shifts':len(result.assignments),
    'incomplete_dates':list(map(str,result.incomplete_dates)),
    'per_day':[{ 'date':str(d.date),'shifts':sum(s.date==d.date for s in result.assignments),
        'short_slot_count':sum(c.date==d.date and c.difference<0 for c in result.validation.coverage)} for d in result.context.days],
    'safety_valid':safe.valid,'exact_coverage_valid':result.validation.valid,'publishable':result.publishable,
    'input_tokens':sum(c.get('input_tokens',0) for c in engine.calls),'output_tokens':sum(c.get('output_tokens',0) for c in engine.calls),
    'cost_usd':sum(c['cost_usd'] for c in engine.calls) if all(c.get('cost_usd') is not None for c in engine.calls) else None,
    'production_writes':False}
(folder/'verification.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary),flush=True)
