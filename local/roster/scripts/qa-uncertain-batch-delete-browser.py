"""Verify a committed batch deletion with malformed success JSON clears stale selection."""

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
            if response.status == 200:
                route.fulfill(status=200, content_type="application/json", body="{broken")
            else:
                route.fulfill(response=response)

        page.route("**/api/roster/batch/delete", corrupt_after_commit)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="批量", exact=True).click()
        page.locator(".fc-event").filter(has_text="QA Front").first.click()
        expect(page.get_by_text("已选 2 个")).to_be_visible()
        page.get_by_role("button", name="批量删除").click()
        page.get_by_role("button", name="确认删除 2 个").click()
        expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=15000)
        expect(page.get_by_text("已选 0 个")).to_be_visible(timeout=15000)
        expect(page.get_by_role("button", name="批量删除")).to_be_disabled()
        expect(page.locator(".fc-event")).to_have_count(0, timeout=15000)
        assert writes == [200], writes
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        print(json.dumps({"verified": True, "committedStatus": 200, "malformedBody": True,
                          "selectionCleared": True, "requests": len(writes), "reloadSucceeded": True}))
    finally:
        browser.close()
