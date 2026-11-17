"""Check that a prior WEEK is not selected by Copy Previous Fortnight."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Expected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Expected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]
api = "http://127.0.0.1:4035/api"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        week = page.context.request.post(f"{api}/roster/periods", data={
            "storeId": "browser-store", "startDate": "2026-10-19", "endDate": "2026-10-25", "cycleType": "WEEK",
        })
        if week.status != 201:
            raise AssertionError(f"Could not create isolated prior WEEK: {week.status} {week.text()}")
        settings = page.context.request.put(f"{api}/roster/settings/browser-store", data={
            "storeId": "browser-store", "timezone": "Australia/Sydney", "openingTime": "09:00",
            "closingTime": "22:00", "slotIntervalMinutes": 30, "minimumShiftMinutes": 60,
            "defaultBreakMinutes": 30, "weekStartsOn": 1, "cycleType": "FORTNIGHT",
            "fortnightAnchorDate": "2026-10-26", "weeklyHourWarning": 38, "dailyHourWarning": 10,
        })
        if settings.status not in (200, 201):
            raise AssertionError(f"Could not set isolated FORTNIGHT rules: {settings.status} {settings.text()}")

        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-26"] .fc-daygrid-day-number').click()
        expect(page.locator(".fc-timegrid")).to_be_visible()
        requests = []
        page.on("request", lambda request: requests.append(request.url) if "/roster/batch/copy/preview" in request.url else None)
        page.get_by_role("button", name="\u590d\u5236\u4e0a\u4e00\u53cc\u5468").click()
        expect(page.get_by_text("\u4e0a\u4e00\u53cc\u5468\u6ca1\u6709\u53ef\u590d\u5236\u7684\u6392\u73ed\u5468\u671f")).to_be_visible()
        if requests:
            raise AssertionError(f"A WEEK period was sent to Copy Fortnight preview: {requests}")
        periods = page.context.request.get(f"{api}/roster/periods?storeId=browser-store&from=2026-10-12&to=2026-11-08")
        if periods.status != 200 or len(periods.json()) != 2:
            raise AssertionError(f"Unexpected period mutation: {periods.status} {periods.text()}")
        print(json.dumps({"verified": True, "priorWeek": "2026-10-19/2026-10-25",
                          "targetFortnight": "2026-10-26/2026-11-08", "previewRequests": len(requests),
                          "periodCount": len(periods.json())}))
    finally:
        browser.close()
