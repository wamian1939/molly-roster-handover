"""Reject a Calendar Batch Update for a Shift outside its linked draft period."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1400, "height": 900}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-12"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        event = page.locator('.fc-timegrid-event').filter(has_text="Regular Bob")
        expect(event).to_be_visible()
        page.locator(".calendar-toolbar button").filter(has_text="批量").click()
        event.click()
        page.get_by_role("combobox", name="统一改为岗位").click()
        page.get_by_role("option", name="QA Front").click()
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/update")) as response_info:
            page.get_by_role("button", name="批量改岗").click()
        response = response_info.value
        result = response.json()
        if response.status != 409 or result.get("validation", {}).get("code") != "SHIFT_PERIOD_MISMATCH" or result["validation"].get("shiftId") != "qa-misplaced-shift":
            raise AssertionError(f"Unexpected malformed Shift batch response: {response.status} {result}")
        page.reload(wait_until="domcontentloaded")
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-12"] .fc-daygrid-day-number').click()
        expect(page.locator('.fc-timegrid-event').filter(has_text="Regular Bob")).to_be_visible()
        print(json.dumps({"verified": True, "batchHttp": response.status, "validationCode": "SHIFT_PERIOD_MISMATCH",
                          "calendarReloaded": True}))
    finally:
        browser.close()
