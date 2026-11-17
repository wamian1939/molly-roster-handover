"""Replay a frozen actual Snapshot without authenticating, altering it, or writing any schedule."""
import argparse
from datetime import date
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from multi_agent.contracts import Policy
from multi_agent.domain import context_for,fixed_shifts
from multi_agent.preflight import eligibility_bounds
from engine.models import Snapshot,RuleSet


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--snapshot',required=True)
    parser.add_argument('--rules',help='Confirmed RuleSet JSON; defaults to rules.json next to the Snapshot')
    parser.add_argument('--start',default='2026-10-26')
    parser.add_argument('--end',default='2026-11-01')
    parser.add_argument('--detach-target-for-comparison',action='store_true')
    parser.add_argument('--output',default='.data/frozen-real-diagnostics.json')
    args=parser.parse_args()
    snapshot=Snapshot.model_validate_json(Path(args.snapshot).read_text(encoding='utf-8'))
    rules_path=Path(args.rules) if args.rules else Path(args.snapshot).parent/'rules.json'
    rules=RuleSet.model_validate_json(rules_path.read_text(encoding='utf-8'))
    start=date.fromisoformat(args.start);end=date.fromisoformat(args.end)
    removed=0
    if args.detach_target_for_comparison:
        from multi_agent.working_snapshot import replan_snapshot
        snapshot,removed=replan_snapshot(snapshot,start,end)
    context=context_for(rules,snapshot,start,end)
    result={'source':'FROZEN_REAL_SNAPSHOT','snapshot_version':snapshot.version,'generated_at':str(snapshot.generated_at),
        'current_source_refreshed':False,'rule_version':rules.version,'detached_target_existing_for_comparison':removed,
        'source_file_unchanged':True,'days':eligibility_bounds(context,snapshot,rules,Policy(),fixed_shifts(snapshot,start,end))}
    out=Path(args.output);out.parent.mkdir(exist_ok=True,parents=True);out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'days':[(r['date'],r['candidate_count'],len(r['proven_slot_conflicts'])) for r in result['days']],
                      'detached_in_memory':removed,'current_source_refreshed':False},ensure_ascii=False))


if __name__=='__main__':main()
