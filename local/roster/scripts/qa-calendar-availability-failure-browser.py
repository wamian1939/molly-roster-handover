"""Verify a failing Availability endpoint cannot blank Calendar, while Shift save stays gated."""

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
        availability_requests = []
        shift_writes = []

        def fail_availability(route):
            availability_requests.append(route.request.url)
            route.fulfill(status=503, content_type="application/json", body='{"message":"Availability fixture unavailable"}')

        page.route(re.compile(r"/api/roster/availability\?"), fail_availability)
        page.on("request", lambda request: shift_writes.append(request.url)
                if request.method in ("POST", "PATCH", "DELETE") and re.search(r"/api/roster/shifts(?:/|$)", request.url) else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-10", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]')).to_be_visible()
        assert not availability_requests, f"Unused Availability was requested during Calendar load: {availability_requests}"

        page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]').click(position={"x": 200, "y": 4})
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("alert")).to_contain_text("Availability fixture unavailable")
        expect(dialog.get_by_role("button", name=re.compile("保存班次"))).to_be_disabled()
        assert len(availability_requests) == 1, availability_requests
        assert not shift_writes, shift_writes

        page.unroute(re.compile(r"/api/roster/availability\?"), fail_availability)
        dialog.get_by_role("button", name="重试员工与可用时间").click()
        expect(dialog.get_by_role("alert")).to_have_count(0, timeout=15000)
        expect(dialog.get_by_role("button", name=re.compile("保存班次"))).to_be_enabled()
        dialog.get_by_role("button", name="取消").click()
        assert not shift_writes, shift_writes
        print(json.dumps({"verified": True, "calendarLoadedWithAvailability503": True,
                          "availabilityRequestedOnlyForDialog": True, "saveBlockedDuringFailure": True,
                          "retryRecovered": True, "shiftWrites": len(shift_writes)}))
    finally:
        browser.close()
