"""Check Day click and drag creation against overnight store opening hours."""

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


def drag(page, start_clock, end_clock):
    start = page.locator(f'.fc-timegrid-slot-lane[data-time="{start_clock}:00"]')
    finish = page.locator(f'.fc-timegrid-slot-lane[data-time="{end_clock}:00"]')
    start.scroll_into_view_if_needed()
    start_box = start.bounding_box()
    finish_box = finish.bounding_box()
    if not start_box or not finish_box:
        raise AssertionError("Day time grid is unavailable")
    x = start_box["x"] + start_box["width"] * 0.55
    page.mouse.move(x, start_box["y"] + 4)
    page.mouse.down()
    page.mouse.move(x, finish_box["y"] + finish_box["height"] - 3, steps=12)
    page.mouse.up()


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

        page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]').click(position={"x": 200, "y": 4})
        expect(page.get_by_role("alert")).to_contain_text("营业")
        expect(page.get_by_role("dialog")).to_have_count(0)
        drag(page, "10:00", "11:00")
        page.wait_for_timeout(400)
        expect(page.get_by_role("dialog")).to_have_count(0, timeout=3000)
        expect(page.get_by_role("alert")).to_contain_text("营业")

        drag(page, "18:00", "19:00")
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        values = [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)]
        if values != ["18:00", "19:30"]:
            raise AssertionError(f"Valid evening selection changed: {values}")
        dialog.locator("footer button").first.click()
        drag(page, "00:30", "01:00")
        expect(dialog).to_be_visible()
        morning_values = [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)]
        if morning_values != ["00:30", "01:30"]:
            raise AssertionError(f"Valid morning selection changed: {morning_values}")
        dialog.locator("footer button").first.click()
        if mutations:
            raise AssertionError(f"Unsaved create gestures sent Shift mutations: {len(mutations)}")
        print(json.dumps({"verified": True, "blockedClick": "10:00", "blockedDrag": "10:00-11:30",
                          "validEveningDrag": values, "validMorningDrag": morning_values, "shiftMutationRequests": 0}))
    finally:
        browser.close()
