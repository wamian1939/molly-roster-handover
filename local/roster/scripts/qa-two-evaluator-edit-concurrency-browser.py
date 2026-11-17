"""Two disposable evaluator sessions must reject a stale Edit without losing either draft."""

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

admin = evaluate["credentials"]["browser-admin"]
evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=admin).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code in (201, 409), job.text

base = "http://127.0.0.1:4035/api"
api = requests.Session()
api.post(base + "/auth/login", json=admin).raise_for_status()
availability_rows = api.get(base + "/roster/availability", params={
    "storeId": "browser-store", "employeeId": "browser-regular", "from": "2026-10-09", "to": "2026-10-09",
}).json()
if not availability_rows:
    availability = api.put(base + "/roster/availability", json={
        "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-09"],
        "expectedRows": [], "entries": [{"date": "2026-10-09", "status": "AVAILABLE",
                                      "startAt": "2026-10-08T21:00:00.000Z", "endAt": "2026-10-09T03:00:00.000Z"}],
    })
    assert availability.status_code in (200, 201), availability.text
shift_url = base + "/roster/shifts/qa-draft-shift"
before = api.get(shift_url, params={"storeId": "browser-store"}).json()
published_before = api.get(base + "/roster/periods/qa-published-period/publications", params={"storeId": "browser-store"}).json()


def open_editor(page, credential):
    page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
    page.locator('input[autocomplete="username"]').fill(credential["username"])
    page.locator('input[autocomplete="current-password"]').fill(credential["password"])
    page.locator('button[type="submit"]').click()
    expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
    event = page.locator(".fc-timegrid-event").filter(has_text="Regular Bob")
    expect(event).to_be_visible()
    event.click()
    if page.get_by_role("heading", name="编辑班次").count() == 0:
        page.get_by_role("button", name=re.compile("Regular Bob")).click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_role("heading", name="编辑班次")).to_be_visible()
    return dialog


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        context_a = browser.new_context(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        context_b = browser.new_context(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        page_a, page_b = context_a.new_page(), context_b.new_page()
        dialog_a = open_editor(page_a, evaluate["credentials"]["browser-evaluator-a"])
        dialog_b = open_editor(page_b, evaluate["credentials"]["browser-evaluator-b"])
        note_a, note_b = "Evaluator A unsaved note", "Evaluator B committed note"
        dialog_a.locator("textarea").first.fill(note_a)
        dialog_b.locator("textarea").first.fill(note_b)
        with page_b.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/roster/shifts/qa-draft-shift")) as response_b:
            dialog_b.get_by_role("button", name=re.compile(r"^保存班次")).click()
        assert response_b.value.status == 200, response_b.value.text()
        expect(dialog_b).to_have_count(0)
        with page_a.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/roster/shifts/qa-draft-shift")) as response_a:
            dialog_a.get_by_role("button", name=re.compile(r"^保存班次")).click()
        assert response_a.value.status == 409, response_a.value.text()
        expect(dialog_a.get_by_role("alert").filter(has_text="班次已被其他人修改或删除")).to_be_visible()
        expect(dialog_a.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_disabled()
        expect(dialog_a.locator("textarea").first).to_have_value(note_a)
        dialog_a.get_by_role("button", name="取消").click()
        page_a.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        expect(dialog_a).to_have_count(0)
        event_a = page_a.locator(".fc-timegrid-event").filter(has_text="Regular Bob")
        expect(event_a).to_be_visible()
        event_a.click()
        if page_a.get_by_role("heading", name="编辑班次").count() == 0:
            page_a.get_by_role("button", name=re.compile("Regular Bob")).click()
        refreshed = page_a.get_by_role("dialog")
        expect(refreshed.locator("textarea").first).to_have_value(note_b)
        after = api.get(shift_url, params={"storeId": "browser-store"}).json()
        assert after["version"] == before["version"] + 1
        assert after["publicNote"] == note_b
        assert after["startAt"] == before["startAt"] and after["endAt"] == before["endAt"]
        assert [row["employeeId"] for row in after["assignments"]] == [row["employeeId"] for row in before["assignments"]]
        assert api.get(base + "/roster/periods/qa-published-period/publications", params={"storeId": "browser-store"}).json() == published_before
        print(json.dumps({"verified": True, "identities": ["browser-evaluator-a", "browser-evaluator-b"],
                          "firstSave": 200, "staleSave": 409, "unsavedDraftPreserved": True,
                          "reopenedCommittedNote": True, "oneVersionIncrement": True, "publishedHistoryUnchanged": True}))
    finally:
        browser.close()
