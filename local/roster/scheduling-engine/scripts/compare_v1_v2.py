"""Read-only V1/V2 comparison using one explicitly supplied REAL Snapshot.

Example (from scheduling-engine/):
  python scripts/compare_v1_v2.py --snapshot .data/hurstville-week.json \
    --start 2026-10-26 --end 2026-11-01 --replace-target-published

The snapshot must come from the authenticated real adapter. This script does
not fetch credentials, create mock people, write Lab runs, or touch formal
Roster tables.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
import sys
from collections import defaultdict
from dataclasses import fields
from datetime import date
from importlib.metadata import version
from pathlib import Path
from statistics import pstdev

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from adapters.reference import comparison_snapshot
from engine.models import RuleSet, Snapshot, SolveMode
from engine.solver import solve
from engine.v2 import V2Policy, compile_coverage, replay_coverage, solve_v2


ROOT = Path(__file__).resolve().parents[1]


def saved_rule(version: int) -> RuleSet:
    uri = (ROOT / '.data' / 'lab.sqlite3').resolve().as_uri() + '?mode=ro'
    with sqlite3.connect(uri, uri=True) as db:
        row = db.execute('SELECT rules_json FROM rule_versions WHERE store_id=? AND version=?',
                         ('hurstville', version)).fetchone()
    if row is None:
        raise ValueError(f'Hurstville rule version {version} is unavailable')
    return RuleSet.model_validate_json(row[0])


def metrics(result, snapshot, requirements, pattern_preferences):
    actual = replay_coverage(snapshot, result.assignments, requirements)
    employees = {employee.id: employee for employee in snapshot.employees}
    canonical_quality = 0
    for requirement in requirements:
        if len(requirement.role_required) != 1:
            canonical_quality = None
            break
        role, required = next(iter(requirement.role_required.items()))
        qualified_scores = []
        for shift in result.assignments:
            if not (shift.start <= requirement.start and requirement.end <= shift.end):
                continue
            if any(begin < requirement.end and requirement.start < finish
                   for begin, finish in shift.breaks):
                continue
            employee = employees.get(shift.employee_id)
            if (employee is not None and role in employee.qualified_roles
                and snapshot.role_required_skills.get(role, set()) <= employee.skill_codes):
                qualified_scores.append(employee.score or 0)
        canonical_quality += sum(round(score * 10 * (requirement.end - requirement.start)
                                       .total_seconds() / 1800)
                                 for score in sorted(qualified_scores, reverse=True)[:required])
    hours: dict[str, int] = defaultdict(int)
    gap_by_date: dict[str, int] = defaultdict(int)
    full_by_date: dict[str, int] = defaultdict(int)
    for slot in actual:
        gap_by_date[slot.date.isoformat()] += slot.gap
    for shift in result.assignments:
        hours[shift.employee_id] += shift.net_work_minutes
        if shift.pattern_name == 'Full':
            full_by_date[shift.date.isoformat()] += 1
    distribution = [hours[employee.id] / 60 for employee in snapshot.employees]
    preferred = sum(pattern_preferences.get(shift.employee_id, {}).get(
        shift.pattern_name, 0) > 0 for shift in result.assignments)
    disliked = sum(pattern_preferences.get(shift.employee_id, {}).get(
        shift.pattern_name, 0) < 0 for shift in result.assignments)
    preference_assignments = sum(shift.employee_id in pattern_preferences
                                 for shift in result.assignments)
    return {
        'status': result.status.value,
        'validation_errors': len(result.validation_errors),
        'coverage_missing_person_slots': sum(slot.gap for slot in actual),
        'coverage_gap_slots': sum(slot.gap > 0 for slot in actual),
        'coverage_missing_person_slots_by_date': dict(sorted(gap_by_date.items())),
        'full_shifts': sum(shift.pattern_name == 'Full' for shift in result.assignments),
        'full_shifts_by_date': dict(sorted(full_by_date.items())),
        'total_net_hours': round(sum(hours.values()) / 60, 2),
        'hours_population_stddev': round(pstdev(distribution), 2),
        'employee_preference_satisfaction': (None if not pattern_preferences else
            round(preferred / preference_assignments, 3) if preference_assignments else None),
        'preferred_pattern_assignments': preferred if pattern_preferences else None,
        'disliked_pattern_assignments': disliked if pattern_preferences else None,
        'solve_ms': result.elapsed_ms,
        'priority_proven': result.parameters.get('priority_proven'),
        'objective_stage': result.parameters.get('objective_stage'),
        'score_optimization': result.parameters.get('score_optimization'),
        'cost_optimization': result.parameters.get('cost_optimization'),
        'credited_quality_points': result.parameters.get('metric_credited_quality_points'),
        'canonical_covered_score_points': canonical_quality,
        'credited_demand_slots': result.parameters.get('metric_credited_demand_slots'),
        'model_gap': result.parameters.get('metric_model_gap'),
        'replayed_gap': result.parameters.get('metric_replayed_gap'),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--snapshot', type=Path, required=True)
    parser.add_argument('--start', type=date.fromisoformat, required=True)
    parser.add_argument('--end', type=date.fromisoformat, required=True)
    parser.add_argument('--rule-version', type=int, default=15)
    parser.add_argument('--replace-target-published', action='store_true')
    parser.add_argument('--mode', choices=['STRICT', 'BEST_EFFORT'], default='BEST_EFFORT')
    parser.add_argument('--policy-json', type=Path,
                        help='Optional local V2Policy JSON for cost and individual preferences')
    parser.add_argument('--max-weekly-hours', type=float)
    parser.add_argument('--min-rest-hours', type=float)
    parser.add_argument('--v2-seconds', type=int)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if version('ortools') != '9.12.4544':
        parser.error('Use the pinned .venv-isolated environment (OR-Tools 9.12.4544)')
    if args.start > args.end or (args.end - args.start).days >= 14:
        parser.error('Choose an inclusive date range of 1–14 days')
    if args.max_weekly_hours is not None and args.max_weekly_hours <= 0:
        parser.error('--max-weekly-hours must be positive')
    if args.min_rest_hours is not None and args.min_rest_hours < 0:
        parser.error('--min-rest-hours cannot be negative')
    rules = saved_rule(args.rule_version)
    snapshot_bytes = args.snapshot.read_bytes()
    raw = Snapshot.model_validate_json(snapshot_bytes)
    if (raw.source != 'REAL' or raw.store_id != 'hurstville'
        or raw.timezone != rules.timezone or not raw.version.startswith('evaluate:')
        or '|source:' not in raw.version):
        parser.error('An authenticated Hurstville REAL source snapshot is required')
    snapshot = (comparison_snapshot(raw, args.start, args.end)[0]
                if args.replace_target_published else raw.model_copy(deep=True))
    snapshot.run_purpose = 'EXPLORATORY'
    mode = SolveMode(args.mode)
    values = json.loads(args.policy_json.read_text(encoding='utf-8')) if args.policy_json else {}
    if not isinstance(values, dict) or set(values) - {field.name for field in fields(V2Policy)}:
        parser.error('V2 policy JSON must be an object with known V2Policy fields')
    if 'optional_patterns' in values:
        values['optional_patterns'] = frozenset(values['optional_patterns'])
    if args.max_weekly_hours is not None:
        values['max_weekly_minutes'] = round(args.max_weekly_hours * 60)
    if args.min_rest_hours is not None:
        values['min_rest_minutes'] = round(args.min_rest_hours * 60)
    if args.v2_seconds is not None:
        values['solve_seconds'] = args.v2_seconds
    policy = V2Policy(**values)
    _days, requirements, errors = compile_coverage(rules, args.start, args.end, policy)
    if errors:
        raise ValueError(f'V2 requirement compilation failed: {[e.code for e in errors]}')
    v1 = solve(snapshot.model_copy(deep=True), rules, args.start, args.end, mode)
    v2 = solve_v2(snapshot.model_copy(deep=True), rules, args.start, args.end, mode, policy)
    report = {
        'store_id': snapshot.store_id, 'start': args.start.isoformat(),
        'end': args.end.isoformat(), 'rule_version': rules.version,
        'snapshot_version': snapshot.version, 'source': 'REAL',
        'snapshot_file_sha256': hashlib.sha256(snapshot_bytes).hexdigest(),
        'comparison_mode': snapshot.comparison_mode,
        'coverage_semantics': 'successive total headcount; Full is optional',
        'breaks_deducted_from_coverage': True,
        'weekly_cap_minutes': policy.max_weekly_minutes,
        'min_rest_minutes': policy.min_rest_minutes,
        'v2_weights': {name: getattr(policy, name) for name in (
            'excess_slot_weight', 'net_work_slot_weight', 'shift_count_weight',
            'official_score_weight', 'labor_cost_weight', 'fairness_weight',
            'pattern_preference_weight')},
        'v2_expected_hour_targets': len(policy.employee_expected_weekly_minutes),
        'v2_pattern_preferences': sum(len(item)
                                      for item in policy.employee_pattern_preferences.values()),
        'acceptance_gate': 'NOT_ELIGIBLE',
        'v1': metrics(v1, snapshot, requirements, policy.employee_pattern_preferences),
        'v2': metrics(v2, snapshot, requirements, policy.employee_pattern_preferences),
        'note': ('Employee preference satisfaction refers only to assigned shifts '
                 'when an explicit preference policy is supplied; this real '
                 'Snapshot has no authoritative employee-specific shift preferences.'),
    }
    value = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.write_text(value + '\n', encoding='utf-8')
    print(value)
    return 0 if not v1.validation_errors and not v2.validation_errors else 2


if __name__ == '__main__':
    raise SystemExit(main())
