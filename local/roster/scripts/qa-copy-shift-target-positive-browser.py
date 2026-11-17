"""Copy a draft Shift to another date and employee after target Calendar preflight."""

import json
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
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
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        if "--verify-only" in sys.argv:
            expect(page.locator(".fc-event").filter(has_text="HandoverEmployee006")).to_be_visible(timeout=15000)
            print(json.dumps({"verified": True, "persistedAfterNewBrowser": True}))
            sys.exit(0)
        page.locator(".fc-event").filter(has_text="Regular Bob").first.click()
        dialog = page.get_by_role("dialog")
        if dialog.get_by_role("button", name=re.compile("Regular Bob.*班次记录")).count():
            dialog.get_by_role("button", name=re.compile("Regular Bob.*班次记录")).click()
        expect(dialog.get_by_role("heading", name="编辑班次")).to_be_visible()
        dialog.get_by_role("button", name="其他班次操作").click()
        dialog.get_by_role("button", name="复制班次").click()
        expect(dialog.get_by_role("heading", name="复制班次")).to_be_visible()
        dialog.get_by_label("复制到日期").fill("2026-10-10")
        expect(dialog.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_enabled(timeout=15000)
        dialog.get_by_role("button", name=re.compile(r"^Regular Bob ")).click()
        dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006 ")).click()
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/shifts/with-period")) as saved:
            dialog.get_by_role("button", name=re.compile(r"^保存班次")).click()
        assert saved.value.status == 201, (saved.value.status, saved.value.text())
        expect(dialog).to_have_count(0)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        expect(page.locator(".fc-event").filter(has_text="HandoverEmployee006")).to_be_visible(timeout=15000)
        print(json.dumps({"verified": True, "targetDate": "2026-10-10", "targetEmployee": "browser-HandoverEmployee006", "savedAndReloaded": True}))
    finally:
        browser.close()
