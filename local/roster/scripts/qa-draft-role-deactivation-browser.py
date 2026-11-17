"""Verify a draft-backed role cannot be deactivated from Settings or the API."""

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
base = "http://127.0.0.1:4035/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()

def get(path, **params):
    response = api.get(base + path, params=params)
    response.raise_for_status()
    return response.json()

role_before = next(role for role in get("/roster/roles", storeId="browser-store") if role["code"] == "qa-back")
shift_before = next(shift for shift in get("/roster/calendar", **{"storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10"})["shifts"]
                    if shift["id"] == "qa-draft-role-shift")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/settings", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        role_row = page.locator("article").filter(has_text="QA Back")
        expect(role_row).to_contain_text("草稿班次使用中，请先改派再停用", timeout=15000)
        button = role_row.get_by_role("button", name="停用")
        expect(button).to_be_disabled()
        assert writes == [], writes
    finally:
        browser.close()

response = api.patch(base + "/roster/roles/" + role_before["id"], json={
    "storeId": "browser-store", "nameZh": role_before["nameZh"], "colorToken": role_before["colorToken"],
    "requiredSkillCodes": role_before["requiredSkillCodes"], "isActive": False,
    "displayOrder": role_before["displayOrder"], "version": role_before["version"],
})
assert response.status_code == 409, (response.status_code, response.text)
role_after = next(role for role in get("/roster/roles", storeId="browser-store") if role["id"] == role_before["id"])
shift_after = next(shift for shift in get("/roster/calendar", **{"storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10"})["shifts"]
                   if shift["id"] == "qa-draft-role-shift")
assert role_after == role_before
assert shift_after == shift_before
print(json.dumps({"verified": True, "settingsDeactivationDisabled": True, "apiStatus": 409,
                  "roleAndShiftUnchanged": True, "pageRosterWrites": 0}))
