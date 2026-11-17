"""Resize the first-day start of a saved overnight Shift in disposable Chromium."""

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
        mutations = []
        page.on("request", lambda request: mutations.append(request.url)
                if request.method == "PATCH" and request.url.endswith("/reposition") else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-day-number').click()
        expect(page.locator('.fc-timegrid')).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        HandoverEmployee006 = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(HandoverEmployee006).to_contain_text("22:00")
        expect(HandoverEmployee006).to_contain_text("03:00")
        HandoverEmployee006.hover()
        handle = HandoverEmployee006.locator('.fc-event-resizer-start').bounding_box()
        slot_2100 = page.locator('.fc-timegrid-slot[data-time="21:00:00"]').first.bounding_box()
        slot_2200 = page.locator('.fc-timegrid-slot[data-time="22:00:00"]').first.bounding_box()
        if not handle or not slot_2100 or not slot_2200:
            raise AssertionError("The overnight start resize handle or target slots are unavailable")
        x = handle["x"] + min(80, handle["width"] / 2)
        start_y = handle["y"] + handle["height"] / 2
        end_y = start_y + slot_2100["y"] - slot_2200["y"]
        hit = page.evaluate("([x, y]) => document.elementFromPoint(x, y)?.className", [x, start_y])
        if "fc-event-resizer-start" not in str(hit):
            raise AssertionError(f"Pointer missed the top resize handle: {hit}")
        page.mouse.move(x, start_y)
        page.mouse.down()
        page.mouse.move(x, end_y, steps=8)
        page.mouse.up()
        expect(HandoverEmployee006).to_contain_text("21:00")
        expect(HandoverEmployee006).to_contain_text("03:00")
        if len(mutations) != 1 or page.get_by_role("alert").count():
            raise AssertionError(f"Expected one successful start resize, got {len(mutations)}")
        page.reload(wait_until="domcontentloaded")
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-day-number').click()
        expect(page.locator('.fc-timegrid')).to_be_visible()
        HandoverEmployee006 = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(HandoverEmployee006).to_contain_text("21:00")
        expect(HandoverEmployee006).to_contain_text("03:00")
        print(json.dumps({"verified": True, "resizeEdge": "start", "startAfterResize": "21:00",
                          "endUnchanged": "03:00", "repositionRequests": 1, "savedAndReloaded": True}))
    finally:
        browser.close()
