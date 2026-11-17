"""Check the Calendar toolbar and store-local Export year in disposable Chromium."""

import json
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 900}, locale="zh-CN", timezone_id="Australia/Sydney")
        page.clock.install(time=datetime(2026, 12, 31, 13, 15, tzinfo=timezone.utc))
        period_requests = []
        page.on("request", lambda request: period_requests.append(request.url)
                if "/api/roster/periods?" in request.url else None)
        page_errors = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        def adelaide_settings(route):
            response = route.fetch()
            payload = response.json()
            payload["settings"] = {**(payload.get("settings") or {}), "timezone": "Australia/Adelaide"}
            route.fulfill(response=response, json=payload)

        page.route("**/api/roster/settings?*", adelaide_settings)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        toolbar = page.locator(".calendar-toolbar")
        expect(toolbar.get_by_role("button", name="今天")).to_be_visible()
        assert toolbar.get_by_text("复制").count() == 0
        assert toolbar.get_by_text("批量").count() == 0
        expect(page.locator(".calendar-footer-actions").get_by_role("button", name="排班操作")).to_be_visible()

        page.locator('a[href="/export"]').first.click()
        expect(page.get_by_label("发布历史年份")).to_contain_text("2026")
        expect(page.get_by_role("combobox", name="排班周期")).to_contain_text("2026-10")
        assert any("from=2026-01-01" in url and "to=2026-12-31" in url for url in period_requests), period_requests
        assert not page_errors, page_errors
        print(json.dumps({"verified": True, "browserTimezone": "Australia/Sydney", "storeTimezone": "Australia/Adelaide",
                          "browserLocalYear": 2027, "exportYear": 2026, "toolbarCopyActions": 0,
                          "storePeriodRequest": True, "pageErrors": 0}))
    finally:
        browser.close()
