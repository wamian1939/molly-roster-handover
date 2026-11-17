"""An unavailable Sydney fall-back resize must retain the prior card and database row."""

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
shift_id = "qa-fallback-copy-source"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-04-05", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        event = page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")
        expect(event).to_contain_text("02:30")
        expect(event).to_contain_text("03:30")
        event.hover()
        handle = event.locator(".fc-event-resizer-end").bounding_box()
        first = page.locator('.fc-timegrid-slot[data-time="02:00:00"]').first.bounding_box()
        second = page.locator('.fc-timegrid-slot[data-time="02:30:00"]').first.bounding_box()
        assert handle and first and second
        step = second["y"] - first["y"]
        x, y = handle["x"] + min(80, handle["width"] / 2), handle["y"] + handle["height"] / 2
        with page.expect_response(lambda response: response.request.method == "PATCH"
                                  and response.url.endswith(f"/{shift_id}/reposition")) as result:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x, y + 2 * step, steps=8)
            page.mouse.up()
        print(json.dumps({"responseStatus": result.value.status, "body": result.value.text()[:500]}))
        assert result.value.status == 422, (result.value.status, result.value.text())
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        event = page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")
        expect(event).to_contain_text("02:30")
        expect(event).to_contain_text("03:30")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")).to_contain_text("03:30")
        print(json.dumps({"verified": True, "validationRejected": True, "rollbackVisible": True}))
    finally:
        browser.close()
