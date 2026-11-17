"""Inspect Day drag-selection semantics around Sydney's repeated 02:00 hour."""

import json
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
save_second = "--save-second" in sys.argv

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url) if request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-04-05", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        start = page.locator('.fc-timegrid-slot-lane[data-time="02:00:00"]')
        finish = page.locator('.fc-timegrid-slot-lane[data-time="02:30:00"]')
        start.scroll_into_view_if_needed()
        first, last = start.bounding_box(), finish.bounding_box()
        assert first and last
        x = first["x"] + first["width"] * 0.55
        page.mouse.move(x, first["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, last["y"] + last["height"] - 3, steps=14)
        mirror_text = page.locator(".shift-selection-mirror").all_inner_texts()
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible(timeout=15000)
        times = dialog.locator('input[type="time"]')
        values = [times.nth(i).input_value() for i in range(2)]
        choices = [item.inner_text() for item in dialog.get_by_role("combobox").all()
                   if "时间出现两次" in (item.get_attribute("aria-label") or "")]
        summary = dialog.locator(".bg-graphite-50").first.inner_text()
        assert values == ["02:00", "03:00"]
        assert any("UTC+11" in item and "UTC+10" in item and "实际 2 小时" in item for item in mirror_text), mirror_text
        assert "UTC+11" in summary and "UTC+10" in summary and "实际经过 2 小时" in summary, summary
        dialog.get_by_role("combobox", name="开始时间出现两次").click()
        page.get_by_role("option", name=re.compile("第二次 02:00")).click()
        revised = dialog.locator(".bg-graphite-50").first.inner_text()
        assert "实际经过 1 小时" in revised and "02:00" in revised and "03:00" in revised, revised
        if save_second:
            HandoverEmployee006 = dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))
            expect(HandoverEmployee006).to_be_enabled()
            HandoverEmployee006.click()
            dialog.locator("footer button").last.click()
            expect(dialog).to_have_count(0)
            event = page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")
            expect(event).to_contain_text("02:00")
            expect(event).to_contain_text("03:00")
            page.reload(wait_until="domcontentloaded")
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            expect(page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")).to_contain_text("03:00")
            assert len(writes) == 1, writes
        else:
            dialog.locator("header button").click()
            expect(dialog).to_have_count(0)
            assert len(writes) == 0
        print(json.dumps({"verified": True, "saved": save_second, "mirror": mirror_text, "times": values,
                          "occurrenceChoices": choices, "initialSummary": summary,
                          "revisedSummary": revised, "shiftWrites": len(writes)}, ensure_ascii=False))
    finally:
        browser.close()
