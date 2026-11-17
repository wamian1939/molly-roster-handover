"""Save an early shift covered only by previous-day Availability in disposable Chromium."""

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
        availability_reads = []
        page.on("request", lambda request: availability_reads.append(request.url)
                if request.method == "GET" and "/roster/availability?" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="新增班次").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        dialog.locator('input[type="time"]').nth(0).fill("00:00")
        dialog.locator('input[type="time"]').nth(1).fill("02:00")
        cindy = dialog.get_by_role("button", name=re.compile(r"^Cindy\b"))
        expect(cindy).to_be_enabled()
        cindy.click()
        dialog.get_by_role("textbox", name="公开备注").fill("Previous-day availability QA")
        dialog.get_by_role("button", name=re.compile(r"^保存班次")).click()
        expect(dialog).to_have_count(0)
        expect(page.locator(".fc-timegrid-event").filter(has_text="Cindy")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        cell = page.locator('.fc-daygrid-day[data-date="2026-10-10"]')
        expect(cell.locator(".fc-event").filter(has_text="Cindy")).to_be_visible()
        if not any("from=2026-10-09" in url and "to=2026-10-11" in url for url in availability_reads):
            raise AssertionError("Dialog did not request previous-day Availability")
        print(json.dumps({"verified": True, "date": "2026-10-10", "employeeId": "browser-cindy",
                          "localStart": "00:00", "localEnd": "02:00", "previousDayAvailabilityRead": True,
                          "savedAndReloaded": True, "dayVisibleAfterSave": True}))
    finally:
        browser.close()
