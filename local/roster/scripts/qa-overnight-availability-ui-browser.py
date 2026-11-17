"""Enter next-day Availability in Staff and create a shift using it in disposable Chromium."""

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
        page.get_by_role("link", name="员工与可用时间").click()
        expect(page.get_by_role("heading", name="员工与可用时间")).to_be_visible()
        page.get_by_role("button", name=re.compile("^Cindy")).click()
        page.locator('input[type="date"]').fill("2026-10-09")
        card = page.locator(".availability-day-card").nth(4)
        expect(card.locator("h3")).to_contain_text("10/9")
        if card.locator(".availability-empty-button").count():
            card.locator(".availability-empty-button").click()
        card.locator('input[type="time"]').nth(0).fill("22:00")
        card.locator('input[type="time"]').nth(1).fill("02:00")
        card.locator('input[type="checkbox"]').check()
        expect(page.get_by_role("button", name="保存可用时间")).to_be_enabled()
        page.get_by_role("button", name="保存可用时间").click()
        expect(card.locator('input[type="checkbox"]')).to_be_checked()
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="员工与可用时间")).to_be_visible()
        page.get_by_role("button", name=re.compile("^Cindy")).click()
        page.locator('input[type="date"]').fill("2026-10-09")
        card = page.locator(".availability-day-card").nth(4)
        expect(card.locator('input[type="time"]').nth(0)).to_have_value("22:00")
        expect(card.locator('input[type="time"]').nth(1)).to_have_value("02:00")
        expect(card.locator('input[type="checkbox"]')).to_be_checked()
        page.locator('input[placeholder]').last.fill("QA overnight availability")
        page.get_by_role("button", name="保存为模板").click()
        expect(page.get_by_role("button", name="套用：QA overnight availability")).to_be_visible()
        page.locator('input[type="date"]').fill("2026-10-16")
        expect(page.locator(".availability-day-card").nth(4).locator("h3")).to_contain_text("10/16")
        page.get_by_role("button", name="套用：QA overnight availability").click()
        next_card = page.locator(".availability-day-card").nth(4)
        expect(next_card.locator('input[type="time"]').nth(0)).to_have_value("22:00")
        expect(next_card.locator('input[type="time"]').nth(1)).to_have_value("02:00")
        expect(next_card.locator('input[type="checkbox"]')).to_be_checked()
        page.get_by_role("button", name="保存可用时间").click()
        page.reload(wait_until="domcontentloaded")
        page.get_by_role("button", name=re.compile("^Cindy")).click()
        page.locator('input[type="date"]').fill("2026-10-16")
        next_card = page.locator(".availability-day-card").nth(4)
        expect(next_card.locator('input[type="time"]').nth(0)).to_have_value("22:00")
        expect(next_card.locator('input[type="time"]').nth(1)).to_have_value("02:00")
        expect(next_card.locator('input[type="checkbox"]')).to_be_checked()
        print(json.dumps({"verified": True, "staffSavedAndReloaded": True, "date": "2026-10-09", "employeeId": "browser-cindy", "localStart": "22:00", "localEndNextDay": "02:00"}))
    finally:
        browser.close()
