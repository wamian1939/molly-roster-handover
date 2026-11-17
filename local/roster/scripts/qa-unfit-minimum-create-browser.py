"""Reject Month and toolbar create defaults when store hours cannot fit the minimum."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append(request.url) if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        cell = page.locator('.fc-daygrid-day[data-date="2026-10-11"]')
        cell.locator(".fc-daygrid-day-frame").click(position={"x": 20, "y": 30})
        expect(page.get_by_role("alert").filter(has_text="营业时段不足").last).to_be_visible()
        expect(page.get_by_role("dialog")).to_have_count(0)
        cell.locator(".fc-daygrid-day-number").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(page.get_by_role("alert").filter(has_text="营业时段不足")).to_have_count(0, timeout=10000)
        page.get_by_role("button", name="新增班次").click()
        expect(page.get_by_role("alert").filter(has_text="营业时段不足").last).to_be_visible()
        expect(page.get_by_role("dialog")).to_have_count(0)
        if mutations:
            raise AssertionError(f"Invalid create defaults sent Shift mutations: {len(mutations)}")
        print(json.dumps({"verified": True, "minimumMinutes": 900, "storeHours": "09:00-22:00",
                          "monthBlocked": True, "toolbarBlocked": True, "shiftMutationRequests": 0}))
    finally:
        browser.close()
