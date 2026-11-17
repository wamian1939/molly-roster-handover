"""Check the UI/API boundary for a global role shadowed by a store role."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
evaluate_api = requests.Session()
evaluate_login = evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential)
evaluate_login.raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code in (201, 409), job.text
api = requests.Session()
login = api.post("http://127.0.0.1:4040/api/auth/login", json=credential)
login.raise_for_status()
roles_response = api.get("http://127.0.0.1:4040/api/roster/roles", params={"storeId": "browser-store"})
roles_response.raise_for_status()
roles = [role for role in roles_response.json() if role["code"] == "qa-front"]
assert len(roles) == 2
global_role = next(role for role in roles if role["storeId"] is None)
store_role = next(role for role in roles if role["storeId"] == "browser-store")
jobs_response = api.get("http://127.0.0.1:4040/api/workforce/stores/browser-store/jobs")
jobs_response.raise_for_status()
assert [job["code"] for job in jobs_response.json()["jobs"]] == ["qa-front"]

shift_url = "http://127.0.0.1:4040/api/roster/shifts/qa-draft-shift"
before_response = api.get(shift_url, params={"storeId": "browser-store"})
before_response.raise_for_status()
before = before_response.json()
assert before["shiftRoleId"] == global_role["id"]
move = api.patch(f"{shift_url}/reposition", json={
    "storeId": "browser-store", "date": "2026-10-09", "startAt": "2026-10-09T00:00:00.000Z",
    "endAt": "2026-10-09T04:00:00.000Z", "version": before["version"],
    "targetStartDate": "2026-10-05", "targetEndDate": "2026-10-11",
})
assert move.status_code == 422, move.text
assert move.json()["validation"]["code"] == "UNVERIFIED_SHIFT_ROLE", move.text
note = api.post("http://127.0.0.1:4040/api/roster/batch/update", json={
    "storeId": "browser-store", "items": [{"id": before["id"], "version": before["version"]}],
    "patch": {"publicNote": "should not persist"},
})
assert note.status_code == 422, note.text
assert note.json()["validation"]["code"] == "UNVERIFIED_SHIFT_ROLE", note.text
after_response = api.get(shift_url, params={"storeId": "browser-store"})
after_response.raise_for_status()
after = after_response.json()
for key in ("id", "version", "date", "startAt", "endAt", "shiftRoleId", "publicNote"):
    assert after[key] == before[key], (key, before[key], after[key])

template = {"storeId": "browser-store", "name": "Alias safety", "startTime": "09:00", "endTime": "17:00", "breakMinutes": 30}
hidden_write = api.post("http://127.0.0.1:4040/api/roster/templates", json={**template, "shiftRoleId": global_role["id"]})
assert hidden_write.status_code == 422, hidden_write.text
allowed_write = api.post("http://127.0.0.1:4040/api/roster/templates", json={**template, "shiftRoleId": store_role["id"]})
if allowed_write.status_code == 201:
    assert allowed_write.json()["shiftRoleId"] == store_role["id"]
else:
    assert allowed_write.status_code == 409, allowed_write.text
    templates_response = api.get("http://127.0.0.1:4040/api/roster/templates", params={"storeId": "browser-store"})
    templates_response.raise_for_status()
    assert any(item["name"] == template["name"] and item["shiftRoleId"] == store_role["id"] for item in templates_response.json())

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        page.goto("http://127.0.0.1:5178/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5178/settings", wait_until="domcontentloaded")
        expect(page.locator('[aria-label="Evaluate 正式岗位清单"]')).to_contain_text("QA Front", timeout=15000)
        expect(page.get_by_text("Local QA Front", exact=True)).to_have_count(0)
        page.goto("http://127.0.0.1:5178/calendar?view=day&date=2026-10-09", wait_until="domcontentloaded")
        legacy_event = page.locator(".fc-timegrid-event").filter(has_text="旧岗位：QA Front")
        expect(legacy_event).to_have_count(1, timeout=15000)
        legacy_event.click()
        page.get_by_role("button", name=re.compile("Regular Bob")).click()
        expect(page.get_by_role("heading", name="编辑班次")).to_be_visible()
        expect(page.get_by_text("此班次使用的旧岗位已不在 Evaluate 正式清单中", exact=False)).to_be_visible()
        page.get_by_role("button", name="关闭编辑班次").click()
        print(json.dumps({"formalJob": "QA Front", "globalAliasRejected": 422,
                          "storeRoleTemplateStatus": allowed_write.status_code,
                          "globalShiftLabeledLegacy": True, "legacyEditRequiresCurrentRole": True,
                          "legacyMoveRejected": move.status_code, "legacyBatchNoteRejected": note.status_code,
                          "legacyShiftUnchanged": True}))
    finally:
        browser.close()
