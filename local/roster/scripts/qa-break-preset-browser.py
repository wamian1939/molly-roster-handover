"""Verify two-hour preset breaks through the current-source disposable browser and API."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
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
    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
    "expectedRows": [], "entries": [{"date": "2026-10-10", "status": "AVAILABLE",
                                  "startAt": "2026-10-09T22:00:00.000Z", "endAt": "2026-10-10T06:00:00.000Z"}],
})
assert availability.status_code in (200, 201), availability.text
calendar_query = {"storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10"}
assert api.get("http://127.0.0.1:4035/api/roster/calendar", params=calendar_query).json()["shifts"] == []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5177/templates", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page).to_have_url(re.compile(r"/templates$"))
        form = page.locator("fieldset").first
        expect(form.locator('button[aria-label="休息"]')).to_be_enabled()
        expect(form.locator('input[type="time"]').first).to_have_value("09:00")
        expect(form.locator('input[type="time"]').nth(1)).to_have_value("22:00")
        expect(form.locator('button[aria-label="休息"]')).to_contain_text("不休息")
        form.locator("input.native-input").first.fill("QA two hour break")
        form.locator('input[type="time"]').nth(1).fill("13:00")
        form.locator('button[aria-label="休息"]').click()
        expect(page.get_by_role("option", name="120 分钟")).to_be_visible()
        page.get_by_role("option", name="120 分钟").click()
        form.locator('button[aria-label="休息"]').click()
        expect(page.get_by_role("option", name="120 分钟")).to_have_attribute("data-state", "checked")
        page.keyboard.press("Escape")
        page.get_by_role("button", name="创建模板").first.click()
        expect(page.get_by_text("QA two hour break", exact=True)).to_be_visible()
        templates = api.get("http://127.0.0.1:4035/api/roster/templates", params={"storeId": "browser-store"}).json()
        assert any(row["name"] == "QA two hour break" and row["breakMinutes"] == 120 for row in templates), templates

        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-10", wait_until="domcontentloaded")
        expect(page.locator(".fc-timegrid")).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        slot = page.locator('.fc-timegrid-slot-lane[data-time="09:00:00"]')
        slot.scroll_into_view_if_needed()
        slot_box = slot.bounding_box()
        day_box = page.locator('.fc-timegrid-col[data-date="2026-10-10"]').bounding_box()
        assert slot_box and day_box
        page.mouse.click(day_box["x"] + day_box["width"] * 0.6, slot_box["y"] + slot_box["height"] * 0.5)
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        dialog.get_by_role("button", name=re.compile("QA two hour break")).click()
        expect(dialog.get_by_role("combobox", name="休息")).to_contain_text("120 分钟")
        expect(dialog.get_by_role("textbox", name="开始时间")).to_have_value("09:00")
        expect(dialog.get_by_role("textbox", name="结束时间")).to_have_value("13:00")
        dialog.get_by_role("radio", name="QA Front").locator("..").click()
        dialog.get_by_role("button", name=re.compile("HandoverEmployee006")).click()
        dialog.get_by_role("button", name=re.compile("保存班次")).click()
        expect(dialog).to_have_count(0)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".fc-timegrid-event")).to_have_count(1)
        shifts = api.get("http://127.0.0.1:4035/api/roster/calendar", params=calendar_query).json()["shifts"]
        assert len(shifts) == 1, shifts
        assert shifts[0]["breakMinutes"] == 120, shifts
        assert (shifts[0]["startAt"], shifts[0]["endAt"]) == (
            "2026-10-09T22:00:00.000Z", "2026-10-10T02:00:00.000Z"), shifts
        assert [assignment["employeeId"] for assignment in shifts[0]["assignments"]] == ["browser-HandoverEmployee006"]
        assert not errors, errors
        print(json.dumps({"verified": True, "newPresetDefaults": "09:00-22:00/break0", "templateBreakMinutes": 120,
                          "dayDialogBreakMinutes": 120, "savedShiftBreakMinutes": 120,
                          "savedStartAt": shifts[0]["startAt"], "savedEndAt": shifts[0]["endAt"],
                          "employeeId": "browser-HandoverEmployee006", "reloadPersisted": True,
                          "pageErrors": 0}))
    finally:
        browser.close()
