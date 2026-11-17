"""Measure Molly Week/Day at the recorded BHS 4536x2449 reference viewport."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
evidence = Path(__file__).resolve().parents[1] / "docs" / "evidence"
evidence.mkdir(parents=True, exist_ok=True)


def measure(page):
    return page.evaluate("""() => {
      const rect = (selector) => {
        const node = document.querySelector(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return {x: box.x, y: box.y, width: box.width, height: box.height};
      };
      return {viewport: {width: innerWidth, height: innerHeight},
        surface: rect('.calendar-surface'), toolbar: rect('.calendar-toolbar'),
        legend: rect('.role-legend'), filter: rect('[aria-label="日历员工筛选"]'),
        grid: rect('.fc-timegrid'), slot: rect('.fc-timegrid-slot-lane[data-time="14:00:00"]'),
        weekday: rect('.fc-col-header-cell'), event: rect('.fc-timegrid-event'),
        documentWidth: document.documentElement.scrollWidth};
    }""")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 4536, "height": 2449}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date=2026-10-09",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        measurements = {}
        for view, label in (("Week", "周视图"), ("Day", "日视图")):
            page.get_by_role("button", name=label).click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            measurements[view] = measure(page)
            page.screenshot(path=str(evidence / f"molly-{view.lower()}-reference-viewport-2026-10-20.png"))
            assert abs(measurements[view]["surface"]["height"] - 2237) <= 5, measurements[view]
            assert abs(measurements[view]["slot"]["height"] * 2 - (91.8 if view == "Week" else 93.0)) <= 3, measurements[view]
            start = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]')
            end = page.locator('.fc-timegrid-slot-lane[data-time="15:00:00"]')
            first, last = start.bounding_box(), end.bounding_box()
            column = page.locator('.fc-timegrid-col[data-date="2026-10-09"]').bounding_box()
            assert first and last and column
            x = column["x"] + column["width"] * 0.5
            page.mouse.move(x, first["y"] + 4)
            page.mouse.down()
            page.mouse.move(x, last["y"] + last["height"] - 3, steps=10)
            page.mouse.up()
            dialog = page.get_by_role("dialog")
            expect(dialog).to_be_visible(timeout=5000)
            clocks = dialog.locator('input[type="time"]')
            assert [clocks.nth(index).input_value() for index in range(2)] == ["14:00", "15:30"]
            dialog.get_by_role("button", name="取消").click()
            expect(dialog).to_have_count(0)
        assert not writes, writes
        print(json.dumps({"verified": True, "measurements": measurements, "rosterWrites": len(writes)}))
    finally:
        browser.close()
