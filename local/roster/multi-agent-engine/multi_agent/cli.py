import argparse
import json
from datetime import date
from pathlib import Path
from .contracts import Policy
from .fixtures import example_rules,synthetic_snapshot
from .orchestrator import Orchestrator
from .provider import AnthropicProvider


def main():
    parser=argparse.ArgumentParser(description="Run four real LLM agents against synthetic employees and actual Hurstville rules")
    parser.add_argument("--start",type=date.fromisoformat,default=date(2026,10,26))
    parser.add_argument("--end",type=date.fromisoformat,default=date(2026,11,1))
    parser.add_argument("--scenario",choices=["balanced","staff_shortage","skill_shortage","availability_conflict"],default="balanced")
    parser.add_argument("--max-repairs",type=int,default=5)
    parser.add_argument("--weekly-cap-hours",type=float,default=38,
                        help="Explicit synthetic test nominal cap, not a legal or production policy")
    parser.add_argument("--output",default=".data/live-synthetic")
    args=parser.parse_args()
    rules=example_rules()
    snapshot=synthetic_snapshot(args.start,args.end,rules,args.scenario)
    def progress(event):
        if event["kind"] in {"AGENT_RUNNING","COMMITTED","REPAIR_ROUTED","RUN_FINISHED"}:
            print(json.dumps({k:v for k,v in event.items() if k not in {"ledger","input","output"}},default=str),flush=True)
    e=Orchestrator(AnthropicProvider(),rules,snapshot,args.start,args.end,
        policy=Policy(max_repairs=args.max_repairs,weekly_cap_minutes=int(args.weekly_cap_hours*60)),trace_dir=Path(args.output),on_event=progress)
    result=e.run()
    print(json.dumps({"status":result.status,"run_id":result.run_id,"shifts":len(result.assignments),
        "full":sum(s.pattern_name=="Full" for s in result.assignments),"state_version":result.state_version,
        "slots":len(result.validation.coverage),"errors":[e.model_dump(mode="json") for e in result.validation.errors],
        "input_tokens":sum(c.get("input_tokens",0) for c in e.calls),
        "output_tokens":sum(c.get("output_tokens",0) for c in e.calls),"provider":result.provider},ensure_ascii=False),flush=True)
    return 0 if result.status=="DRAFT_VALIDATED" else 1


if __name__=="__main__":
    raise SystemExit(main())
