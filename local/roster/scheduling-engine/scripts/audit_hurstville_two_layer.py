"""Read-only Hurstville v15 versus unsaved two-layer proposal comparison.

Uses one local REAL snapshot and a detached copy without target-date published
shifts. It never calls a write endpoint or mutates the Lab rule database.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from adapters.reference import comparison_snapshot
from engine.clock import minutes_between
from engine.models import RuleSet, Snapshot, SolveMode
from engine.v2 import V2Policy, compile_coverage, replay_coverage, solve_v2


def summarize(result, rules: RuleSet) -> dict:
    days = [result.start_date.fromordinal(result.start_date.toordinal() + offset)
            for offset in range((result.end_date - result.start_date).days + 1)]
    counts = {day.isoformat(): dict(Counter(shift.pattern_name for shift in result.assignments
                                            if shift.date == day)) for day in days}
    minimum_pattern_gap = sum(max(0, minimum - counts[day.isoformat()].get(name, 0))
        for day in days for name, minimum in rules.for_date(day).pattern_minimums.items())
    credited = [row for row in result.score_allocation if row.official_score is not None]
    credited_minutes = sum(row.credited_demand_minutes or 0 for row in credited)
    scored_minutes = sum((row.credited_demand_minutes or 0) * row.official_score
                         for row in credited)
    return {
        "run_id": result.run_id, "status": result.status, "objective_stage": result.parameters.get("objective_stage"),
        "priority_proven": result.parameters.get("priority_proven"),
        "score_optimization": result.parameters.get("score_optimization"),
        "elapsed_ms": result.elapsed_ms, "shift_count": len(result.assignments),
        "full_count": sum(shift.pattern_name == "Full" for shift in result.assignments),
        "pattern_counts": counts, "pattern_minimum_gap": minimum_pattern_gap,
        "gross_shift_hours": round(sum(minutes_between(shift.start, shift.end)
                                       for shift in result.assignments) / 60, 2),
        "paid_hours": round(sum(shift.net_work_minutes for shift in result.assignments) / 60, 2),
        "coverage_gap_person_minutes": sum(slot.gap * minutes_between(slot.start, slot.end)
                                           for slot in result.coverage),
        "effective_gap_person_minutes": sum(slot.effective_gap * minutes_between(slot.start, slot.end)
                                            for slot in result.coverage),
        "above_target_person_minutes": sum(slot.target_excess * minutes_between(slot.start, slot.end)
                                           for slot in result.coverage),
        "average_credited_official_score": (round(scored_minutes / credited_minutes, 2)
                                              if credited_minutes else None),
        "validation_errors": result.validation_errors,
        "diagnostic_codes": dict(Counter(item.code for item in result.diagnostics)),
    }


def common_coverage(snapshot: Snapshot, assignments, requirements) -> dict:
    slots = replay_coverage(snapshot, assignments, requirements)
    return {
        "minimum_gap_person_minutes": sum(slot.gap * minutes_between(slot.start, slot.end)
                                          for slot in slots),
        "below_target_person_minutes": sum(slot.target_shortfall * minutes_between(slot.start, slot.end)
                                            for slot in slots),
        "above_target_person_minutes": sum(slot.target_excess * minutes_between(slot.start, slot.end)
                                            for slot in slots),
        "break_person_minutes": sum(slot.on_break * minutes_between(slot.start, slot.end)
                                    for slot in slots),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot", type=Path,
                        default=ROOT / ".data/hurstville-real-2026-10-26-2026-11-01.json")
    parser.add_argument("--proposal", type=Path,
                        default=ROOT / "configs/hurstville-two-layer-proposal.json")
    parser.add_argument("--lab-db", type=Path, default=ROOT / ".data/lab.sqlite3")
    parser.add_argument("--output", type=Path, default=ROOT / ".data/hurstville-two-layer-comparison.json")
    args = parser.parse_args()
    start, end = date(2026, 10, 26), date(2026, 11, 1)
    snapshot = Snapshot.model_validate_json(args.snapshot.read_text(encoding="utf-8"))
    with sqlite3.connect(f"file:{args.lab_db.resolve()}?mode=ro", uri=True) as connection:
        row = connection.execute("SELECT rules_json FROM rule_versions WHERE store_id=? AND version=?",
                                 ("hurstville", 15)).fetchone()
    if row is None:
        raise SystemExit("Saved hurstville:v15 rule not found")
    before_rules = RuleSet.model_validate_json(row[0])
    after_rules = RuleSet.model_validate_json(args.proposal.read_text(encoding="utf-8"))
    if (snapshot.store_id != "hurstville" or snapshot.source != "REAL"
        or before_rules.version != "hurstville:v15"
        or after_rules.copied_from != "hurstville:v15"):
        raise SystemExit("Comparison source contract does not match the intended real Hurstville v15")
    detached, removed = comparison_snapshot(snapshot, start, end)

    def run(rules: RuleSet):
        return solve_v2(detached, rules, start, end, SolveMode.BEST_EFFORT,
                        V2Policy(solve_seconds=rules.solve_seconds,
                                 official_score_weight=rules.weights.skill,
                                 fairness_weight=rules.weights.fairness,
                                 labor_cost_weight=rules.weights.labor_cost,
                                 net_work_slot_weight=rules.weights.unnecessary_work))

    before = run(before_rules)
    after = run(after_rules)
    _days, common_requirements, errors = compile_coverage(after_rules, start, end, V2Policy())
    if errors:
        raise SystemExit(f"Unsaved proposal has invalid coverage: {errors}")
    before_summary = summarize(before, before_rules)
    after_summary = summarize(after, after_rules)
    before_summary["under_proposal_coverage"] = common_coverage(detached, before.assignments,
                                                               common_requirements)
    after_summary["under_proposal_coverage"] = common_coverage(detached, after.assignments,
                                                              common_requirements)
    report = {
        "snapshot_version": detached.version, "comparison_removed_published": removed,
        "same_employee_availability_score_input": True,
        "warning": "Use under_proposal_coverage for comparable coverage metrics; native gap fields have different rule meanings.",
        "before_v15_exact_headcount": before_summary,
        "after_unsaved_pattern_and_effective_coverage": after_summary,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True))


if __name__ == "__main__":
    main()
