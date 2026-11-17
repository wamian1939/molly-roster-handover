"""Reject a split overnight move with 503 and verify authoritative reload."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster QA schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate QA schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        intercepted = []
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator('.fc-timegrid')).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        HandoverEmployee006 = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(HandoverEmployee006).to_contain_text("23:00")
        expect(HandoverEmployee006).to_contain_text("03:00")

        def reject_move(route):
            intercepted.append(route.request.post_data_json)
            route.fulfill(status=503, content_type="application/json", body='{"message":"Temporary roster outage"}')

        page.route("**/api/roster/shifts/*/reposition", reject_move)
        box = HandoverEmployee006.bounding_box()
        slot_0100 = page.locator('.fc-timegrid-slot[data-time="01:00:00"]').first.bounding_box()
        slot_0200 = page.locator('.fc-timegrid-slot[data-time="02:00:00"]').first.bounding_box()
        if not box or not slot_0100 or not slot_0200:
            raise AssertionError("Missing overnight card or time slots")
        x = box["x"] + min(80, box["width"] / 2)
        y = box["y"] + box["height"] / 2
        hit = page.evaluate("([x, y]) => document.elementFromPoint(x, y)?.className", [x, y])
        if "fc-event-resizer" in str(hit):
            raise AssertionError(f"Move pointer hit Resize handle: {hit}")
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x, y - (slot_0200["y"] - slot_0100["y"]), steps=8)
        page.mouse.up()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(HandoverEmployee006).to_contain_text("23:00")
        expect(HandoverEmployee006).to_contain_text("03:00")
        if len(intercepted) != 1:
            raise AssertionError(f"Expected one intercepted reposition, got {len(intercepted)}")
        page.unroute("**/api/roster/shifts/*/reposition", reject_move)
        page.reload(wait_until="domcontentloaded")
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator('.fc-timegrid')).to_be_visible()
        HandoverEmployee006 = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(HandoverEmployee006).to_contain_text("23:00")
        expect(HandoverEmployee006).to_contain_text("03:00")
        box = HandoverEmployee006.bounding_box()
        slot_0100 = page.locator('.fc-timegrid-slot[data-time="01:00:00"]').first.bounding_box()
        slot_0200 = page.locator('.fc-timegrid-slot[data-time="02:00:00"]').first.bounding_box()
        if not box or not slot_0100 or not slot_0200:
            raise AssertionError("Saved overnight Shift or target slots are not visible")
        x = box["x"] + min(80, box["width"] / 2)
        y = box["y"] + box["height"] / 2
        with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/reposition")) as rejected_response:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x, y + slot_0200["y"] - slot_0100["y"], steps=8)
            page.mouse.up()
        rejected = rejected_response.value
        body = rejected.json()
        if rejected.status != 400 or body.get("validation", {}).get("code") != "OUTSIDE_OPERATING_HOURS":
            raise AssertionError(f"Expected structured operating-hours rejection, got {rejected.status}: {body}")
        expect(page.get_by_role("alert")).to_contain_text("18:00")
        expect(HandoverEmployee006).to_contain_text("23:00")
        expect(HandoverEmployee006).to_contain_text("03:00")
        print(json.dumps({"verified": True, "interceptedReposition": 1,
                          "networkFailureStatus": 503, "operatingHoursRejection": "OUTSIDE_OPERATING_HOURS",
                          "rollbackVisibleAndReloaded": True}))
    finally:
        browser.close()
