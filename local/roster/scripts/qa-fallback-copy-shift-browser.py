"""Copy a repeated-hour shift to another Sydney fallback date in Chromium."""

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


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        for _ in range(6):
            page.get_by_role("button", name="上一页").click()
        source_day = page.locator('.fc-daygrid-day[data-date="2026-04-05"]')
        expect(source_day).to_be_visible()
        source_day.locator(".fc-event").filter(has_text="HandoverEmployee006").click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("heading", name="编辑班次")).to_be_visible()
        dialog.get_by_role("button", name="其他班次操作").click()
        dialog.get_by_role("button", name="复制班次").click()
        expect(dialog.get_by_role("heading", name="复制班次")).to_be_visible()

        target = dialog.get_by_label("复制到日期")
        target.fill("2026-04-12")
        expect(dialog.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_disabled()
        target.fill("2027-04-04")
        expect(dialog.get_by_role("combobox", name="结束时间出现两次")).to_contain_text("第二次 02:30")
        expect(dialog.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_enabled()
        dialog.get_by_role("button", name=re.compile(r"^保存班次")).click()
        expect(dialog).to_have_count(0)

        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        for _ in range(6):
            page.get_by_role("button", name="下一页").click()
        target_day = page.locator('.fc-daygrid-day[data-date="2027-04-04"]')
        expect(target_day.locator(".fc-event").filter(has_text="HandoverEmployee006")).to_be_visible()
        print(json.dumps({"verified": True, "invalidNormalDateBlocked": True,
                          "secondOccurrenceRetained": True, "copiedAndReloaded": True}))
    finally:
        browser.close()
