"""Recover a committed published-source Copy Shift whose 201 JSON is unreadable."""

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

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
availability = api.put(base + "/roster/availability", json={
    "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-24"], "expectedRows": [],
    "entries": [{"date": "2026-10-24", "status": "AVAILABLE",
                 "startAt": "2026-10-23T21:00:00.000Z", "endAt": "2026-10-24T03:00:00.000Z"}],
})
assert availability.status_code in (200, 201), availability.text
target_params = {"storeId": "browser-store", "from": "2026-10-24", "to": "2026-10-24"}
target_url = base + "/roster/calendar"
assert api.get(target_url, params=target_params).json()["shifts"] == []
source_url = base + "/roster/shifts/qa-published-shift"
source_before = api.get(source_url, params={"storeId": "browser-store"}).json()
publication_url = base + "/roster/periods/qa-published-period/publications"
publication_before = api.get(publication_url, params={"storeId": "browser-store"}).json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        commits = []

        def corrupt_success(route):
            response = route.fetch()
            commits.append(response.status)
            if response.status == 201:
                route.fulfill(status=201, content_type="application/json", body="{broken")
            else:
                route.fulfill(response=response)

        page.route("**/api/roster/shifts/with-period", corrupt_success)
        page.goto("http://127.0.0.1:5178/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator(".fc-timegrid-event").filter(has_text="Regular Bob").click()
        page.get_by_role("dialog").get_by_role("button", name="复制班次").click()
        copy = page.get_by_role("dialog")
        copy.get_by_label("复制到日期").fill("2026-10-24")
        expect(copy.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_enabled(timeout=15000)
        copy.get_by_role("button", name=re.compile(r"^保存班次")).click()
        expect(copy).to_have_count(0, timeout=15000)
        expect(page).to_have_url(re.compile(r"date=2026-10-24"), timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="Regular Bob")).to_be_visible(timeout=15000)
        assert commits == [201], commits
    finally:
        browser.close()

target = api.get(target_url, params=target_params).json()["shifts"]
assert len(target) == 1
assert target[0]["id"] != source_before["id"]
assert api.get(source_url, params={"storeId": "browser-store"}).json() == source_before
assert api.get(publication_url, params={"storeId": "browser-store"}).json() == publication_before
print(json.dumps({"committedStatus": 201, "unreadableBodyRecovered": True, "targetDateVisible": "2026-10-24", "targetCount": 1, "sourceUnchanged": True}))
