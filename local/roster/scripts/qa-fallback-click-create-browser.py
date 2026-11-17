"""Click a Sydney repeated-hour Day cell and persist its exact one-hour draft."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code in (201, 409), job.text

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
availability = api.put("http://127.0.0.1:4035/api/roster/availability", json={
    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-04-05"],
    "expectedRows": [], "entries": [{"date": "2026-04-05", "status": "AVAILABLE",
                                  "startAt": "2026-04-04T14:00:00.000Z", "endAt": "2026-04-04T19:00:00.000Z"}],
})
assert availability.status_code in (200, 201), availability.text

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
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-04-05", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        lane = page.locator('.fc-timegrid-slot-lane[data-time="02:30:00"]')
        lane.click(position={"x": 200, "y": 4})
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible(timeout=15000)
        times = dialog.locator('input[type="time"]')
        values = [times.nth(index).input_value() for index in range(2)]
        summary = dialog.locator(".bg-graphite-50").first.inner_text()
        assert values == ["02:30", "02:30"], values
        assert "实际经过 1 小时" in summary and "UTC+11" in summary and "UTC+10" in summary, summary
        expect(dialog.get_by_role("combobox", name="开始时间出现两次")).to_contain_text("第一次")
        expect(dialog.get_by_role("combobox", name="结束时间出现两次")).to_contain_text("第二次")
        HandoverEmployee006 = dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))
        expect(HandoverEmployee006).to_be_enabled()
        HandoverEmployee006.click()
        dialog.locator("footer button").last.click()
        expect(dialog).to_have_count(0)
        event = page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")
        expect(event).to_be_visible()
        expect(event).to_contain_text("02:30 UTC+11")
        expect(event).to_contain_text("02:30 UTC+10")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")).to_contain_text("02:30 UTC+10")
        assert len(writes) == 1, writes
        print(json.dumps({"verified": True, "prefill": values, "summary": summary,
                          "shiftWrites": len(writes), "reloadVisible": True}, ensure_ascii=False))
    finally:
        browser.close()
