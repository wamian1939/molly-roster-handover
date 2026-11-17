"""Check Month summary and Copy target belong to the focused date's roster period."""

import json
import re
import sys
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
        summary_periods = []
        mutations = []
        copy_previews = []
        page.on("request", lambda request: mutations.append(request.url) if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/api/roster/" in request.url and not request.url.endswith("/preview") else None)
        page.on("request", lambda request: copy_previews.append(request.post_data_json) if request.url.endswith("/roster/batch/copy/preview") else None)
        page.on("response", lambda response: summary_periods.append(re.search(r"/periods/([^/]+)/summary(?:\?|$)", response.url).group(1)) if re.search(r"/periods/([^/]+)/summary(?:\?|$)", response.url) else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator('.fc-daygrid-day[data-date="2026-10-16"]')).to_be_visible()
        summary = page.locator("main aside").last.inner_text()
        result = {"url": page.url, "summary": summary, "summaryRequests": summary_periods,
                  "rosterMutations": len(mutations)}
        if "--observe" in sys.argv:
            print(json.dumps(result, ensure_ascii=True))
        else:
            assert "已发布" in summary, result
            assert summary_periods and summary_periods[-1] == "qa-published-period", result
            assert page.url.endswith("date=2026-10-16"), result
            page.get_by_role("button", name="复制到下一周期").click()
            expect(page.get_by_role("dialog")).to_be_visible(timeout=15000)
            assert copy_previews and copy_previews[-1]["sourcePeriodId"] == "qa-published-period", copy_previews
            assert copy_previews[-1]["targetStartDate"] == "2026-10-19", copy_previews
            page.get_by_role("dialog").get_by_role("button", name="取消").click()
            page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-23", wait_until="domcontentloaded")
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            expect(page.locator("main aside")).to_have_count(0)
            assert page.url.endswith("date=2026-10-23"), page.url
            assert not mutations, result
            print(json.dumps({"verified": True, "focusedDate": "2026-10-16",
                              "summaryPeriod": "qa-published-period", "copyTarget": "2026-10-19",
                              "unscheduledFocusHasNoPeriodActions": True, "rosterMutations": 0}))
    finally:
        browser.close()
