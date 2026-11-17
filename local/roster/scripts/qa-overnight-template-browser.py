"""Save a next-day shift from a template in disposable local Chromium."""

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
        page.get_by_role("button", name="新增班次").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("textbox", name="开始时间")).to_have_value("18:00")
        expect(dialog.get_by_role("textbox", name="结束时间")).to_have_value("19:00")
        expect(dialog.get_by_text("10月9日星期五")).to_be_visible()
        dialog.get_by_role("button", name=re.compile("QA Night.*22:00-02:00")).click()
        expect(dialog.get_by_role("textbox", name="开始时间")).to_have_value("22:00")
        expect(dialog.get_by_role("textbox", name="结束时间")).to_have_value("02:00")
        expect(dialog.get_by_role("checkbox", name="次日结束")).to_be_checked()
        dialog.get_by_role("button", name=re.compile(r"^Cindy ")).click()
        dialog.get_by_role("textbox", name="公开备注").fill("Overnight template QA")
        dialog.get_by_role("button", name=re.compile("^保存班次")).click()
        expect(dialog).to_have_count(0)
        expect(page.locator(".fc-event").filter(has_text="Cindy")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(page.locator(".fc-event").filter(has_text="Cindy")).to_be_visible()
        print(json.dumps({"verified": True, "date": "2026-10-09", "employeeId": "browser-cindy",
                          "template": "QA Night", "localStart": "22:00", "localEndNextDay": "02:00",
                          "savedAndReloaded": True}))
    finally:
        browser.close()
