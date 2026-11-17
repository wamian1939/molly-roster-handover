"""Verify published-period create gestures reach the UI lock in disposable Chromium."""

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
        published = page.locator('.fc-daygrid-day[data-date="2026-10-16"]')
        published.locator(".fc-daygrid-day-frame").click(position={"x": 20, "y": 30})
        expect(page.get_by_text("该排班已发布", exact=True).first).to_be_visible()
        expect(page.get_by_role("dialog")).to_have_count(0)
        published.locator(".fc-daygrid-day-number").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        day_column = page.locator('.fc-timegrid-col[data-date="2026-10-16"]')
        day_column.click(position={"x": 30, "y": 100})
        expect(page.get_by_text("该排班已发布", exact=True).first).to_be_visible()
        expect(page.get_by_role("dialog")).to_have_count(0)
        box = day_column.bounding_box()
        assert box is not None
        page.mouse.move(box["x"] + 30, box["y"] + 100)
        page.mouse.down()
        page.mouse.move(box["x"] + 30, box["y"] + 160, steps=5)
        page.mouse.up()
        expect(page.get_by_role("dialog")).to_have_count(0)
        page.get_by_role("button", name="新增班次").click()
        expect(page.get_by_text("该排班已发布", exact=True).first).to_be_visible()
        expect(page.get_by_role("dialog")).to_have_count(0)
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-timegrid-col[data-date="2026-10-16"]').click(position={"x": 30, "y": 100})
        expect(page.get_by_text("该排班已发布", exact=True).first).to_be_visible()
        expect(page.get_by_role("dialog")).to_have_count(0)
        print(json.dumps({"verified": True, "publishedDate": "2026-10-16", "monthDayWeekBlocked": True,
                          "topbarBlocked": True, "dayDragNoDraft": True}))
    finally:
        browser.close()
