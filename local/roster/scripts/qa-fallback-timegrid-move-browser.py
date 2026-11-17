"""Move the resized Sydney fall-back Shift by one visible half-hour slot."""

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
        expect(event).to_contain_text("02:00")
        expect(event).to_contain_text("03:00")
        box = event.bounding_box()
        slot_0200 = page.locator('.fc-timegrid-slot[data-time="02:00:00"]').first.bounding_box()
        slot_0230 = page.locator('.fc-timegrid-slot[data-time="02:30:00"]').first.bounding_box()
        assert box and slot_0200 and slot_0230
        step = slot_0230["y"] - slot_0200["y"]
        x, y = box["x"] + min(180, box["width"] / 2), box["y"] + box["height"] / 2
        hit = page.evaluate("([x, y]) => document.elementFromPoint(x, y)?.className", [x, y])
        assert "fc-event-resizer" not in str(hit), hit
        with page.expect_response(lambda response: response.request.method == "PATCH"
                                  and response.url.endswith(f"/{shift_id}/reposition")) as result:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x, y + step, steps=8)
            page.mouse.up()
        print(json.dumps({"step": step, "status": result.value.status,
                          "result": {key: result.value.json().get(key) for key in ("startAt", "endAt", "version")}}))
        assert result.value.status == 200, (result.value.status, result.value.text())
        body = result.value.json()
        assert body["startAt"] == "2026-04-04T15:30:00.000Z", body
        assert body["endAt"] == "2026-04-04T17:30:00.000Z", body
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")).to_be_visible()
        print(json.dumps({"verified": True, "movePreservedDuration": True, "reloadVisible": True}))
    finally:
        browser.close()
