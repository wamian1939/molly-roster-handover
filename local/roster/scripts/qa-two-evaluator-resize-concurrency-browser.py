"""Two isolated evaluator sessions edit one Shift and verify stale Resize rollback."""

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


def open_day(page, credential):
    page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
    page.locator('input[autocomplete="username"]').fill(credential["username"])
    page.locator('input[autocomplete="current-password"]').fill(credential["password"])
    page.locator('button[type="submit"]').click()
    expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
    page.locator(".calendar-view-option").first.click()
    expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
    page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-daygrid-day-number').click()
    expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
    event = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
    expect(event).to_contain_text("10:00")
    expect(event).to_contain_text("11:30")
    return event


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        context_a = browser.new_context(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        context_b = browser.new_context(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page_a = context_a.new_page()
        page_b = context_b.new_page()
        event_a = open_day(page_a, evaluate["credentials"]["browser-evaluator-a"])
        event_b = open_day(page_b, evaluate["credentials"]["browser-evaluator-b"])
        event_b.click()
        dialog_b = page_b.get_by_role("dialog")
        expect(dialog_b).to_be_visible()
        dialog_b.locator("textarea").first.fill("Evaluator B concurrent note")
        with page_b.expect_response(lambda response: response.request.method == "PATCH" and "/roster/shifts/" in response.url) as saved_response:
            dialog_b.locator("footer button").last.click()
        if saved_response.value.status != 200:
            raise AssertionError(f"Evaluator B save failed: {saved_response.value.status}")
        expect(dialog_b).to_have_count(0)

        event_a.hover()
        handle = event_a.locator(".fc-event-resizer-end").first.bounding_box()
        slot_1000 = page_a.locator('.fc-timegrid-slot[data-time="10:00:00"]').first.bounding_box()
        slot_1030 = page_a.locator('.fc-timegrid-slot[data-time="10:30:00"]').first.bounding_box()
        if not handle or not slot_1000 or not slot_1030:
            raise AssertionError("Missing evaluator A resize handle or slots")
        x = handle["x"] + min(80, handle["width"] / 2)
        y = handle["y"] + handle["height"] / 2
        hit = page_a.evaluate("([x, y]) => document.elementFromPoint(x, y)?.className", [x, y])
        if "fc-event-resizer-end" not in str(hit):
            raise AssertionError(f"Pointer missed bottom resize handle: {hit}")
        with page_a.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/reposition")) as stale_response:
            page_a.mouse.move(x, y)
            page_a.mouse.down()
            page_a.mouse.move(x, y + slot_1030["y"] - slot_1000["y"], steps=8)
            page_a.mouse.up()
        if stale_response.value.status != 409:
            raise AssertionError(f"Expected stale Resize 409; got {stale_response.value.status}")
        expect(page_a.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        event_a = page_a.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(event_a).to_contain_text("10:00")
        expect(event_a).to_contain_text("11:30")
        event_a.click()
        expect(page_a.get_by_role("dialog").locator("textarea").first).to_have_value("Evaluator B concurrent note")
        print(json.dumps({"verified": True, "identities": ["browser-evaluator-a", "browser-evaluator-b"],
                          "secondEditorSave": 200, "staleResize": 409,
                          "firstEditorReloadedConcurrentNote": True, "windowUnchanged": "10:00-11:30"}))
    finally:
        browser.close()
