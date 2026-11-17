"""Verify Evaluate formal-position filtering separately from Shift Role skills."""

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
        writes = []
        page.on("request", lambda request: writes.append(request.url) if request.method == "POST" and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        available = page.context.request.put("http://127.0.0.1:4035/api/roster/availability", data={
            "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
            "expectedRows": [], "entries": [{"date": "2026-10-10", "status": "AVAILABLE",
                                          "startAt": "2026-10-09T21:00:00.000Z", "endAt": "2026-10-10T03:00:00.000Z"}],
        })
        if available.status not in (200, 201):
            raise AssertionError(f"Cannot seed disposable HandoverEmployee006 Availability: {available.status} {available.text()}")
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-10", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="新增班次").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        picker = dialog.get_by_label("员工列表")
        formal = dialog.get_by_role("combobox", name="筛选正式岗位")
        formal.click()
        page.get_by_role("option", name="QA Water").click()
        expect(picker.get_by_role("button")).to_have_count(1)
        expect(picker.get_by_role("button").first).to_contain_text("HandoverEmployee006")
        expect(picker.get_by_role("button").first).to_contain_text("正式岗位：QA Water")
        formal.click()
        page.get_by_role("option", name="正式岗位未确认").click()
        expect(picker.get_by_role("button").filter(has_text="HandoverEmployee006")).to_have_count(0)
        expect(picker.get_by_role("button").filter(has_text="Regular Bob")).to_be_visible()
        formal.click()
        page.get_by_role("option", name="QA Water").click()
        picker.get_by_role("button").first.click()
        dialog.locator("footer button").last.click()
        expect(dialog).to_have_count(0)
        expect(page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")).to_be_visible()
        assert len(writes) == 1, writes
        print(json.dumps({"verified": True, "formalPosition": "QA Water", "canonicalEmployee": "browser-HandoverEmployee006",
                          "unconfirmedExcludesBerlin": True, "shiftWrites": len(writes), "reloaded": True}))
    finally:
        browser.close()
