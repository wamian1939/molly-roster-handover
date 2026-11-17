"""Verify committed Repeat Shift with malformed success JSON closes its stale dialog."""

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
        writes = []

        def corrupt_after_commit(route):
            response = route.fetch()
            writes.append(response.status)
            if response.status == 201:
                route.fulfill(status=201, content_type="application/json", body="{broken")
            else:
                route.fulfill(response=response)

        page.route("**/api/roster/batch/repeat", corrupt_after_commit)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-event').first.click()
        group = page.get_by_role("dialog")
        group.get_by_role("button", name=re.compile("Regular Bob")).click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_role("button", name="其他班次操作").click()
        expect(dialog.get_by_role("button", name="重复班次")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="重复班次").click()
        repeat = page.get_by_role("dialog")
        repeat.get_by_label("重复至").fill("2026-10-10")
        repeat.get_by_label("周六").check()
        repeat.get_by_role("button", name="检查冲突").click()
        expect(repeat.get_by_text("全部目标日期可用")).to_be_visible(timeout=15000)
        repeat.get_by_role("button", name="生成草稿").click()
        expect(repeat).to_have_count(0, timeout=15000)
        expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=15000)
        assert writes == [201], writes
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        print(json.dumps({"verified": True, "committedStatus": 201, "malformedBody": True,
                          "staleDialogClosed": True, "requests": len(writes), "reloadSucceeded": True}))
    finally:
        browser.close()
