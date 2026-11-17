"""Probe and verify Week drag selection cannot open a misleading multi-day draft."""

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
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-06"] .fc-daygrid-day-number').click()
        page.locator(".calendar-view-option").nth(1).click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        first = page.locator('.fc-timegrid-col[data-date="2026-10-06"]').bounding_box()
        last = page.locator('.fc-timegrid-col[data-date="2026-10-08"]').bounding_box()
        start = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]')
        finish = page.locator('.fc-timegrid-slot-lane[data-time="11:00:00"]')
        start.scroll_into_view_if_needed()
        early = start.bounding_box()
        late = finish.bounding_box()
        if not first or not last or not early or not late:
            raise AssertionError("Week grid columns or lanes unavailable")
        page.mouse.move(first["x"] + first["width"] / 2, early["y"] + 4)
        page.mouse.down()
        page.mouse.move(last["x"] + last["width"] / 2, late["y"] + late["height"] - 3, steps=20)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_have_count(0)
        page.wait_for_timeout(120)
        page.mouse.move(first["x"] + first["width"] / 2, early["y"] + 4)
        page.mouse.down()
        page.mouse.move(first["x"] + first["width"] / 2, late["y"] + late["height"] - 3, steps=12)
        page.mouse.up()
        expect(dialog).to_be_visible()
        times = dialog.locator('input[type="time"]')
        values = [times.nth(i).input_value() for i in range(2)]
        if values != ["10:00", "11:30"]:
            raise AssertionError(f"Valid same-day selection changed: {values}")
        dialog.locator("footer button").first.click()
        expect(dialog).to_have_count(0)
        # Adjacent columns can represent less than 24 hours in UTC. A pointer
        # crossing columns should still not silently create an overnight Shift.
        thursday = page.locator('.fc-timegrid-col[data-date="2026-10-08"]').bounding_box()
        friday = page.locator('.fc-timegrid-col[data-date="2026-10-09"]').bounding_box()
        from_slot = page.locator('.fc-timegrid-slot-lane[data-time="11:00:00"]')
        to_slot = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]')
        from_slot.scroll_into_view_if_needed()
        from_box, to_box = from_slot.bounding_box(), to_slot.bounding_box()
        assert thursday and friday and from_box and to_box
        page.mouse.move(thursday["x"] + thursday["width"] / 2, from_box["y"] + 4)
        page.mouse.down()
        page.mouse.move(friday["x"] + friday["width"] / 2, to_box["y"] + to_box["height"] - 3, steps=18)
        page.mouse.up()
        if dialog.count():
            date_inputs = dialog.locator('input[type="date"]')
            time_inputs = dialog.locator('input[type="time"]')
            dates = [date_inputs.nth(i).input_value() for i in range(date_inputs.count())]
            times = [time_inputs.nth(i).input_value() for i in range(time_inputs.count())]
            dialog.locator("footer button").first.click()
            raise AssertionError(f"Adjacent cross-column drag opened Add: dates={dates}, times={times}")
        expect(dialog).to_have_count(0)
        thursday = page.locator('.fc-timegrid-col[data-date="2026-10-08"]').bounding_box()
        to_box = to_slot.bounding_box()
        assert thursday and to_box
        page.mouse.click(thursday["x"] + thursday["width"] / 2, to_box["y"] + 4)
        expect(dialog).to_be_visible()
        dialog.locator('input[type="time"]').nth(0).fill("22:00")
        dialog.locator('input[type="time"]').nth(1).fill("02:00")
        dialog.get_by_role("checkbox", name="次日结束").check()
        expect(dialog.get_by_text("实际经过 4 小时", exact=False).first).to_be_visible()
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        assert not writes, writes
        print(json.dumps({"verified": True, "invalidMultiDaySelectionBlocked": True,
                          "adjacentColumnSelectionBlocked": True,
                          "validSameDaySelection": values, "overnightFormAvailable": True,
                          "shiftWrites": len(writes), "saved": False}))
    finally:
        browser.close()
