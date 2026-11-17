"""Drag a Month shift from the last day of a fortnight into the next."""

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
        page = browser.new_page(viewport={"width": 1600, "height": 1200}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        settings = page.context.request.put(f"{api}/roster/settings/browser-store", data={
            "storeId": "browser-store", "timezone": "Australia/Sydney", "openingTime": "09:00",
            "closingTime": "22:00", "slotIntervalMinutes": 30, "minimumShiftMinutes": 60,
            "defaultBreakMinutes": 30, "weekStartsOn": 1, "cycleType": "FORTNIGHT",
            "fortnightAnchorDate": "2026-10-26", "weeklyHourWarning": 38, "dailyHourWarning": 10,
        })
        if settings.status not in (200, 201):
            raise AssertionError(f"Could not configure fortnight: {settings.status} {settings.text()}")
        roles = page.context.request.get(f"{api}/roster/roles?storeId=browser-store")
        role = next(item for item in roles.json() if item["code"] == "qa-front")
        for date, previous in (("2026-11-08", "2026-11-07"), ("2026-11-09", "2026-11-08")):
            availability = page.context.request.put(f"{api}/roster/availability", data={
                "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": [date], "expectedRows": [],
                "entries": [{"date": date, "status": "AVAILABLE",
                             "startAt": f"{previous}T21:00:00.000Z", "endAt": f"{date}T07:00:00.000Z"}],
            })
            if availability.status not in (200, 201):
                raise AssertionError(f"Could not seed isolated Availability: {availability.status} {availability.text()}")
        created = page.context.request.post(f"{api}/roster/shifts/with-period", data={
            "storeId": "browser-store", "date": "2026-11-08",
            "targetStartDate": "2026-10-26", "targetEndDate": "2026-11-08",
            "startAt": "2026-11-07T23:00:00.000Z", "endAt": "2026-11-08T03:00:00.000Z",
            "breakMinutes": 30, "shiftRoleId": role["id"], "employeeIds": ["browser-HandoverEmployee006"],
        })
        if created.status != 201:
            raise AssertionError(f"Could not create isolated source Shift: {created.status} {created.text()}")
        shift_id = created.json()["id"]

        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        page.get_by_role("button", name="\u4e0b\u4e00\u9875").click()
        source = page.locator('.fc-daygrid-day[data-date="2026-11-08"] .fc-daygrid-event').first
        target = page.locator('.fc-daygrid-day[data-date="2026-11-09"]')
        expect(source).to_be_visible(timeout=15000)
        source.scroll_into_view_if_needed()
        origin = source.bounding_box()
        destination = target.bounding_box()
        if not origin or not destination:
            raise AssertionError("Month drag endpoints were not rendered")
        page.mouse.move(origin["x"] + origin["width"] / 2, origin["y"] + origin["height"] / 2)
        page.mouse.down()
        with page.expect_response(lambda response: response.request.method == "PATCH" and "/reposition" in response.url, timeout=15000) as moved:
            page.mouse.move(destination["x"] + destination["width"] / 2,
                            destination["y"] + min(45, destination["height"] / 2), steps=18)
            page.mouse.up()
        if moved.value.status != 200:
            raise AssertionError(f"Month drag failed: {moved.value.status} {moved.value.text()}")
        expect(page.locator('.fc-daygrid-day[data-date="2026-11-09"] .fc-daygrid-event').filter(has_text="HandoverEmployee006")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        page.get_by_role("button", name="\u4e0b\u4e00\u9875").click()
        expect(page.locator('.fc-daygrid-day[data-date="2026-11-09"] .fc-daygrid-event').filter(has_text="HandoverEmployee006")).to_be_visible(timeout=15000)
        calendar = page.context.request.get(f"{api}/roster/calendar?storeId=browser-store&from=2026-11-08&to=2026-11-09")
        shifted = next((item for item in calendar.json()["shifts"] if item["id"] == shift_id), None)
        if not shifted or shifted["date"] != "2026-11-09" or shifted["startAt"] != "2026-11-08T23:00:00.000Z" or shifted["endAt"] != "2026-11-09T03:00:00.000Z":
            raise AssertionError(f"Month move did not persist the exact four-hour interval: {calendar.text()}")
        print(json.dumps({"verified": True, "shiftId": shift_id, "source": "2026-11-08",
                          "target": "2026-11-09", "durationHours": 4, "reloaded": True}))
    finally:
        browser.close()
