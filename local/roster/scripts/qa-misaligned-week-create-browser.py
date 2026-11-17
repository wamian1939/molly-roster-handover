"""Check a configured store rejects an authenticated misaligned auto-period."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        base = "http://127.0.0.1:4035/api"
        roles = page.context.request.get(f"{base}/roster/roles?storeId=browser-store")
        if roles.status != 200:
            raise AssertionError(f"Fixture roles unavailable: {roles.status}")
        role = next(item for item in roles.json() if item["code"] == "qa-front")
        rejected = page.context.request.post(f"{base}/roster/shifts/with-period", data={
            "storeId": "browser-store", "date": "2026-10-20",
            "targetStartDate": "2026-10-20", "targetEndDate": "2026-10-26",
            "startAt": "2026-10-19T22:00:00.000Z", "endAt": "2026-10-19T23:00:00.000Z",
            "breakMinutes": 0, "shiftRoleId": role["id"], "employeeIds": ["browser-HandoverEmployee006"],
        })
        if rejected.status != 400 or rejected.json().get("validation", {}).get("code") != "INVALID_TIME_RANGE":
            raise AssertionError(f"Misaligned week accepted: {rejected.status} {rejected.text()}")
        print(json.dumps({"verified": True, "status": rejected.status,
                          "code": rejected.json()["validation"]["code"]}))
    finally:
        browser.close()
