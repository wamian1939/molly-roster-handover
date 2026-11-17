"""Repeat blank time-grid selection at a desktop viewport in isolated QA schemas."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]


def drag_slot(page, date, start_clock, end_clock, horizontal_fraction):
    start = page.locator(f'.fc-timegrid-slot-lane[data-time="{start_clock}:00"]')
    finish = page.locator(f'.fc-timegrid-slot-lane[data-time="{end_clock}:00"]')
    start.scroll_into_view_if_needed()
    first, last = start.bounding_box(), finish.bounding_box()
    column = page.locator(f'.fc-timegrid-col[data-date="{date}"]').bounding_box()
    assert first and last and column
    x = column["x"] + column["width"] * horizontal_fraction
    page.mouse.move(x, first["y"] + 4)
    page.mouse.down()
    page.mouse.move(x, last["y"] + last["height"] - 3, steps=12)
    page.mouse.up()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible(timeout=5000)
    fields = dialog.locator('input[type="time"]')
    observed = [fields.nth(index).input_value() for index in range(2)]
    expected = [start_clock, f"{int(end_clock[:2]):02d}:{int(end_clock[3:]) + 30:02d}"]
    assert observed == expected, {"expected": expected, "observed": observed, "fraction": horizontal_fraction}
    dialog.get_by_role("button", name="取消").click()
    expect(dialog).to_have_count(0)
    return observed


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 2109, "height": 1139}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url) if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridWeek&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        results = []
        for view, switch in (("Week", "周视图"), ("Day", "日视图")):
            page.get_by_role("button", name=switch).click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            for attempt in range(12):
                fraction = (0.32, 0.5, 0.7)[attempt % 3]
                values = drag_slot(page, "2026-10-09", "14:00", "15:00", fraction)
                results.append({"view": view, "attempt": attempt + 1, "values": values})
        assert not writes, writes
        print(json.dumps({"verified": True, "gestures": len(results), "results": results, "rosterWrites": len(writes)}, ensure_ascii=False))
    finally:
        browser.close()
