"""Verify an existing Evaluate job cannot acquire a second Roster role."""

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
before = api.get(roles_url, params={"storeId": "browser-store"})
before.raise_for_status()

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
        page.get_by_label("岗位名称").fill("QA Front")
        page.get_by_label("代码").fill("qa-front")
        expect(page.get_by_role("button", name="关联正式岗位")).to_be_disabled()
        assert writes == [], writes
    finally:
        browser.close()

duplicate = api.post(roles_url, json={"storeId": "browser-store", "code": "qa-front", "nameZh": "QA Front",
                                       "colorToken": "#2563eb", "requiredSkillCodes": []})
assert duplicate.status_code == 409, (duplicate.status_code, duplicate.text)
after = api.get(roles_url, params={"storeId": "browser-store"})
after.raise_for_status()
assert after.json() == before.json()
print(json.dumps({"verified": True, "browserCreateDisabled": True, "apiDuplicateStatus": 409,
                  "browserRosterWrites": 0, "rolesUnchanged": True}))
