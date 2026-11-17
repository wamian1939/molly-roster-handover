from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path

from .models import RuleSet, RunResult, Snapshot, SolveMode
from .solver import solve


def coverage_gaps(result: RunResult) -> tuple[int, int, int]:
    missing_headcount = sum(slot.gap for slot in result.coverage)
    missing_roles = sum(max(0, required - slot.role_effective.get(role, 0))
                        for slot in result.coverage
                        for role, required in slot.role_required.items())
    unmet_slots = sum(slot.gap > 0 or any(
        slot.role_effective.get(role, 0) < required
        for role, required in slot.role_required.items())
        for slot in result.coverage)
    return unmet_slots, missing_headcount, missing_roles


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the isolated scheduling engine")
    parser.add_argument("--rules", type=Path, help="Rules JSON file")
    parser.add_argument("--snapshot", type=Path, help="Snapshot JSON file")
    parser.add_argument("--date", type=date.fromisoformat, required=True)
    parser.add_argument("--end-date", type=date.fromisoformat)
    parser.add_argument("--mode", choices=[mode.value for mode in SolveMode], default="STRICT")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if bool(args.rules) != bool(args.snapshot):
        parser.error("--rules and --snapshot must be supplied together")
    if args.rules:
        rules = RuleSet.model_validate_json(args.rules.read_text(encoding="utf-8"))
        snapshot = Snapshot.model_validate_json(args.snapshot.read_text(encoding="utf-8"))
    else:
        from fixtures.demo import current_demo_rules, demo_snapshot
        span = ((args.end_date or args.date) - args.date).days + 1
        rules, snapshot = current_demo_rules(), demo_snapshot(args.date, count=16 if span > 1 else 11, days=span)
    if not rules.pattern_only or rules.enforce_work_rest_limits:
        parser.error("Only seven-day shift-pattern count rules are supported for new runs")
    result = solve(snapshot, rules, args.date, args.end_date or args.date, SolveMode(args.mode))
    unmet_slots, missing_headcount, missing_roles = coverage_gaps(result)
    pattern_gaps = sum(item.code == "PATTERN_STAFFING_GAP" for item in result.diagnostics)
    payload = result.model_dump_json(indent=2)
    if args.output:
        args.output.write_text(payload + "\n", encoding="utf-8")
        print(json.dumps({"status": result.status, "output": str(args.output),
                          "assignments": len(result.assignments),
                          "unmet_slots": unmet_slots,
                          "missing_headcount_slots": missing_headcount,
                          "missing_role_slots": missing_roles,
                          "pattern_gaps": pattern_gaps,
                          "validation_errors": len(result.validation_errors),
                          "acceptance_gate": result.parameters.get("acceptance_gate")},
                         ensure_ascii=False))
    else:
        print(payload)
    if result.status not in {"OPTIMAL", "FEASIBLE"} or result.validation_errors:
        return 2
    return 3 if pattern_gaps or unmet_slots else 0


if __name__ == "__main__":
    raise SystemExit(main())
