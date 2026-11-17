"""Check an overnight shift's two dated Day segments in disposable Chromium."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster QA schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate QA schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.wait_for_timeout(1500)
        first_day_events = page.locator('.fc-timegrid-event').all_text_contents()
        if sum("HandoverEmployee006" in item for item in first_day_events) != 1:
            raise AssertionError(f"Expected one HandoverEmployee006 segment on source Day: {first_day_events}")
        page.get_by_role("button", name="月视图").click()
        expect(page.locator('.fc-daygrid')).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator('.fc-timegrid')).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(page.locator('.fc-timegrid-event').first).to_be_visible()
        second_day_events = page.locator('.fc-timegrid-event').all_text_contents()
        if sum("HandoverEmployee006" in item for item in second_day_events) != 1 or sum("Cindy" in item for item in second_day_events) != 1:
            raise AssertionError(f"Expected HandoverEmployee006 continuation and Cindy early Shift: {second_day_events}")
        print(json.dumps({"verified": True, "previousDaySegment": "22:00-24:00",
                          "nextDaySegment": "00:00-02:00", "nextDayEarlyShiftAlsoVisible": True}))
    finally:
        browser.close()
