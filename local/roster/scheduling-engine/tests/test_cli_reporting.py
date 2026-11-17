from __future__ import annotations

import json
import sys
from datetime import date

from engine.cli import coverage_gaps, main
from engine.models import CoverageSlot, RunResult
from fixtures.demo import current_demo_rules, demo_snapshot


def test_best_effort_cli_reports_missing_pattern_and_exit_code(tmp_path, monkeypatch, capsys):
    day = date(2026, 10, 26)
    rules = current_demo_rules()
    snapshot = demo_snapshot(day)
    snapshot.availability = []
    rules_path = tmp_path / "rules.json"
    snapshot_path = tmp_path / "snapshot.json"
    output_path = tmp_path / "candidate.json"
    rules_path.write_text(json.dumps(rules.current_payload()), encoding="utf-8")
    snapshot_path.write_text(snapshot.model_dump_json(), encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["engine.cli", "--rules", str(rules_path),
                        "--snapshot", str(snapshot_path), "--date", day.isoformat(),
                        "--mode", "BEST_EFFORT", "--output", str(output_path)])

    exit_code = main()

    summary = json.loads(capsys.readouterr().out)
    saved = RunResult.model_validate_json(output_path.read_text(encoding="utf-8"))
    assert saved.status in {"OPTIMAL", "FEASIBLE"}
    assert exit_code == 3
    assert summary["pattern_gaps"] > 0
    assert summary["unmet_slots"] == 0
    assert summary["missing_headcount_slots"] == 0
    assert summary["validation_errors"] == 0
    assert summary["unmet_slots"] == coverage_gaps(saved)[0]


def test_cli_counts_role_only_shortage_as_unmet_slot():
    slot = CoverageSlot(date=date(2026, 10, 26), start="2026-10-25T23:00:00Z",
                        end="2026-10-25T23:30:00Z", required=1, scheduled=1,
                        on_break=0, effective=1, excess=0, gap=0,
                        role_required={"service": 2}, role_effective={"service": 1})
    result = RunResult(run_id="local", engine_version="test", store_id="mock-hurstville",
                       timezone="Australia/Sydney", start_date=date(2026, 10, 26),
                       end_date=date(2026, 10, 26), source="MOCK",
                       snapshot_version="test", rule_version="test", mode="BEST_EFFORT",
                       status="FEASIBLE", elapsed_ms=0, coverage=[slot])

    assert coverage_gaps(result) == (1, 0, 1)
