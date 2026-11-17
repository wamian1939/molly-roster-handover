"""Save a spring-forward Day drag using visible wall-clock slots in disposable databases."""

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

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code in (201, 409), job.text

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
query = {"storeId": "browser-store", "from": "2026-10-04", "to": "2026-10-04"}
before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=query).json()
availability = api.put("http://127.0.0.1:4035/api/roster/availability", json={
    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-04"],
    "expectedRows": [], "entries": [{"date": "2026-10-04", "status": "AVAILABLE",
                                  "startAt": "2026-10-03T16:00:00.000Z", "endAt": "2026-10-04T09:00:00.000Z"}],
})
assert availability.status_code in (200, 201), availability.text

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-04", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        start = page.locator('.fc-timegrid-slot-lane[data-time="05:00:00"]')
        end = page.locator('.fc-timegrid-slot-lane[data-time="05:30:00"]')
        start.scroll_into_view_if_needed()
        start_box, end_box = start.bounding_box(), end.bounding_box()
        column_box = page.locator('.fc-timegrid-col[data-date="2026-10-04"]').bounding_box()
        assert start_box and end_box and column_box
        x = column_box["x"] + column_box["width"] * 0.6
        page.mouse.move(x, start_box["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, end_box["y"] + end_box["height"] - 3, steps=12)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        assert [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)] == ["05:00", "06:00"]
        dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b")).click()
        dialog.locator("textarea").first.fill("DST grid QA")
        dialog.locator("footer button").last.click()
        expect(dialog).to_have_count(0, timeout=10000)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="05:00–06:00")).to_be_visible()
        after = api.get("http://127.0.0.1:4035/api/roster/calendar", params=query).json()
        assert len(after["shifts"]) == len(before["shifts"]) + 1
        created = [shift for shift in after["shifts"] if shift.get("publicNote") == "DST grid QA"]
        assert len(created) == 1
        assert (created[0]["startAt"], created[0]["endAt"]) == (
            "2026-10-03T18:00:00.000Z", "2026-10-03T19:00:00.000Z")
        assert [row["employeeId"] for row in created[0]["assignments"]] == ["browser-HandoverEmployee006"]
        print(json.dumps({"verified": True, "date": "2026-10-04", "visibleClock": "05:00-06:00",
                          "startAt": created[0]["startAt"], "endAt": created[0]["endAt"], "oneShift": True}))
    finally:
        browser.close()
