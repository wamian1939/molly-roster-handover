"""An uncertain Copy must not claim that another administrator's identical Shift is ours."""

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
job_id = job.json()["id"] if job.status_code == 201 else next(item["id"] for item in evaluate_api.get(
    "http://127.0.0.1:4010/api/store-jobs", params={"storeId": "browser-store", "includeInactive": "true"}).json() if item["code"] == "qa-front")

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
availability = api.put(base + "/roster/availability", json={
    "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-23"], "expectedRows": [],
    "entries": [{"date": "2026-10-23", "status": "AVAILABLE",
                 "startAt": "2026-10-22T21:00:00.000Z", "endAt": "2026-10-23T03:00:00.000Z"}],
})
assert availability.status_code in (200, 201), availability.text
source = api.get(base + "/roster/shifts/qa-published-shift", params={"storeId": "browser-store"}).json()
target_params = {"storeId": "browser-store", "from": "2026-10-23", "to": "2026-10-23"}
target_url = base + "/roster/calendar"
assert api.get(target_url, params=target_params).json()["shifts"] == []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        attempts = []

        def uncertain_without_commit(route):
            attempts.append(route.request.post_data_json)
            route.fulfill(status=500, content_type="application/json", body='{"error":"response lost"}')

        page.route("**/api/roster/shifts/with-period", uncertain_without_commit)
        page.goto("http://127.0.0.1:5178/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator(".fc-timegrid-event").filter(has_text="Regular Bob").click()
        page.get_by_role("dialog").get_by_role("button", name="其他班次操作").click()
        page.get_by_role("dialog").get_by_role("button", name="复制班次").click()
        copy = page.get_by_role("dialog")
        expect(copy.get_by_label("复制到日期")).to_have_value("2026-10-23")
        save = copy.get_by_role("button", name=re.compile(r"^保存班次"))
        expect(save).to_be_enabled(timeout=15000)

        other = api.post(base + "/roster/shifts/with-period", json={
            "storeId": "browser-store", "targetStartDate": "2026-10-19", "targetEndDate": "2026-10-25",
            "date": "2026-10-23", "startAt": "2026-10-22T22:00:00.000Z",
            "endAt": "2026-10-23T02:00:00.000Z", "breakMinutes": source["breakMinutes"],
            "shiftRoleId": source["shiftRoleId"], "employeeIds": ["browser-regular"],
            "publicNote": source["publicNote"] or "", "internalNote": source["internalNote"] or "",
        })
        assert other.status_code == 201, other.text
        other_shift = other.json()
        save.click()
        expect(copy).to_be_visible(timeout=15000)
        expect(save).to_be_disabled(timeout=15000)
        expect(page).to_have_url(re.compile(r"date=2026-10-16"))
        assert len(attempts) == 1, attempts
        assert attempts[0]["startAt"] == other_shift["startAt"], attempts
        assert attempts[0]["endAt"] == other_shift["endAt"], attempts
        assert attempts[0]["clientShiftId"] != other_shift["id"], attempts

        # A non-committed attempt keeps one request ID for a safe retry.
        next_availability = api.put(base + "/roster/availability", json={
            "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-25"],
            "expectedRows": [], "entries": [{"date": "2026-10-25", "status": "AVAILABLE",
                                           "startAt": "2026-10-24T21:00:00.000Z", "endAt": "2026-10-25T03:00:00.000Z"}],
        })
        assert next_availability.status_code in (200, 201), next_availability.text
        second = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        retry_attempts = []

        def fail_then_commit(route):
            retry_attempts.append(route.request.post_data_json)
            if len(retry_attempts) == 1:
                route.fulfill(status=500, content_type="application/json", body='{"error":"response lost"}')
            else:
                route.fulfill(response=route.fetch())

        second.route("**/api/roster/shifts/with-period", fail_then_commit)
        second.goto("http://127.0.0.1:5178/", wait_until="domcontentloaded")
        second.locator('input[autocomplete="username"]').fill(credential["username"])
        second.locator('input[autocomplete="current-password"]').fill(credential["password"])
        second.locator('button[type="submit"]').click()
        expect(second.locator(".calendar-surface")).to_be_visible(timeout=15000)
        second.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-16", wait_until="domcontentloaded")
        expect(second.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        second.locator(".fc-timegrid-event").filter(has_text="Regular Bob").click()
        second.get_by_role("dialog").get_by_role("button", name="其他班次操作").click()
        second.get_by_role("dialog").get_by_role("button", name="复制班次").click()
        second_copy = second.get_by_role("dialog")
        second_copy.get_by_label("复制到日期").fill("2026-10-25")
        second_save = second_copy.get_by_role("button", name=re.compile(r"^保存班次"))
        expect(second_save).to_be_enabled(timeout=15000)
        second_save.click()
        expect(second_copy).to_be_visible(timeout=15000)
        expect(second).to_have_url(re.compile(r"date=2026-10-16"))
        expect(second_save).to_be_enabled(timeout=15000)
        second_save.click()
        expect(second_copy).to_have_count(0, timeout=15000)
        expect(second).to_have_url(re.compile(r"date=2026-10-25"), timeout=15000)
        assert len(retry_attempts) == 2, retry_attempts
        assert retry_attempts[0]["clientShiftId"] == retry_attempts[1]["clientShiftId"]
        after_retry = api.get(target_url, params={**target_params, "from": "2026-10-25", "to": "2026-10-25"}).json()["shifts"]
        assert len(after_retry) == 1 and after_retry[0]["id"] == retry_attempts[0]["clientShiftId"]
        replay = api.post(base + "/roster/shifts/with-period", json=retry_attempts[1])
        assert replay.status_code == 200 and replay.json()["id"] == after_retry[0]["id"], replay.text
        deactivated = evaluate_api.patch("http://127.0.0.1:4010/api/store-jobs/" + job_id, json={"isActive": False})
        assert deactivated.status_code == 200, deactivated.text
        replay_without_current_job = api.post(base + "/roster/shifts/with-period", json=retry_attempts[1])
        assert replay_without_current_job.status_code == 200 and replay_without_current_job.json()["id"] == after_retry[0]["id"], replay_without_current_job.text
        assert len(api.get(target_url, params={**target_params, "from": "2026-10-25", "to": "2026-10-25"}).json()["shifts"]) == 1
        assert len(attempts) == 1, attempts
    finally:
        browser.close()

target = api.get(target_url, params=target_params).json()["shifts"]
assert len(target) == 1 and target[0]["id"] == other_shift["id"]
assert api.get(base + "/roster/shifts/qa-published-shift", params={"storeId": "browser-store"}).json() == source
print(json.dumps({"uncertainRequestCommitted": False, "otherShiftIdPreserved": other_shift["id"],
                  "copyDraftRetained": True, "retryDisabledAfterTargetRefresh": True,
                  "retryUsedSameShiftId": True, "replayMadeNoDuplicate": True,
                  "replayAfterJobRetired": True, "targetCount": 1}))
