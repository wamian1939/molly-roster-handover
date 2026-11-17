"""Keep a distant Scheduled Shift date click from requesting years of roster data."""

import json
import re
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
        calendar_reads = []
        roster_writes = []

        def observe(request):
            if "/api/roster/calendar?" in request.url and request.method == "GET":
                calendar_reads.append(request.url)
            if "/api/roster/" in request.url and request.method in ("POST", "PUT", "PATCH", "DELETE"):
                roster_writes.append(request.url)

        page.on("request", observe)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-21",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="查看工时侧栏").click()
        sidebar = page.locator("#calendar-scheduled-sidebar")
        expect(sidebar).to_be_visible()
        expect(sidebar.get_by_role("button", name="2026-10-21")).to_have_attribute("aria-pressed", "true")
        sidebar.get_by_label("选择年份").select_option("2100")
        expect(sidebar.get_by_role("button", name="2100-10-01")).to_be_visible()
        page.wait_for_load_state("networkidle")
        reads_before_click = len(calendar_reads)
        sidebar.get_by_role("button", name="2100-10-01").click()
        expect(sidebar.get_by_role("alert")).to_contain_text("最多选择连续 366 天")
        expect(sidebar.get_by_text("已选 1 天")).to_be_visible()
        assert len(calendar_reads) == reads_before_click, calendar_reads[reads_before_click:]
        assert roster_writes == [], roster_writes
        print(json.dumps({"verified": True, "distantDateRejected": True,
                          "extraCalendarReads": len(calendar_reads) - reads_before_click,
                          "rosterWrites": len(roster_writes)}))
    finally:
        browser.close()
