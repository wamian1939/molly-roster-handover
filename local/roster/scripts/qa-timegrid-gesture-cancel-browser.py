"""Verify slight pointer movement clicks and Escape cancels a Day selection."""

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
        mutations = []
        page.on("request", lambda request: mutations.append(request.url) if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")

        start = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]')
        start.scroll_into_view_if_needed()
        box = start.bounding_box()
        if not box:
            raise AssertionError("10:00 slot unavailable")
        x, y = box["x"] + box["width"] * 0.55, box["y"] + 4
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 3, y + 2, steps=2)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible(timeout=3000)
        times = dialog.locator('input[type="time"]')
        click_times = [times.nth(index).input_value() for index in range(2)]
        if click_times != ["10:00", "10:30"]:
            raise AssertionError(f"Small movement changed click slot: {click_times}")
        dialog.locator("footer button").first.click()
        expect(dialog).to_have_count(0)

        finish = page.locator('.fc-timegrid-slot-lane[data-time="11:00:00"]')
        start.scroll_into_view_if_needed()
        box = start.bounding_box()
        last = finish.bounding_box()
        if not box or not last:
            raise AssertionError("10:00 or 11:00 slot unavailable")
        x, y = box["x"] + box["width"] * 0.55, box["y"] + 4
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x, last["y"] + last["height"] - 3, steps=12)
        preview_before_escape = page.locator(".fc-event-mirror, .fc-highlight").count()
        assert preview_before_escape > 0, "The drag did not produce a visible selection preview"
        page.keyboard.press("Escape")
        preview_after_escape = page.locator(".fc-event-mirror, .fc-highlight").count()
        page.mouse.up()
        expect(page.get_by_role("dialog")).to_have_count(0, timeout=3000)
        page.wait_for_timeout(120)  # Let FullCalendar complete pointer release before the next gesture.
        start.scroll_into_view_if_needed()
        box = start.bounding_box()
        assert box
        x, y = box["x"] + box["width"] * 0.55, box["y"] + 4
        page.mouse.click(x, y)
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.locator('input[type="time"]').first).to_have_value("10:00")
        dialog.locator("footer button").first.click()
        expect(dialog).to_have_count(0)
        start.scroll_into_view_if_needed()
        box = start.bounding_box()
        last = finish.bounding_box()
        assert box and last
        x, y = box["x"] + box["width"] * 0.55, box["y"] + 4
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x, last["y"] + last["height"] - 3, steps=12)
        page.evaluate("window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }))")
        page.mouse.up()
        expect(page.get_by_role("dialog")).to_have_count(0, timeout=3000)
        if mutations:
            raise AssertionError(f"Gesture cancellation sent Shift mutations: {len(mutations)}")
        print(json.dumps({"verified": True, "smallMovementPrefill": click_times,
                          "escapeCanceledSelection": True, "syntheticPointerCancel": True,
                          "nextClickRecovered": True, "shiftMutationRequests": 0,
                          "previewBeforeEscape": preview_before_escape, "previewAfterEscape": preview_after_escape}))
    finally:
        browser.close()
