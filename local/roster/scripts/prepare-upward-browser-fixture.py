"""Prepare only the guarded disposable employee/job availability for Day drag QA."""

import json
import re
import tempfile
from pathlib import Path

import requests

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

eval_api = requests.Session()
eval_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
jobs = eval_api.get("http://127.0.0.1:4010/api/store-jobs", params={"storeId": "browser-store"})
jobs.raise_for_status()
if not any(job.get("code") == "qa-front" for job in jobs.json()):
    created = eval_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
        "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
    })
    created.raise_for_status()

roster_api = requests.Session()
roster_api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
rows = roster_api.get("http://127.0.0.1:4035/api/roster/availability", params={
    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "from": "2026-10-10", "to": "2026-10-10",
})
rows.raise_for_status()
if not rows.json():
    created = roster_api.put("http://127.0.0.1:4035/api/roster/availability", json={
        "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
        "expectedRows": [], "entries": [{"date": "2026-10-10", "status": "AVAILABLE",
                                     "startAt": "2026-10-09T21:00:00.000Z", "endAt": "2026-10-10T08:00:00.000Z"}],
    })
    created.raise_for_status()

print(json.dumps({"prepared": True, "rosterSchema": roster["schema"], "evaluateSchema": evaluate["schema"]}))
