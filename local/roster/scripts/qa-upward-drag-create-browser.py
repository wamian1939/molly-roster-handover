"""Persist a Day-view drag selection that starts later and moves upward."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code in (201, 409), job.text

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
availability_rows = api.get("http://127.0.0.1:4035/api/roster/availability", params={
    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "from": "2026-10-10", "to": "2026-10-10",
}).json()
if not availability_rows:
    availability = api.put("http://127.0.0.1:4035/api/roster/availability", json={
        "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
        "expectedRows": [], "entries": [{"date": "2026-10-10", "status": "AVAILABLE",
                                      "startAt": "2026-10-09T22:00:00.000Z", "endAt": "2026-10-10T07:00:00.000Z"}],
    })
    assert availability.status_code in (200, 201), availability.text

target_query = {"storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10"}
target_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=target_query).json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        shift_writes = []
        page.on("request", lambda request: shift_writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")

        def check_unsaved_direction(first_clock, last_clock, expected, upward):
            first_lane = page.locator(f'.fc-timegrid-slot-lane[data-time="{first_clock}:00"]')
            last_lane = page.locator(f'.fc-timegrid-slot-lane[data-time="{last_clock}:00"]')
            first_lane.scroll_into_view_if_needed()
            first_box = first_lane.bounding_box()
            last_box = last_lane.bounding_box()
            assert first_box and last_box
            x = first_box["x"] + first_box["width"] * 0.55
            page.mouse.move(x, first_box["y"] + (first_box["height"] - 3 if upward else 4))
            page.mouse.down()
            page.mouse.move(x, last_box["y"] + (4 if upward else last_box["height"] - 3), steps=14)
            mirror = page.locator(".shift-selection-mirror").all_inner_texts()
            assert len(mirror) == 1 and f"{expected[0]} - {expected[1]}" in mirror[0], mirror
            page.mouse.up()
            draft = page.get_by_role("dialog")
            expect(draft).to_be_visible()
            clocks = draft.locator('input[type="time"]')
            actual = [clocks.nth(index).input_value() for index in range(2)]
            assert actual == expected, {"expected": expected, "actual": actual}
            draft.get_by_role("button", name="取消").click()
            expect(draft).to_have_count(0)
            assert not shift_writes, shift_writes

        check_unsaved_direction("10:00", "11:30", ["10:00", "12:00"], False)
        check_unsaved_direction("11:30", "10:00", ["10:00", "11:30"], True)
        assert api.get("http://127.0.0.1:4035/api/roster/calendar", params=target_query).json()["shifts"] == target_before["shifts"]

        early = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]')
        late = page.locator('.fc-timegrid-slot-lane[data-time="11:00:00"]')
        late.scroll_into_view_if_needed()
        first = late.bounding_box()
        last = early.bounding_box()
        if not first or not last:
            raise AssertionError("Time grid lanes unavailable")
        x = first["x"] + first["width"] * 0.55
        page.mouse.move(x, first["y"] + first["height"] - 3)
        page.mouse.down()
        page.mouse.move(x, last["y"] + 4, steps=14)
        mirror = page.locator(".shift-selection-mirror").all_inner_texts()
        assert len(mirror) == 1 and "10:00 - 11:00" in mirror[0], mirror
        mirror_box = page.locator(".fc-event-mirror").bounding_box()
        assert mirror_box and abs(mirror_box["height"] - last["height"] * 2) < 5, mirror_box
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        times = dialog.locator('input[type="time"]')
        values = [times.nth(index).input_value() for index in range(2)]
        date = page.locator('.fc-timegrid-col[data-date]').first.get_attribute('data-date')
        if date != "2026-10-10" or values != ["10:00", "11:00"]:
            raise AssertionError(f"Unexpected upward selection: {date} {values}")
        job_choice = dialog.get_by_role("radio", name="QA Front")
        expect(job_choice).not_to_be_checked()
        job_choice.locator("..").click()
        expect(job_choice).to_be_checked()
        HandoverEmployee006 = dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))
        expect(HandoverEmployee006).to_be_enabled()
        HandoverEmployee006.click()
        dialog.locator("textarea").first.fill("Upward drag QA")
        dialog.locator("footer button").last.click()
        expect(dialog).to_have_count(0)
        expect(page.locator('.fc-timegrid-event').filter(has_text="10:00–11:00")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator('.fc-timegrid-event').filter(has_text="10:00–11:00")).to_be_visible()
        target_after = api.get("http://127.0.0.1:4035/api/roster/calendar", params=target_query).json()
        assert len(target_after["shifts"]) == len(target_before["shifts"]) + 1
        created = [shift for shift in target_after["shifts"] if shift.get("publicNote") == "Upward drag QA"]
        assert len(created) == 1, target_after["shifts"]
        assert (created[0]["startAt"], created[0]["endAt"]) == (
            "2026-10-09T23:00:00.000Z", "2026-10-10T00:00:00.000Z")
        assert [row["employeeId"] for row in created[0]["assignments"]] == ["browser-HandoverEmployee006"]
        print(json.dumps({"verified": True, "dragDirection": "up", "date": date, "times": values, "mirror": mirror,
                          "directionalPreview": {"down": ["10:00", "12:00"], "up": ["10:00", "11:30"]},
                          "employeeId": "browser-HandoverEmployee006", "savedAndReloaded": True,
                          "databaseUtcAndEmployeeVerified": True, "oneNewShift": True}))
    finally:
        browser.close()
