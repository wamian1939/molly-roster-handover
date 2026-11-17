"""Day and Week show a full clock while store hours still govern creation."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
configured = api.put("http://127.0.0.1:4035/api/roster/settings/browser-store", json={
    "storeId": "browser-store", "timezone": "Australia/Sydney", "openingTime": "09:00",
    "closingTime": "22:00", "slotIntervalMinutes": 30, "minimumShiftMinutes": 30,
    "defaultBreakMinutes": 0, "weekStartsOn": 1, "cycleType": "WEEK",
    "fortnightAnchorDate": None, "weeklyHourWarning": 38, "dailyHourWarning": 10,
})
assert configured.status_code == 200, configured.text
settings_before = api.get("http://127.0.0.1:4035/api/roster/settings", params={"storeId": "browser-store"}).json()
calendar_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params={
    "storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-09",
}).json()


def click_slot(page, date, clock):
    lane = page.locator(f'.fc-timegrid-slot-lane[data-time="{clock}:00"]')
    lane.scroll_into_view_if_needed()
    lane_box = lane.bounding_box()
    column_box = page.locator(f'.fc-timegrid-col[data-date="{date}"]').bounding_box()
    assert lane_box and column_box
    page.mouse.click(column_box["x"] + column_box["width"] * 0.6,
                     lane_box["y"] + lane_box["height"] * 0.5)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator('.fc-timegrid-slot-lane[data-time="00:00:00"]')).to_have_count(1)
        expect(page.locator('.fc-timegrid-slot-lane[data-time="23:30:00"]')).to_have_count(1)
        click_slot(page, "2026-10-09", "07:30")
        expect(page.get_by_role("dialog")).to_have_count(0)
        click_slot(page, "2026-10-09", "14:00")
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        assert [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)] == ["14:00", "14:30"]
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator('.fc-timegrid-slot-lane[data-time="00:00:00"]')).to_have_count(1)
        expect(page.locator('.fc-timegrid-slot-lane[data-time="23:30:00"]')).to_have_count(1)
        assert not writes, writes
        assert api.get("http://127.0.0.1:4035/api/roster/settings", params={"storeId": "browser-store"}).json() == settings_before
        assert api.get("http://127.0.0.1:4035/api/roster/calendar", params={
            "storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-09",
        }).json() == calendar_before
        print(json.dumps({"verified": True, "dayAndWeekRange": "00:00-24:00",
                          "outsideStoreHoursBlocked": True, "insideStoreHoursClickPrefill": ["14:00", "14:30"],
                          "rosterWrites": 0, "settingsAndCalendarDataUnchanged": True}))
    finally:
        browser.close()
