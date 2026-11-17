"""Check stale Day resize yields 409 and reloads the other admin's change."""

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
base = "http://127.0.0.1:4035/api"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        event = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(event).to_contain_text("10:00")
        expect(event).to_contain_text("11:30")

        calendar = page.context.request.get(f"{base}/roster/calendar?storeId=browser-store&from=2026-10-10&to=2026-10-10")
        if calendar.status != 200:
            raise AssertionError(f"Calendar read failed: {calendar.status}")
        matches = [shift for shift in calendar.json()["shifts"] if shift["publicNote"] == "Drag create QA"]
        if len(matches) != 1 or matches[0]["version"] != 1:
            raise AssertionError("Expected one freshly created version-1 Shift")
        shift_id = matches[0]["id"]
        concurrent = page.context.request.post(f"{base}/roster/batch/update", data={
            "storeId": "browser-store", "items": [{"id": shift_id, "version": 1}],
            "patch": {"publicNote": "Concurrent resize QA"},
        })
        if concurrent.status != 200:
            raise AssertionError(f"Concurrent update failed: {concurrent.status} {concurrent.text()}")

        event.hover()
        handle = event.locator(".fc-event-resizer-end").first.bounding_box()
        slot_1000 = page.locator('.fc-timegrid-slot[data-time="10:00:00"]').first.bounding_box()
        slot_1030 = page.locator('.fc-timegrid-slot[data-time="10:30:00"]').first.bounding_box()
        if not handle or not slot_1000 or not slot_1030:
            raise AssertionError("Missing bottom resize handle or slots")
        x = handle["x"] + min(80, handle["width"] / 2)
        y = handle["y"] + handle["height"] / 2
        hit = page.evaluate("([x, y]) => document.elementFromPoint(x, y)?.className", [x, y])
        if "fc-event-resizer-end" not in str(hit):
            raise AssertionError(f"Pointer missed bottom resize handle: {hit}")
        with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith(f"/{shift_id}/reposition")) as response_info:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x, y + slot_1030["y"] - slot_1000["y"], steps=8)
            page.mouse.up()
        if response_info.value.status != 409:
            raise AssertionError(f"Expected stale version 409, got {response_info.value.status}")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        event = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(event).to_contain_text("10:00")
        expect(event).to_contain_text("11:30")
        event.click()
        dialog = page.get_by_role("dialog")
        expect(dialog.locator("textarea").first).to_have_value("Concurrent resize QA")
        print(json.dumps({"verified": True, "staleResizeHttp": 409, "authoritativeNoteVisible": True,
                          "windowUnchanged": "10:00-11:30", "shiftId": shift_id}))
    finally:
        browser.close()
