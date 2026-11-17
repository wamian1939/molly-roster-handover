"""Inactive legacy time presets stay in history but not the Calendar Add dialog."""

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
for name, active in (("验收早班", False), ("Time only", True)):
    response = api.post(base + "/roster/templates", json={"storeId": "browser-store", "name": name,
        "startTime": "09:00", "endTime": "17:00", "breakMinutes": 30, "shiftRoleId": None})
    assert response.status_code == 201, response.text
    if not active:
        template = response.json()
        stopped = api.patch(base + "/roster/templates/" + template["id"], json={
            "storeId": "browser-store", "name": name, "startTime": "09:00", "endTime": "17:00",
            "breakMinutes": 30, "shiftRoleId": None, "isActive": False,
            "displayOrder": template["displayOrder"], "version": template["version"]})
        assert stopped.status_code == 200, stopped.text

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url) if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="新增班次").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("button", name=re.compile("Time only"))).to_be_visible()
        expect(dialog.get_by_role("button", name=re.compile("验收早班"))).to_have_count(0)
        dialog.get_by_role("button", name="取消").click()
        assert not writes, writes
        templates = api.get(base + "/roster/templates", params={"storeId": "browser-store"})
        templates.raise_for_status()
        rows = {row["name"]: row["isActive"] for row in templates.json()}
        assert rows == {"Time only": True, "验收早班": False}, rows
        print(json.dumps({"verified": True, "activeTimeOnlyVisible": True,
                          "inactiveLegacyHidden": True, "inactiveRecordRetained": True,
                          "browserRosterWrites": len(writes)}, ensure_ascii=False))
    finally:
        browser.close()
