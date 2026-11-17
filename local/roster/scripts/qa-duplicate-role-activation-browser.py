"""Verify an inactive local role cannot replace an existing formal-job mapping."""

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
roles_url = base + "/roster/roles"
before = api.get(roles_url, params={"storeId": "browser-store", "includeInactive": "true"})
before.raise_for_status()
assert any(role["id"] == "qa-inactive-duplicate" and not role["isActive"] for role in before.json())

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
        formal_jobs = page.get_by_label("Evaluate 正式岗位清单")
        expect(formal_jobs).to_contain_text("QA Front", timeout=15000)
        expect(formal_jobs).to_contain_text("已用于排班")
        response = page.request.patch(base + "/roster/roles/qa-inactive-duplicate", data={
            "storeId": "browser-store", "nameZh": "QA Front", "colorToken": "#7c3aed",
            "requiredSkillCodes": [], "isActive": True, "displayOrder": 0, "version": 1,
        })
        assert response.status == 409, (response.status, response.text())
        assert "已有排班岗位关联" in response.json()["message"]
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_label("Evaluate 正式岗位清单")).to_contain_text("已用于排班", timeout=15000)
        assert writes == [], writes  # page.request does not originate from the document
    finally:
        browser.close()

after = api.get(roles_url, params={"storeId": "browser-store", "includeInactive": "true"})
after.raise_for_status()
assert after.json() == before.json()
print(json.dumps({"verified": True, "activationStatus": 409, "rolesUnchanged": True,
                  "settingsStillLinked": True, "pageRosterWrites": 0}))
