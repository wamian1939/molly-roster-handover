"""Verify equal-time published Shifts keep distinct frozen role labels in Calendar."""

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
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        day = page.locator('.fc-daygrid-day[data-date="2026-10-16"]')
        cards = day.locator(".fc-daygrid-event")
        expect(cards).to_have_count(2, timeout=10000)
        expect(cards.filter(has_text="QA Front")).to_have_count(1)
        expect(cards.filter(has_text="QA Historical")).to_have_count(1)
        cards.filter(has_text="QA Historical").click()
        detail = page.get_by_role("dialog")
        expect(detail).to_contain_text("QA Historical")
        detail.get_by_role("button", name="关闭班次详情").click()
        cards.filter(has_text="QA Front").click()
        detail = page.get_by_role("dialog")
        expect(detail).to_contain_text("QA Front")
        detail.get_by_role("button", name="关闭班次详情").click()
        assert writes == [], writes
        print(json.dumps({"verified": True, "distinctMonthCards": 2, "detailSnapshotsCorrect": True,
                          "pageRosterWrites": 0}))
    finally:
        browser.close()
