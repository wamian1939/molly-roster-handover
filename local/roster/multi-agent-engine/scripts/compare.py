"""Separate, read-only regression process. CP-SAT is a comparator, never a generator fallback."""
import argparse
from datetime import date,timedelta
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from multi_agent.fixtures import example_rules,synthetic_snapshot
from multi_agent.domain import context_for
from multi_agent.contracts import Policy,ScheduledShift
from multi_agent.validator import validate
from engine.models import Snapshot,SolveMode


def replay_summary(shifts,snapshot,rules,start,end,policy=None):
    context=context_for(rules,snapshot,start,end)
    report=validate(context,snapshot,rules,policy or Policy(),shifts)
    return {"shift_count":len(shifts),"full_count":sum(s.pattern_name=='Full' for s in shifts),
        "nominal_minutes":sum(int((s.end-s.start).total_seconds()/60) for s in shifts),
        "mismatched_slots":sum(s.difference!=0 for s in report.coverage),
        "hard_errors":[e.model_dump(mode='json') for e in report.errors]}


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--multi-result',required=True)
    p.add_argument('--output',default='.data/comparison.json')
    args=p.parse_args()
    result=json.loads(Path(args.multi_result).read_text(encoding='utf-8'))
    context=result['context'];start=date.fromisoformat(context['days'][0]['date']);end=date.fromisoformat(context['days'][-1]['date'])
    rules=example_rules();snapshot=synthetic_snapshot(start,end,rules)
    if result['source']!='MOCK' or result['snapshot_version']!=snapshot.version or result['rule_version']!=rules.version:
        raise ValueError('This comparator requires the matching balanced synthetic fixture and RuleSet version')
    multi=[ScheduledShift.model_validate(s) for s in result['assignments']]
    events_path=Path(args.multi_result).parent/'events.jsonl'
    policy=Policy()
    if events_path.is_file():
        first=json.loads(events_path.read_text(encoding='utf-8').splitlines()[0])
        policy=Policy.model_validate(first.get('policy',{}))
    report={'comparison_semantics':'Exact nominal half-hour coverage. Comparator disables break generation in an in-memory rule copy; production rules remain unchanged.',
        'run_policy':policy.model_dump(),
        'multi_agent':replay_summary(multi,snapshot,rules,start,end,policy),'cp_sat':{},'manual_reference':{}}
    # Only this standalone comparison tool imports CP-SAT.
    from engine.v2 import solve_v2,V2Policy
    cp_rules=rules.model_copy(deep=True)
    for pattern in cp_rules.base_day.patterns:
        pattern.break_rule.count=0
    cp=solve_v2(snapshot,cp_rules,start,end,SolveMode.STRICT,V2Policy(solve_seconds=30,
        max_weekly_minutes=policy.weekly_cap_minutes,official_score_weight=int(policy.rating_weight),
        fairness_weight=int(policy.fairness_weight)))
    cp_shifts=[ScheduledShift(id=f'cp-{i}',employee_id=s.employee_id,store_id=s.store_id,date=s.date,
        pattern_name=s.pattern_name,role_code=s.role_code,start=s.start,end=s.end) for i,s in enumerate(cp.assignments)]
    report['cp_sat']={'status':str(cp.status),**replay_summary(cp_shifts,snapshot,rules,start,end,policy)}
    # The historical manual schedule has a different workforce and is reported separately, not ranked as equal-input output.
    path=ROOT.parent/'scheduling-engine/.data/hurstville-real-2026-10-26-2026-11-01.json'
    if path.is_file():
        real=Snapshot.model_validate_json(path.read_text(encoding='utf-8'))
        from zoneinfo import ZoneInfo
        zone=ZoneInfo(real.timezone)
        manual=[ScheduledShift(id=f'manual-{i}',employee_id=s.employee_id,store_id=s.store_id,
            date=s.start.astimezone(zone).date(),pattern_name='Published reference',role_code=s.role_code or '',
            start=s.start,end=s.end) for i,s in enumerate(real.existing_shifts)
            if s.store_id==rules.store_id and start<=s.start.astimezone(zone).date()<=end]
        # Only compare time coverage for a historical manual roster; its original named patterns are unavailable.
        raw=replay_summary(manual,real,rules,start,end)
        raw.pop('hard_errors')
        raw['full_count']=None
        report['manual_reference']={**raw,'snapshot_version':real.version,'generated_at':str(real.generated_at),
            'historical_frozen_snapshot':True,'same_workforce_as_synthetic':False,
            'note':'Only nominal coverage is compared for this historical reference. Original named patterns are unavailable, so Full count is unknown. Workforce differs from synthetic inputs. Existing shifts remain untouched.'}
    out=Path(args.output);out.parent.mkdir(exist_ok=True,parents=True);out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:{a:b for a,b in v.items() if a!='hard_errors'} if isinstance(v,dict) else v for k,v in report.items()},ensure_ascii=False))


if __name__=='__main__':main()
