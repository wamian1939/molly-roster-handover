"""Archive and remove obsolete Hurstville Lab rules and runs.

Formal roster and employee data are outside this SQLite database.
"""

from __future__ import annotations

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from api.storage import DATA_FILE, latest_rules


def main() -> None:
    current = latest_rules("hurstville")
    if current is None or current.version != "hurstville:v20" or current.requirement_mode != "EXACT_SCHEDULED":
        raise SystemExit("Only the reviewed Hurstville v20 may replace old Lab versions")
    backup_dir = DATA_FILE.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / ("lab-before-old-version-prune-"
                           + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                           + ".sqlite3")
    with sqlite3.connect(DATA_FILE) as source, sqlite3.connect(backup) as target:
        source.backup(target)
    with sqlite3.connect(backup) as archived:
        if archived.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise SystemExit("Backup failed integrity check; no deletion performed")
    with sqlite3.connect(DATA_FILE) as connection:
        connection.execute("BEGIN IMMEDIATE")
        rows = connection.execute("SELECT run_id, result_json FROM runs WHERE store_id=?",
                                  ("hurstville",)).fetchall()
        old_run_ids = [run_id for run_id, body in rows
                       if json.loads(body).get("rule_version") != current.version]
        for run_id in old_run_ids:
            connection.execute("DELETE FROM runs WHERE run_id=?", (run_id,))
        deleted_rules = connection.execute("DELETE FROM rule_versions WHERE store_id=? AND version<20",
                                           ("hurstville",)).rowcount
        versions = connection.execute("SELECT version FROM rule_versions WHERE store_id=?",
                                      ("hurstville",)).fetchall()
        if versions != [(20,)]:
            raise AssertionError(f"Unexpected active versions after prune: {versions}")
    print(json.dumps({"current": current.version, "removed_old_rules": deleted_rules,
                      "removed_old_runs": len(old_run_ids), "backup": str(backup)},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
