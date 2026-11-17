"""Resize both edges of a Shift spanning Sydney's repeated 02:30 hour."""

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
api = "http://127.0.0.1:4035/api"
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

        slot_0200 = page.locator('.fc-timegrid-slot[data-time="02:00:00"]').first.bounding_box()
        slot_0230 = page.locator('.fc-timegrid-slot[data-time="02:30:00"]').first.bounding_box()
        assert slot_0200 and slot_0230
        step = slot_0230["y"] - slot_0200["y"]
        assert 20 < step < 70, step

        def resize(edge, pixels):
            event = page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")
            expect(event).to_be_visible()
            event.hover()
            handle = event.locator(f".fc-event-resizer-{edge}").bounding_box()
            assert handle
            x = handle["x"] + min(80, handle["width"] / 2)
            y = handle["y"] + handle["height"] / 2
            hit = page.evaluate("([x, y]) => document.elementFromPoint(x, y)?.className", [x, y])
            assert f"fc-event-resizer-{edge}" in str(hit), hit
            with page.expect_response(lambda response: response.request.method == "PATCH"
                                      and response.url.endswith(f"/{shift_id}/reposition")) as result:
                page.mouse.move(x, y)
                page.mouse.down()
                page.mouse.move(x, y + pixels, steps=8)
                page.mouse.up()
            assert result.value.status == 200, (edge, result.value.status, result.value.text())
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            return result.value.json()

        bottom = resize("end", step)
        assert bottom["startAt"] == "2026-04-04T15:30:00.000Z", bottom
        assert bottom["endAt"] == "2026-04-04T17:00:00.000Z", bottom
        top = resize("start", -step)
        assert top["startAt"] == "2026-04-04T15:00:00.000Z", top
        assert top["endAt"] == "2026-04-04T17:00:00.000Z", top
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        event = page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")
        expect(event).to_contain_text("02:00")
        expect(event).to_contain_text("03:00")
        print(json.dumps({"verified": True, "slotPixels": step, "bottomEndAt": bottom["endAt"],
                          "topStartAt": top["startAt"], "reloadVisible": True}))
    finally:
        browser.close()
