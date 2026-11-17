"""Move an eight-hour Shift to Sydney's fall-back date in Week TimeGrid."""

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
shift_id = "qa-dst-cross-day-move"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        requests = []
        page.on("request", lambda request: requests.append(request) if request.method == "PATCH" and request.url.endswith(f"/{shift_id}/reposition") else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date=2026-04-04", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        source = page.locator('.fc-timegrid-col[data-date="2026-04-04"] .fc-timegrid-event').filter(has_text="HandoverEmployee006")
        target = page.locator('.fc-timegrid-col[data-date="2026-04-05"]')
        expect(source).to_be_visible(timeout=15000)
        expect(target).to_be_visible()
        source.scroll_into_view_if_needed()
        origin = source.bounding_box()
        destination = target.bounding_box()
        assert origin and destination
        x = origin["x"] + origin["width"] / 2
        y = origin["y"] + min(55, origin["height"] / 2)
        target_x = destination["x"] + destination["width"] / 2
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(target_x, y, steps=18)
        page.mouse.up()
        page.wait_for_timeout(1200)
        if len(requests) != 1:
            raise AssertionError(f"Expected one atomic cross-day move, found {len(requests)}; card={source.count()}, alerts={page.get_by_role('alert').all_text_contents()}")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        moved = page.locator('.fc-timegrid-col[data-date="2026-04-05"] .fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(moved).to_be_visible()
        expect(moved).to_contain_text("00:30")
        expect(moved).to_contain_text("07:30")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator('.fc-timegrid-col[data-date="2026-04-05"] .fc-timegrid-event').filter(has_text="HandoverEmployee006")).to_contain_text("07:30")
        print(json.dumps({"verified": True, "source": "2026-04-04 00:30-08:30", "target": "2026-04-05 00:30-07:30", "requests": len(requests), "reloaded": True}))
    finally:
        browser.close()
