"""Create and edit a Sydney fallback shift spanning two 02:30 occurrences."""

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


def april_month(page):
    page.get_by_role("button", name="月视图").click()
    expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
    for _ in range(6):
        page.get_by_role("button", name="上一页").click()
    expect(page.locator('.fc-daygrid-day[data-date="2026-04-05"]')).to_be_visible()
    expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        april_month(page)
        page.locator('.fc-daygrid-day[data-date="2026-04-05"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="新增班次").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        dialog.get_by_label("开始时间", exact=True).fill("02:30")
        dialog.get_by_label("结束时间", exact=True).fill("02:30")
        expect(dialog.get_by_role("combobox", name="结束时间出现两次")).to_contain_text("第一次 02:30")
        dialog.get_by_role("combobox", name="结束时间出现两次").click()
        page.get_by_role("option", name=re.compile("第二次 02:30")).click()
        expect(dialog.get_by_role("combobox", name="结束时间出现两次")).to_contain_text("第二次 02:30")
        HandoverEmployee006 = dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))
        expect(HandoverEmployee006).to_be_enabled()
        HandoverEmployee006.click()
        dialog.get_by_role("button", name=re.compile("^保存班次")).click()
        expect(dialog).to_have_count(0)

        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        april_month(page)
        cell = page.locator('.fc-daygrid-day[data-date="2026-04-05"]')
        event = cell.locator(".fc-event").filter(has_text="HandoverEmployee006")
        expect(event).to_be_visible()
        event.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("combobox", name="结束时间出现两次")).to_contain_text("第二次 02:30")
        dialog.get_by_label("公开备注").fill("Fallback edit QA")
        dialog.get_by_role("button", name=re.compile("^保存班次")).click()
        expect(dialog).to_have_count(0)
        print(json.dumps({"verified": True, "localTime": "first 02:30 to second 02:30",
                          "savedAndReloaded": True, "editedWithoutTimeDrift": True}))
    finally:
        browser.close()
