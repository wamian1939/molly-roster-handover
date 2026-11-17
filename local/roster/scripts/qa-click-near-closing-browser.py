"""Reject a clicked draft that cannot fit before store closing."""

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
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-timegrid-slot-lane[data-time="21:30:00"]').click(position={"x": 200, "y": 4})
        page.wait_for_timeout(400)
        expect(page.get_by_role("dialog")).to_have_count(0, timeout=3000)
        expect(page.get_by_role("alert")).to_contain_text("营业")
        page.locator('.fc-timegrid-slot-lane[data-time="21:00:00"]').click(position={"x": 200, "y": 4})
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        times = dialog.locator('input[type="time"]')
        values = [times.nth(index).input_value() for index in range(2)]
        if values != ["21:00", "22:00"]:
            raise AssertionError(f"Valid closing-hour click changed: {values}")
        dialog.locator("footer button").first.click()
        print(json.dumps({"verified": True, "blockedClick": "21:30", "validClickPrefill": values,
                          "minimumMinutes": 60, "closingTime": "22:00"}))
    finally:
        browser.close()
