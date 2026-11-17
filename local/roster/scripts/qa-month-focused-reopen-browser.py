"""Verify Month Reopen writes only the period containing the focused store date."""

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
        page.on("request", lambda request: writes.append({"url": request.url, "body": request.post_data_json})
                if request.method == "POST" and re.search(r"/api/roster/periods/[^/]+/(?:publish|reopen)$", request.url) else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator("main aside").filter(has_text="已发布")).to_be_visible()
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/qa-published-period/reopen"), timeout=15000) as reopened:
            page.get_by_role("button", name="重新打开草稿").click()
        assert reopened.value.status == 200, (reopened.value.status, reopened.value.text())
        expect(page.locator("main aside").filter(has_text="草稿 · 可编辑")).to_be_visible(timeout=15000)
        assert page.url.endswith("date=2026-10-16"), page.url
        assert len(writes) == 1 and writes[0]["url"].endswith("/qa-published-period/reopen"), writes
        assert writes[0]["body"] == {"storeId": "browser-store", "version": 1}, writes
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator("main aside").filter(has_text="草稿 · 可编辑")).to_be_visible()
        print(json.dumps({"verified": True, "focusedDate": "2026-10-16", "reopenedPeriodId": "qa-published-period",
                          "expectedVersion": 1, "writeRequests": len(writes), "reloadRetainedFocus": True}))
    finally:
        browser.close()
