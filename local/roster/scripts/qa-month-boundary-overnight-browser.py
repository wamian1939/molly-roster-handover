"""Verify one overnight Shift remains reachable across a month and week boundary."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

workspace = Path(__file__).resolve().parent.parent
temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        calendar_reads = []
        page.on("response", lambda response: calendar_reads.append((response.url, response.status, response.json()))
                if response.request.method == "GET" and "/api/roster/calendar?" in response.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        def open_view(view):
            page.goto(f"http://127.0.0.1:5177/calendar?store=browser-store&view={view}&date=2026-11-01",
                      wait_until="domcontentloaded")
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)

        open_view("timeGridDay")
        expect(page.get_by_role("region", name="跨日延续班次")).to_contain_text("Regular Bob")
        day_events = page.locator(".fc-timegrid-event").all_text_contents()
        assert sum("Regular Bob" in item for item in day_events) == 1, {"events": day_events,
            "calendar": calendar_reads[-1:] if calendar_reads else [],
            "surface": page.locator(".calendar-surface").inner_text()[:1800]}
        page.locator(".fc-timegrid-event").filter(has_text="Regular Bob").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_contain_text("Regular Bob")
        expect(dialog).to_contain_text("10月31日")
        dialog.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()

        open_view("timeGridWeek")
        week_events = page.locator(".fc-timegrid-event").all_text_contents()
        assert sum("Regular Bob" in item for item in week_events) == 2, week_events

        open_view("dayGridMonth")
        month_events = page.locator(".fc-daygrid-event").all_text_contents()
        assert sum("Regular Bob" in item for item in month_events) == 1, month_events
        assert page.locator('.fc-daygrid-day[data-date="2026-11-01"]').count() == 1
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        assert sum("Regular Bob" in item for item in page.locator(".fc-daygrid-event").all_text_contents()) == 1
        verified = subprocess.run(["node", "scripts/seed-month-boundary-overnight-browser.mjs", "verify"],
                                  cwd=workspace, check=True, capture_output=True, text=True)
        print(json.dumps({"verified": True, "daySegments": 1, "weekSegments": 2, "monthCards": 1,
                          "editOpenedFromContinuation": True, "database": json.loads(verified.stdout)}))
    finally:
        browser.close()
