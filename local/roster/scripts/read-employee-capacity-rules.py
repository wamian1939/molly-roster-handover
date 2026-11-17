"""Read the existing rule authorities without modifying either SQLite database."""
import json
import sqlite3
import sys
from datetime import date
from pathlib import Path

root = Path(__file__).resolve().parents[1]
store, week_text = sys.argv[1:3]
week = date.fromisoformat(week_text)
if week.weekday() != 0:
    raise ValueError("Week must start on Monday")


def read_one(path, query, params):
    if not path.is_file():
        return None
    with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute(query, params).fetchone()
        return dict(row) if row else None


base = read_one(root / "scheduling-engine/.data/lab.sqlite3",
                "SELECT rules_json FROM rule_versions WHERE store_id=? ORDER BY version DESC LIMIT 1", (store,))
if base is None:
    raise ValueError("No confirmed staffing rules for this store")
rules = json.loads(base["rules_json"])
settings_path = root / "multi-agent-engine/.data/agent-rule-settings.sqlite3"
selected = None
for key in (week_text, "DEFAULT"):
    selected = read_one(settings_path,
                        "SELECT * FROM settings_versions WHERE store_id=? AND scope_key=? ORDER BY version DESC LIMIT 1",
                        (store, key))
    if selected:
        break
if selected and selected["base_rule_version"] != rules["version"]:
    raise ValueError("Staffing rules need manager review")
if rules.get("requirement_mode") != "EXACT_SCHEDULED":
    raise ValueError("Exact staffing rules are required")
weekly = json.loads(selected["weekly_json"]) if selected else rules["weekly_exact_staffing"]
if set(weekly) != {str(i) for i in range(7)}:
    raise ValueError("Incomplete weekly staffing rules")
print(json.dumps({"storeId": store, "timezone": rules["timezone"], "weekly": weekly,
                  "version": rules["version"] + (f"|agent:{selected['scope_key']}:v{selected['version']}" if selected else ""),
                  "scope": "WEEK" if selected and selected["scope_key"] != "DEFAULT" else "DEFAULT"}))
