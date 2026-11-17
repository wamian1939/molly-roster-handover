"""Read-only seven-day replay of exact scheduled staffing on the real snapshot."""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from adapters.reference import comparison_snapshot
from engine.models import RuleSet, Snapshot, SolveMode, SolveStatus
from engine.v2 import V2Policy, solve_v2

START = date(2026, 10, 26)
END = date(2026, 11, 1)
RULE_FILE = ROOT / "configs/hurstville-exact-scheduled.json"
SNAPSHOT_FILE = ROOT / ".data/hurstville-real-2026-10-26-2026-11-01.json"
REPORT_FILE = ROOT / ".data/hurstville-exact-scheduled-v20-regression.json"
REGRESSION_SOLVE_SECONDS = 60


def main() -> None:
    rules = RuleSet.model_validate_json(RULE_FILE.read_text(encoding="utf-8"))
    raw = Snapshot.model_validate_json(SNAPSHOT_FILE.read_text(encoding="utf-8"))
    if rules.requirement_mode != "EXACT_SCHEDULED" or raw.store_id != "hurstville" or raw.source != "REAL":
        raise SystemExit("Expected the real Hurstville exact-staffing inputs")
    detached, removed = comparison_snapshot(raw, START, END)
    # Bound the regression, while the saved interactive rule remains unlimited.
    policy = V2Policy(solve_seconds=REGRESSION_SOLVE_SECONDS,
                      official_score_weight=rules.weights.skill,
                      fairness_weight=rules.weights.fairness,
                      labor_cost_weight=rules.weights.labor_cost,
                      net_work_slot_weight=rules.weights.unnecessary_work)
    report = {"source": "REAL", "snapshot_version": raw.version,
              "rule_version": rules.version, "detached_published_shifts": removed,
              "saved_solve_seconds": rules.solve_seconds,
              "regression_solve_seconds": REGRESSION_SOLVE_SECONDS,
              "days": []}
    for offset in range(7):
        day = START + timedelta(days=offset)
        result = solve_v2(detached, rules, day, day, SolveMode.STRICT, policy)
        row = {"date": day.isoformat(), "status": result.status,
               "elapsed_ms": result.elapsed_ms,
               "shift_count": len(result.assignments),
               "pattern_counts": dict(Counter(shift.pattern_name for shift in result.assignments)),
               "scheduled_mismatches": sum(slot.scheduled != slot.required for slot in result.coverage),
               "break_person_slots": sum(slot.on_break for slot in result.coverage),
               "effective_shortfall_person_slots": sum(slot.effective_gap for slot in result.coverage),
               "validation_errors": result.validation_errors,
               "diagnostics": [item.model_dump(mode="json") for item in result.diagnostics]}
        if result.status in {SolveStatus.OPTIMAL, SolveStatus.FEASIBLE}:
            if row["scheduled_mismatches"] or result.validation_errors:
                raise AssertionError(f"Exact staffing verification failed on {day}")
            if len({shift.employee_id for shift in result.assignments}) != len(result.assignments):
                raise AssertionError(f"One employee has multiple shifts on {day}")
        elif result.status == SolveStatus.INFEASIBLE:
            if result.assignments or not result.diagnostics:
                raise AssertionError(f"Unexplained infeasibility on {day}")
        else:
            raise AssertionError(f"Unresolved solve status on {day}: {result.status}")
        report["days"].append(row)
        print(json.dumps({"date": row["date"], "status": row["status"],
                          "shifts": row["shift_count"], "patterns": row["pattern_counts"],
                          "elapsed_ms": row["elapsed_ms"]}, ensure_ascii=False), flush=True)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                           encoding="utf-8")
    print(f"Saved {REPORT_FILE}", flush=True)


if __name__ == "__main__":
    main()
