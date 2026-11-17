"""Read-only browser check: a failed period summary leaves Calendar visible and publication gated."""

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
        page = browser.new_page(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        summary_requests = []
        writes = []

        def fail_summary(route):
            summary_requests.append(route.request.url)
            route.fulfill(status=503, content_type="application/json", body='{"message":"Summary fixture unavailable"}')

        page.route(re.compile(r"/api/roster/periods/[^/]+/summary(?:\?|$)"), fail_summary)
        page.on("request", lambda request: writes.append(request.url)
                if request.method in ("POST", "PATCH", "DELETE") and "/api/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-event")).not_to_have_count(0)
        expect(page.get_by_role("alert").filter(has_text="周期数据暂不可用")).to_be_visible()
        expect(page.get_by_role("button", name=re.compile("发布本"))).to_have_count(0)
        assert summary_requests, "Summary request was not intercepted"
        assert not writes, f"Browser made an unexpected Roster write: {writes}"

        page.unroute(re.compile(r"/api/roster/periods/[^/]+/summary(?:\?|$)"), fail_summary)
        page.get_by_role("alert").filter(has_text="周期数据暂不可用").get_by_role("button", name="重试").click()
        expect(page.get_by_role("alert").filter(has_text="周期数据暂不可用")).to_have_count(0, timeout=15000)
        expect(page.get_by_role("button", name=re.compile("发布本"))).to_be_visible(timeout=15000)
        expect(page.locator(".fc-event")).not_to_have_count(0)
        assert not writes, f"Browser made an unexpected Roster write: {writes}"
        print(json.dumps({"verified": True, "summaryFailures": len(summary_requests),
                          "calendarVisibleDuringFailure": True, "publishHiddenDuringFailure": True,
                          "retryRestoredSummary": True, "rosterWrites": len(writes)}))
    finally:
        browser.close()
