"""One process per solve, bounded by its parent. Uses the existing engine."""
import json
import pathlib
import sys
from contextlib import redirect_stdout
from datetime import date

root = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0,str(root/"scheduling-engine"))


def compute():
    from engine.models import Snapshot,RuleSet,SolveMode
    from engine.v2 import V2Policy,solve_v2
    payload=json.load(sys.stdin)
    snapshot=Snapshot.model_validate(payload["snapshot"])
    rules=RuleSet.model_validate(payload["rules"])
    start,end=date.fromisoformat(payload["from"]),date.fromisoformat(payload["to"])
    seconds=payload["solveSeconds"]
    if type(seconds) is not int or not 1<=seconds<=30: raise ValueError("Invalid solve limit")
    if not 0<=(end-start).days<=13: raise ValueError("Date range exceeds two weeks")
    if len(snapshot.employees)>150 or len(snapshot.availability)>5000: raise ValueError("Snapshot exceeds size limit")
    if snapshot.store_id!=rules.store_id or snapshot.timezone!=rules.timezone: raise ValueError("Scope mismatch")
    for employee in snapshot.employees:
        if employee.name != employee.id or not employee.id.startswith("employee-") or employee.hourly_cost_cents is not None:
            raise ValueError("Only pseudonymous employee IDs and required scheduling fields are accepted")
    result=solve_v2(snapshot,rules,start,end,SolveMode(payload["mode"]),V2Policy(solve_seconds=seconds))
    # The engine independently replays hard constraints. A validation failure
    # never becomes a candidate that can be committed by the Sites caller.
    if result.validation_errors: raise ValueError("Independent validation failed")
    return result


def main():
    with redirect_stdout(sys.stderr): result=compute()
    sys.stdout.write(result.model_dump_json())


if __name__=="__main__": main()
