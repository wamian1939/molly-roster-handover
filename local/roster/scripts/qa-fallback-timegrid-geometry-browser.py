"""Inspect a real one-hour first-to-second 02:30 Shift in Sydney's Day grid."""

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
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-04-05", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        event = page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")
        expect(event).to_be_visible(timeout=15000)
        box = event.bounding_box()
        slots = page.locator(".fc-timegrid-slot[data-time]")
        labels = slots.evaluate_all("(nodes) => nodes.map(node => ({time: node.getAttribute('data-time'), y: node.getBoundingClientRect().y})).filter(row => row.time && (row.time.startsWith('02:') || row.time.startsWith('03:')))")
        start_handle = event.locator(".fc-event-resizer-start")
        end_handle = event.locator(".fc-event-resizer-end")
        print(json.dumps({"verified": True, "eventText": event.inner_text(), "box": box,
                          "twoOclockSlots": labels, "topHandles": start_handle.count(),
                          "bottomHandles": end_handle.count()}))
    finally:
        browser.close()
