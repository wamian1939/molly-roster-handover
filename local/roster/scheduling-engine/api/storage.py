from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
import json

from engine.models import RuleSet, RunResult


DATA_FILE = Path(os.getenv("SCHEDULING_LAB_DATA") or Path(__file__).resolve().parents[1] / ".data" / "lab.sqlite3")


class RuleVersionConflict(Exception):
    def __init__(self, current: str | None):
        self.current = current
        super().__init__(f"Rule version changed; current version is {current or 'none'}")


def _connect() -> sqlite3.Connection:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATA_FILE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.executescript("""
        CREATE TABLE IF NOT EXISTS rule_versions (
            store_id TEXT NOT NULL, version INTEGER NOT NULL, saved_at TEXT NOT NULL,
            rules_json TEXT NOT NULL, PRIMARY KEY (store_id, version));
        CREATE TABLE IF NOT EXISTS runs (
            run_id TEXT PRIMARY KEY, store_id TEXT NOT NULL, created_at TEXT NOT NULL,
            source TEXT NOT NULL, result_json TEXT NOT NULL);
    """)
    return connection


def latest_rules(store_id: str) -> RuleSet | None:
    with _connect() as connection:
        row = connection.execute("SELECT rules_json FROM rule_versions WHERE store_id=? ORDER BY version DESC LIMIT 1", (store_id,)).fetchone()
    return RuleSet.model_validate_json(row["rules_json"]) if row else None


def rules_at_version(store_id: str, version: int) -> RuleSet | None:
    with _connect() as connection:
        row = connection.execute("SELECT rules_json FROM rule_versions WHERE store_id=? AND version=?",
                                 (store_id, version)).fetchone()
    return RuleSet.model_validate_json(row["rules_json"]) if row else None


def save_rules(rules: RuleSet, expected_version: str | None = None) -> RuleSet:
    # An override replaces the inherited pattern map. Persist the implied zero
    # counts explicitly so a saved version can be reviewed without guessing.
    weekly = {}
    for weekday, override in rules.weekly.items():
        names = [pattern.name for pattern in (override.patterns if override.patterns is not None
                                               else rules.base_day.patterns)]
        weekly[weekday] = (override if override.pattern_minimums is None else override.model_copy(
            update={"pattern_minimums": {name: override.pattern_minimums.get(name, 0)
                                          for name in names}}))
    dates = {}
    for day, override in rules.dates.items():
        names = [pattern.name for pattern in rules.for_date(day).patterns]
        dates[day] = (override if override.pattern_minimums is None else override.model_copy(
            update={"pattern_minimums": {name: override.pattern_minimums.get(name, 0)
                                          for name in names}}))
    explicit_rules = rules.model_copy(update={"weekly": weekly, "dates": dates})
    with _connect() as connection:
        connection.execute("BEGIN IMMEDIATE")
        row = connection.execute("SELECT version FROM rule_versions WHERE store_id=? ORDER BY version DESC LIMIT 1", (rules.store_id,)).fetchone()
        current = f"{rules.store_id}:v{row['version']}" if row else None
        if expected_version is not None and expected_version != (current or "__NONE__"):
            raise RuleVersionConflict(current)
        next_version = row["version"] + 1 if row else 1
        saved = explicit_rules.model_copy(update={"version": f"{rules.store_id}:v{next_version}"})
        connection.execute("INSERT INTO rule_versions VALUES (?,?,?,?)",
            (rules.store_id, next_version, datetime.now(timezone.utc).isoformat(),
             json.dumps(saved.current_payload(), ensure_ascii=False)))
    return saved


def save_run(result: RunResult) -> None:
    with _connect() as connection:
        connection.execute("INSERT INTO runs VALUES (?,?,?,?,?)",
            (result.run_id, result.store_id, datetime.now(timezone.utc).isoformat(),
             result.source, result.model_dump_json()))


def get_run(run_id: str) -> RunResult | None:
    with _connect() as connection:
        row = connection.execute("SELECT result_json FROM runs WHERE run_id=?", (run_id,)).fetchone()
    return RunResult.model_validate_json(row["result_json"]) if row else None


def recent_runs(store_id: str) -> list[dict]:
    with _connect() as connection:
        rows = connection.execute("SELECT run_id, created_at, source, result_json FROM runs WHERE store_id=? ORDER BY created_at DESC LIMIT 30", (store_id,)).fetchall()
    results = []
    for row in rows:
        result = RunResult.model_validate_json(row["result_json"])
        results.append({"run_id": row["run_id"], "created_at": row["created_at"],
                        "source": row["source"], "status": result.status,
                        "mode": result.mode, "rule_version": result.rule_version,
                        "snapshot_version": result.snapshot_version,
                        "run_purpose": result.run_purpose,
                        "start_date": result.start_date.isoformat(),
                        "end_date": result.end_date.isoformat(),
                        "assignment_count": len(result.assignments),
                        "engine_version": result.engine_version})
    return results
