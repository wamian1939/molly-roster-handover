"""Verify a committed Shift with malformed HTTP success JSON reconciles without a duplicate."""

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
        creates = []

        def corrupt_committed_response(route):
            creates.append(route.request.url)
            actual = route.fetch()
            if actual.status != 201:
                route.fulfill(response=actual)
                return
            route.fulfill(status=201, content_type="application/json", body="{broken")

        page.route("**/api/roster/shifts/with-period", corrupt_committed_response)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
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
        dialog.get_by_role("textbox", name="公开备注").fill("Malformed success QA")
        dialog.get_by_role("button", name=re.compile(r"^保存班次")).click()
        expect(dialog).to_have_count(0, timeout=15000)
        expect(page.get_by_text("日历中已找到匹配班次")).to_be_visible(timeout=15000)
        expect(page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")).to_be_visible()
        assert len(creates) == 1, f"Expected one create request, found {len(creates)}"
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")).to_be_visible()
        print(json.dumps({"verified": True, "committedStatus": 201, "malformedBody": True,
                          "authoritativeMatchFound": True, "createRequests": len(creates), "reloadVisible": True}))
    finally:
        browser.close()
