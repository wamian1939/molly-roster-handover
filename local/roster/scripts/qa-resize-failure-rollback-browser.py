"""Check both Day-view resize edges revert after a failed reposition request."""

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
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        rejected = []

        def reject_resize(route):
            rejected.append(route.request.post_data_json)
            route.fulfill(status=503, content_type="application/json", body='{"message":"Temporary roster outage"}')

        page.route("**/api/roster/shifts/*/reposition", reject_resize)
        for edge, direction in (("start", -1), ("end", 1)):
            page.locator(".calendar-view-option").first.click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
            page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
            expect(page.locator(".fc-timegrid")).to_be_visible()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
            event = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
            expect(event).to_contain_text("10:00")
            expect(event).to_contain_text("11:30")
            event.hover()
            handle = event.locator(f".fc-event-resizer-{edge}").first.bounding_box()
            slot_1000 = page.locator('.fc-timegrid-slot[data-time="10:00:00"]').first.bounding_box()
            slot_1030 = page.locator('.fc-timegrid-slot[data-time="10:30:00"]').first.bounding_box()
            if not handle or not slot_1000 or not slot_1030:
                raise AssertionError(f"Missing {edge} handle or slot")
            x = handle["x"] + min(80, handle["width"] / 2)
            y = handle["y"] + handle["height"] / 2
            hit = page.evaluate("([x, y]) => document.elementFromPoint(x, y)?.className", [x, y])
            if f"fc-event-resizer-{edge}" not in str(hit):
                raise AssertionError(f"Pointer missed {edge} resize handle: {hit}")
            with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/reposition")) as response_info:
                page.mouse.move(x, y)
                page.mouse.down()
                page.mouse.move(x, y + direction * (slot_1030["y"] - slot_1000["y"]), steps=8)
                page.mouse.up()
            if response_info.value.status != 503:
                raise AssertionError(f"Expected 503 for {edge} resize")
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
            event = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
            expect(event).to_contain_text("10:00")
            expect(event).to_contain_text("11:30")
        if len(rejected) != 2:
            raise AssertionError(f"Expected one reposition per resize edge; found {len(rejected)}")
        page.unroute("**/api/roster/shifts/*/reposition", reject_resize)
        page.reload(wait_until="domcontentloaded")
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        event = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(event).to_contain_text("10:00")
        expect(event).to_contain_text("11:30")
        print(json.dumps({"verified": True, "failedResizeEdges": ["start", "end"],
                          "intercepted503": len(rejected), "visibleAndReloadedWindow": "10:00-11:30"}))
    finally:
        browser.close()
