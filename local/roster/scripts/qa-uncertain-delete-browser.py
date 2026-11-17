"""Verify a committed DELETE whose response is lost reconciles the edit dialog."""

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

        def lose_committed_response(route):
            response = route.fetch()
            writes.append(response.status)
            if response.status == 204:
                route.abort("failed")
            else:
                route.fulfill(response=response)

        page.route(re.compile(r"/api/roster/shifts/qa-draft-shift\?"), lambda route: lose_committed_response(route) if route.request.method == "DELETE" else route.continue_())
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
        dialog.get_by_role("button", name="删除班次").click()
        dialog.get_by_role("button", name="确认删除").click()
        expect(dialog).to_have_count(0, timeout=15000)
        expect(page.get_by_text("\u73ed\u6b21\u5df2\u4e0d\u5b58\u5728")).to_be_visible(timeout=15000)
        assert writes == [204], writes
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        print(json.dumps({"verified": True, "committedStatus": 204, "responseLost": True,
                          "staleEditorClosed": True, "requests": len(writes), "reloadSucceeded": True}))
    finally:
        browser.close()
