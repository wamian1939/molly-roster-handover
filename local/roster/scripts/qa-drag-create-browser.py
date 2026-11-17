"""Persist a Day-view drag selection in disposable browser fixtures."""

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
admin_credential = evaluate["credentials"]["browser-admin"]
credential = evaluate["credentials"]["browser-evaluator-a"]
evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=admin_credential).raise_for_status()
jobs = evaluate_api.get("http://127.0.0.1:4010/api/store-jobs", params={"storeId": "browser-store"})
jobs.raise_for_status()
if not any(job.get("code") == "qa-front" for job in jobs.json()):
    job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
        "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
    })
    assert job.status_code == 201, job.text

bootstrap_api = requests.Session()
bootstrap_api.post("http://127.0.0.1:4035/api/auth/login", json=admin_credential).raise_for_status()
api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
target_query = {"storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10"}
published_query = {"storeId": "browser-store", "from": "2026-10-16", "to": "2026-10-16"}
target_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=target_query).json()
published_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query).json()
assert target_before["shifts"] == [], "Drag acceptance requires an empty disposable target date"
availability_rows = bootstrap_api.get("http://127.0.0.1:4035/api/roster/availability", params={
    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "from": "2026-10-10", "to": "2026-10-10",
})
availability_rows.raise_for_status()
if not availability_rows.json():
    availability = bootstrap_api.put("http://127.0.0.1:4035/api/roster/availability", json={
        "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
        "expectedRows": [], "entries": [{"date": "2026-10-10", "status": "AVAILABLE",
                                      "startAt": "2026-10-09T21:00:00.000Z", "endAt": "2026-10-10T08:00:00.000Z"}],
    })
    assert availability.status_code in (200, 201), availability.text

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator(".fc-timegrid")).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        start = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]')
        finish = page.locator('.fc-timegrid-slot-lane[data-time="11:00:00"]')
        start.scroll_into_view_if_needed()
        first = start.bounding_box()
        last = finish.bounding_box()
        if not first or not last:
            raise AssertionError("Time grid lanes unavailable")
        x = first["x"] + first["width"] * 0.55
        page.mouse.move(x, first["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, last["y"] + last["height"] - 3, steps=14)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        times = dialog.locator('input[type="time"]')
        values = [times.nth(index).input_value() for index in range(2)]
        date = page.locator('.fc-timegrid-col[data-date]').first.get_attribute('data-date')
        if date != "2026-10-10" or values != ["10:00", "11:30"]:
            raise AssertionError(f"Unexpected drag selection: {date} {values}")
        job = dialog.get_by_role("radio", name="QA Front")
        expect(job).not_to_be_checked()
        dialog.get_by_role("button", name="保存班次").click()
        expect(dialog.get_by_role("alert")).to_contain_text("请选择班次岗位")
        assert not writes, "An unselected Job must never create a Shift"
        job.locator("..").click()
        expect(job).to_be_checked()
        HandoverEmployee006 = dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))
        expect(HandoverEmployee006).to_be_enabled()
        HandoverEmployee006.click()
        dialog.locator("textarea").first.fill("Drag create QA")
        dialog.locator("footer button").last.click()
        expect(dialog).to_have_count(0)
        expect(page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")).to_be_visible()
        page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006").click()
        edited = page.get_by_role("dialog")
        expect(edited).to_be_visible()
        expect(edited.get_by_role("textbox", name="开始时间")).to_have_value("10:00")
        expect(edited.get_by_role("textbox", name="结束时间")).to_have_value("11:30")
        edited.get_by_role("button", name="取消").click()
        expect(edited).to_have_count(0)
        assert len(writes) == 1 and writes[0][0] == "POST" and writes[0][1].endswith("/roster/shifts/with-period"), writes
        target_after = api.get("http://127.0.0.1:4035/api/roster/calendar", params=target_query).json()
        published_after = api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query).json()
        assert len(target_after["shifts"]) == 1, target_after["shifts"]
        shift = target_after["shifts"][0]
        assert (shift["startAt"], shift["endAt"]) == (
            "2026-10-09T23:00:00.000Z", "2026-10-10T00:30:00.000Z"), shift
        assert [row["employeeId"] for row in shift["assignments"]] == ["browser-HandoverEmployee006"], shift
        assert published_after == published_before, "Published calendar changed after Day drag create"
        print(json.dumps({"verified": True, "actorRole": "STORE_EVALUATOR", "date": date, "times": values,
                          "employeeId": "browser-HandoverEmployee006", "savedAndReloaded": True, "shiftWrites": 1,
                          "databaseUtcVerified": True, "clickToEditAfterReload": True,
                          "publishedHistoryUnchanged": True}))
    finally:
        browser.close()
