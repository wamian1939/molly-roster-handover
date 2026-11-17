"""A shift deleted by another manager must become read-only in an open editor."""

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
assert job.status_code == 201, job.text

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
for employee_id in ("browser-regular", "browser-training"):
    availability = api.put(base + "/roster/availability", json={
        "storeId": "browser-store", "employeeId": employee_id, "dates": ["2026-10-09"],
        "expectedRows": [], "entries": [{"date": "2026-10-09", "status": "AVAILABLE",
                                  "startAt": "2026-10-08T21:00:00.000Z", "endAt": "2026-10-09T03:00:00.000Z"}],
    })
    assert availability.status_code in (200, 201), availability.text
shifts = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
          for shift_id in ("qa-draft-shift", "qa-draft-grouped-shift")}
published_before = api.get(base + "/roster/periods/qa-published-period/publications", params={
    "storeId": "browser-store",
}).json()
period_before = api.get(base + "/roster/periods/qa-draft-period", params={
    "storeId": "browser-store",
}).json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        page.goto("http://127.0.0.1:5178/calendar?view=dayGridMonth&date=2026-10-09",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        grouped = page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event')
        expect(grouped).to_have_count(1)
        grouped.click()
        chooser = page.get_by_role("dialog")
        chooser.get_by_role("button").filter(has_text="Regular Bob").click()
        editor = page.get_by_role("dialog")
        expect(editor.get_by_role("heading", name="编辑班次")).to_be_visible()
        editor.get_by_role("textbox", name="公开备注").fill("Unsaved manager note")
        deleted = api.delete(base + "/roster/shifts/qa-draft-shift", params={
            "storeId": "browser-store", "version": shifts["qa-draft-shift"]["version"],
        })
        assert deleted.status_code == 204, deleted.text
        with page.expect_response(lambda response: response.request.method == "PATCH"
                                  and response.url.endswith("/roster/shifts/qa-draft-shift")) as save_response:
            editor.get_by_role("button", name=re.compile(r"^保存班次")).click()
        assert save_response.value.status == 404, save_response.value.text()
        expect(editor.get_by_role("textbox", name="公开备注")).to_have_value("Unsaved manager note")
        expect(editor.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_disabled(timeout=15000)
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        editor.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        expect(page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event')).to_have_count(1)

        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event').click()
        editor = page.get_by_role("dialog")
        expect(editor.get_by_role("heading", name="编辑班次")).to_be_visible()
        deleted = api.delete(base + "/roster/shifts/qa-draft-grouped-shift", params={
            "storeId": "browser-store", "version": shifts["qa-draft-grouped-shift"]["version"],
        })
        assert deleted.status_code == 204, deleted.text
        editor.get_by_role("button", name="删除班次").click()
        with page.expect_response(lambda response: response.request.method == "DELETE"
                                  and "/roster/shifts/qa-draft-grouped-shift?" in response.url) as delete_response:
            editor.get_by_role("button", name="确认删除").click()
        assert delete_response.value.status == 404, delete_response.value.text()
        expect(editor.get_by_role("button", name="确认删除")).to_be_disabled(timeout=15000)
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        editor.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        expect(page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event')).to_have_count(0)
        for shift_id in shifts:
            assert api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).status_code == 404
        period_after = api.get(base + "/roster/periods/qa-draft-period", params={
            "storeId": "browser-store",
        }).json()
        assert period_after["version"] == period_before["version"] + 2
        assert api.get(base + "/roster/periods/qa-published-period/publications", params={
            "storeId": "browser-store",
        }).json() == published_before
        print(json.dumps({"verified": True, "saveStatus": save_response.value.status,
                          "deleteStatus": delete_response.value.status, "staleEditorsDisabled": True,
                          "browserExtraWrites": 0, "publishedHistoryUnchanged": True}))
    finally:
        browser.close()
