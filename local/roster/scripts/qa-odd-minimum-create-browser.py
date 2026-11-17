"""Verify Month and toolbar create defaults align a non-slot-multiple minimum."""

import json
import re
import tempfile
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


def assert_prefill(dialog):
    expect(dialog).to_be_visible()
    values = [dialog.locator('input[type="time"]').nth(i).input_value() for i in range(2)]
    if values != ["09:00", "10:30"]:
        raise AssertionError(f"65-minute minimum on 30-minute grid gave {values}; expected 09:00-10:30")
    return values


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
        cell = page.locator('.fc-daygrid-day[data-date="2026-10-10"]')
        cell.locator(".fc-daygrid-day-frame").click(position={"x": 20, "y": 30})
        dialog = page.get_by_role("dialog")
        month_values = assert_prefill(dialog)
        dialog.get_by_role("button", name="取消").click()

        cell.locator(".fc-daygrid-day-number").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="新增班次").click()
        toolbar_values = assert_prefill(dialog)
        dialog.get_by_role("button", name="取消").click()

        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        cell = page.locator('.fc-daygrid-day[data-date="2026-10-10"]')
        cell.locator(".fc-daygrid-day-frame").click(position={"x": 20, "y": 30})
        assert_prefill(dialog)
        dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b")).click()
        dialog.locator("textarea").first.fill("Odd minimum QA")
        dialog.locator("footer button").last.click()
        expect(dialog).to_have_count(0)
        page.reload(wait_until="domcontentloaded")
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(page.locator('.fc-daygrid-day[data-date="2026-10-10"]').get_by_text("HandoverEmployee006", exact=False)).to_be_visible()
        print(json.dumps({"verified": True, "minimumMinutes": 65, "slotMinutes": 30,
                          "monthPrefill": month_values, "toolbarPrefill": toolbar_values,
                          "savedAndReloaded": True}))
    finally:
        browser.close()
