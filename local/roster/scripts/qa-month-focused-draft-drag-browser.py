"""Check a draft Month card can still move while the focused period is published."""

import json
import re
import sys
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
api = "http://127.0.0.1:4035/api"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        reverse = "--reverse" in sys.argv
        source_date, target_date = ("2026-10-11", "2026-10-10") if reverse else ("2026-10-10", "2026-10-11")
        if "--verify-only" in sys.argv:
            before = page.context.request.get(f"{api}/roster/calendar?storeId=browser-store&from=2026-10-10&to=2026-10-11")
            if "--inspect" in sys.argv:
                print(json.dumps({"shifts": [{"id": shift["id"], "date": shift["date"], "version": shift["version"]}
                                             for shift in before.json()["shifts"]]}))
                sys.exit(0)
            shift_id = next(shift["id"] for shift in before.json()["shifts"] if shift["date"] == source_date and any(
                assignment["employeeId"] == "browser-HandoverEmployee006" for assignment in shift["assignments"]))
        else:
            role_response = page.context.request.get(f"{api}/roster/roles?storeId=browser-store")
            role = next(item for item in role_response.json() if item["code"] == "qa-front")
            for date, previous in (("2026-10-10", "2026-10-09"), ("2026-10-11", "2026-10-10")):
                response = page.context.request.put(f"{api}/roster/availability", data={
                    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": [date], "expectedRows": [],
                    "entries": [{"date": date, "status": "AVAILABLE",
                                 "startAt": f"{previous}T22:00:00.000Z", "endAt": f"{date}T11:00:00.000Z"}],
                })
                assert response.status in (200, 201), (response.status, response.text())
            created = page.context.request.post(f"{api}/roster/shifts/with-period", data={
                "storeId": "browser-store", "date": "2026-10-10",
                "targetStartDate": "2026-10-05", "targetEndDate": "2026-10-11",
                "startAt": "2026-10-09T23:00:00.000Z", "endAt": "2026-10-10T03:00:00.000Z",
                "breakMinutes": 0, "shiftRoleId": role["id"], "employeeIds": ["browser-HandoverEmployee006"],
            })
            assert created.status == 201, (created.status, created.text())
            shift_id = created.json()["id"]
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator("main aside").filter(has_text="已发布")).to_be_visible()
        source = page.locator(f'.fc-daygrid-day[data-date="{source_date}"] .fc-daygrid-event').filter(has_text="HandoverEmployee006")
        target = page.locator(f'.fc-daygrid-day[data-date="{target_date}"]')
        expect(source).to_be_visible()
        source.scroll_into_view_if_needed()
        origin, destination = source.bounding_box(), target.bounding_box()
        assert origin and destination
        page.mouse.move(origin["x"] + origin["width"] / 2, origin["y"] + origin["height"] / 2)
        page.mouse.down()
        with page.expect_response(lambda response: response.request.method == "PATCH" and "/reposition" in response.url, timeout=15000) as moved:
            page.mouse.move(destination["x"] + destination["width"] / 2,
                            destination["y"] + min(45, destination["height"] / 2), steps=18)
            page.mouse.up()
        assert moved.value.status == 200, (moved.value.status, moved.value.text())
        expect(page.locator(f'.fc-daygrid-day[data-date="{target_date}"] .fc-daygrid-event').filter(has_text="HandoverEmployee006")).to_be_visible(timeout=15000)
        calendar = page.context.request.get(f"{api}/roster/calendar?storeId=browser-store&from=2026-10-10&to=2026-10-11")
        shifted = next((shift for shift in calendar.json()["shifts"] if shift["id"] == shift_id), None)
        assert shifted and shifted["date"] == target_date, shifted
        print(json.dumps({"verified": True, "focusedPeriod": "PUBLISHED", "movedDraftShift": shift_id,
                          "targetDate": shifted["date"], "sourcePeriodUnchanged": shifted["rosterPeriodId"] == "qa-draft-period"}))
    finally:
        browser.close()
