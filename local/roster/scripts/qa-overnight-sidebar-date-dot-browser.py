"""An overnight Day continuation should be visible in the Scheduled Shift mini calendar."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        errors = []
        page.on("request", lambda request: writes.append(request.url) if
                request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/" in request.url else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-11-01",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.get_by_role("region", name="跨日延续班次")).to_contain_text("Regular Bob")
        page.get_by_role("button", name="查看工时侧栏").click()
        sidebar = page.get_by_role("complementary", name="已排班次侧栏")
        expect(sidebar).to_be_visible()
        start = sidebar.get_by_role("button", name="2026-10-31")
        continuation = sidebar.get_by_role("button", name="2026-11-01")
        expect(start.locator(".calendar-scheduled-date-dot")).to_have_count(1, timeout=15000)
        expect(continuation.locator(".calendar-scheduled-date-dot")).to_have_count(1)
        expect(continuation).to_have_attribute("title", re.compile("跨天班次延续"))
        expect(sidebar).to_contain_text("工时按班次开始日期统计")
        start.click()
        start.click()
        expect(sidebar).to_contain_text("Regular Bob")
        expect(sidebar).to_contain_text("4h")
        employee_card = sidebar.locator(".calendar-scheduled-employee").filter(has_text="Regular Bob")
        employee_card.locator(".calendar-scheduled-worklog-toggle").click()
        expect(employee_card.locator(".calendar-scheduled-worklog")).to_contain_text("22:00–11月1日 02:00")
        assert not writes and not errors, {"writes": writes, "errors": errors}
        print(json.dumps({"verified": True, "startAndContinuationDots": True,
                          "startDateHours": "4h", "localOvernightEndDateShown": True,
                          "continuationAttributionExplained": True,
                          "rosterWrites": len(writes), "pageErrors": len(errors)}))
    finally:
        browser.close()
