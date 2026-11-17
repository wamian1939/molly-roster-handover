"""Verify current draft names in a grouped card while published names stay frozen."""

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
renamed = evaluate_api.put("http://127.0.0.1:4010/api/employees/browser-regular", json={
    "displayName": "Renamed Bob",
})
assert renamed.status_code == 200, renamed.text

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
before_drafts = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                 for shift_id in ("qa-draft-shift", "qa-draft-grouped-shift")}
published_before = api.get(base + "/roster/periods/qa-published-period/publications", params={
    "storeId": "browser-store",
}).json()
assert before_drafts["qa-draft-shift"]["assignments"][0]["employeeNameSnapshot"] == "Regular Bob"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append(request.url)
                if request.method not in ("GET", "OPTIONS") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5178/calendar?view=dayGridMonth&date=2026-10-09",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)

        draft_card = page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event')
        expect(draft_card).to_have_count(1)
        expect(draft_card).to_contain_text("Renamed Bob")
        draft_card.click()
        chooser = page.get_by_role("dialog")
        expect(chooser.get_by_role("button").filter(has_text="Renamed Bob")).to_have_count(1)
        expect(chooser.get_by_role("button").filter(has_text="Training Alice")).to_have_count(1)
        expect(chooser).not_to_contain_text("Regular Bob")
        chooser.get_by_role("button").filter(has_text="Renamed Bob").click()
        editor = page.get_by_role("dialog")
        expect(editor.get_by_role("heading", name="编辑班次")).to_be_visible()
        expect(editor).to_contain_text("Renamed Bob")
        page.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()

        page.goto("http://127.0.0.1:5178/calendar?view=dayGridMonth&date=2026-10-16",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        published_card = page.locator('.fc-daygrid-day[data-date="2026-10-16"] .fc-daygrid-event')
        expect(published_card).to_have_count(1)
        expect(published_card).to_contain_text("Regular Bob")
        expect(published_card).not_to_contain_text("Renamed Bob")
        published_card.click()
        expect(page.get_by_role("dialog")).to_contain_text("Regular Bob")

        after_drafts = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                        for shift_id in before_drafts}
        assert after_drafts == before_drafts
        assert api.get(base + "/roster/periods/qa-published-period/publications", params={
            "storeId": "browser-store",
        }).json() == published_before
        assert mutations == [], mutations
        print(json.dumps({"verified": True, "groupedDraftCurrentName": "Renamed Bob",
                          "publishedFrozenName": "Regular Bob", "rosterMutations": 0,
                          "draftAndPublicationSnapshotsUnchanged": True}))
    finally:
        browser.close()
