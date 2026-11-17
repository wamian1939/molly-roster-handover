"""Inspect and resize the next-day end of a saved overnight Shift."""

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
        page.on("request", lambda request: mutations.append({"method": request.method, "url": request.url})
                if request.method in ("PATCH", "PUT", "POST") and "/roster/" in request.url else None)
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
        expect(HandoverEmployee006).to_be_visible()
        if "23:00" in HandoverEmployee006.inner_text() or "03:00" in HandoverEmployee006.inner_text():
            HandoverEmployee006.click()
            dialog = page.get_by_role("dialog")
            expect(dialog).to_be_visible()
            dialog.locator('input[type="time"]').nth(0).fill("22:00")
            dialog.locator('input[type="time"]').nth(1).fill("02:00")
            dialog.get_by_role("button", name=re.compile(r"^保存班次")).click()
            expect(dialog).to_have_count(0)
            expect(HandoverEmployee006).to_contain_text("22:00")
        HandoverEmployee006.hover()
        handles = HandoverEmployee006.locator('.fc-event-resizer-end')
        handle = handles.first.bounding_box()
        slot_0200 = page.locator('.fc-timegrid-slot[data-time="02:00:00"]').first.bounding_box()
        slot_0300 = page.locator('.fc-timegrid-slot[data-time="03:00:00"]').first.bounding_box()
        if not handle or not slot_0200 or not slot_0300:
            raise AssertionError("The overnight end resize handle or target slots are unavailable")
        x = handle["x"] + min(80, handle["width"] / 2)
        start_y = handle["y"] + handle["height"] / 2
        end_y = start_y + slot_0300["y"] - slot_0200["y"]
        hit = page.evaluate("([x, y]) => document.elementFromPoint(x, y)?.outerHTML", [x, start_y])
        handle_style = handles.first.evaluate("el => ({pointerEvents: getComputedStyle(el).pointerEvents, zIndex: getComputedStyle(el).zIndex, position: getComputedStyle(el).position, cursor: getComputedStyle(el).cursor, rect: el.getBoundingClientRect().toJSON()})")
        page.mouse.move(x, start_y)
        page.mouse.down()
        page.mouse.move(x, end_y, steps=8)
        page.mouse.up()
        expect(HandoverEmployee006).to_contain_text("22:00")
        expect(HandoverEmployee006).to_contain_text("03:00")
        if "fc-event-resizer-end" not in hit or handle_style["cursor"] != "s-resize":
            raise AssertionError("The pointer missed the end resize handle")
        reposition = [item for item in mutations if item["url"].endswith("/reposition")]
        if len(reposition) != 1 or page.get_by_role("alert").count():
            raise AssertionError(f"Expected exactly one successful resize: {mutations}")
        page.reload(wait_until="domcontentloaded")
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator('.fc-timegrid')).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        HandoverEmployee006 = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(HandoverEmployee006).to_contain_text("22:00")
        expect(HandoverEmployee006).to_contain_text("03:00")
        print(json.dumps({"verified": True, "resizeEdge": "end", "startUnchanged": "22:00",
                          "endAfterResize": "03:00", "repositionRequests": 1, "savedAndReloaded": True}))
    finally:
        browser.close()
