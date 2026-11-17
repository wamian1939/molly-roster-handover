"""Double-click Save in a real browser and verify one persisted Shift."""

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

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        creates = []
        page.on("request", lambda request: creates.append(request.url)
                if request.method == "POST" and "/api/roster/shifts/with-period" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]').click(position={"x": 200, "y": 4})
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        HandoverEmployee006 = dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))
        expect(HandoverEmployee006).to_be_enabled()
        HandoverEmployee006.click()
        dialog.get_by_role("textbox", name="公开备注").fill("Double save QA")
        save = dialog.get_by_role("button", name=re.compile(r"^保存班次"))
        expect(save).to_be_enabled()
        box = save.bounding_box()
        assert box is not None
        page.mouse.dblclick(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, delay=20)
        expect(dialog).to_have_count(0, timeout=15000)
        assert len(creates) == 1, f"Expected one create request, got {len(creates)}"
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")).to_be_visible()
        assert len(creates) == 1, f"Reload sent another create request: {len(creates)}"
        print(json.dumps({"verified": True, "mouseDoubleClick": True, "createRequests": len(creates), "reloadVisible": True}))
    finally:
        browser.close()
