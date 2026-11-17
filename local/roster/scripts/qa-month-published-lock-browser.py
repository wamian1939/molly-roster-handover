"""A published Month card stays locked while another week is focused."""

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
        mutations = []
        page.on("request", lambda request: mutations.append(request.url) if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/api/roster/shifts/" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-10", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator("main aside").filter(has_text="草稿")).to_be_visible()
        source = page.locator('.fc-daygrid-day[data-date="2026-10-16"] .fc-daygrid-event').first
        target = page.locator('.fc-daygrid-day[data-date="2026-10-17"]')
        expect(source).to_be_visible()
        source.scroll_into_view_if_needed()
        origin, destination = source.bounding_box(), target.bounding_box()
        assert origin and destination
        page.mouse.move(origin["x"] + origin["width"] / 2, origin["y"] + origin["height"] / 2)
        page.mouse.down()
        page.mouse.move(destination["x"] + destination["width"] / 2,
                        destination["y"] + min(45, destination["height"] / 2), steps=18)
        page.mouse.up()
        page.wait_for_timeout(400)
        assert not mutations, mutations
        expect(page.locator('.fc-daygrid-day[data-date="2026-10-16"] .fc-daygrid-event')).to_have_count(1)
        print(json.dumps({"verified": True, "focusedPeriod": "DRAFT", "publishedCardLocked": True,
                          "shiftMutations": len(mutations)}))
    finally:
        browser.close()
