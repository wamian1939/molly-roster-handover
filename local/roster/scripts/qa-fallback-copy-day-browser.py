"""Exercise Copy Day preview and commit across Sydney's repeated hour."""

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
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")

        page.get_by_role("button", name="复制一天").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        dialog.get_by_label("来源日期").fill("2026-04-05")
        dialog.get_by_label("目标日期").fill("2026-04-12")
        dialog.get_by_role("button", name="检查冲突").click()
        expect(dialog.get_by_role("alert")).to_contain_text("结束时间必须晚于开始时间")
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()

        dialog.get_by_label("目标日期").fill("2027-04-04")
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()
        dialog.get_by_role("button", name="检查冲突").click()
        expect(dialog.get_by_text("所有班次均可复制")).to_be_visible()
        expect(dialog.get_by_text("1/1")).to_be_visible()
        dialog.get_by_role("button", name="复制为草稿").click()
        expect(dialog).to_have_count(0)
        expect(page.get_by_text("已复制一天")).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")

        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        for _ in range(6):
            page.get_by_role("button", name="下一页").click()
        expect(page.locator('.fc-daygrid-day[data-date="2027-04-04"]')).to_be_visible()
        expect(page.locator('.fc-daygrid-day[data-date="2027-04-04"] .fc-event').filter(has_text="HandoverEmployee006")).to_be_visible()
        print(json.dumps({"verified": True, "blockedNormalDay": True,
                          "fallbackPreview": "1/1", "copiedAndReloaded": True}))
    finally:
        browser.close()
