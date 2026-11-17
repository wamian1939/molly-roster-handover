"""Exercise stale Copy Day/Week previews in disposable paired PostgreSQL schemas."""

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
for employee_id in ("browser-regular", "browser-training"):
    for date, start, end in (
        ("2026-10-09", "2026-10-08T21:00:00.000Z", "2026-10-09T03:00:00.000Z"),
        ("2026-10-10", "2026-10-09T21:00:00.000Z", "2026-10-10T03:00:00.000Z"),
        ("2026-10-23", "2026-10-22T21:00:00.000Z", "2026-10-23T03:00:00.000Z"),
    ):
        response = api.put(base + "/roster/availability", json={
            "storeId": "browser-store", "employeeId": employee_id, "dates": [date], "expectedRows": [],
            "entries": [{"date": date, "status": "AVAILABLE", "startAt": start, "endAt": end}],
        })
        assert response.status_code in (200, 201), response.text


def calendar(date):
    response = api.get(base + "/roster/calendar", params={"storeId": "browser-store", "from": date, "to": date})
    response.raise_for_status()
    return response.json()


assert not calendar("2026-10-10")["shifts"]
assert not calendar("2026-10-23")["shifts"]
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)

        page.get_by_role("button", name="复制一天").click()
        day_dialog = page.get_by_role("dialog")
        day_dialog.get_by_label("来源日期").fill("2026-10-09")
        day_dialog.get_by_label("目标日期").fill("2026-10-10")
        with page.expect_response(lambda response: response.url.endswith("/roster/batch/copy-day/preview")) as preview_response:
            day_dialog.get_by_role("button", name="检查冲突").click()
        day_preview = preview_response.value.json()
        assert day_preview["canCopy"] and day_preview["shiftCount"] == 2, day_preview
        expect(day_dialog.get_by_text("2/2")).to_be_visible()

        source = api.get(base + "/roster/shifts/qa-draft-shift", params={"storeId": "browser-store"}).json()
        changed = api.post(base + "/roster/batch/update", json={
            "storeId": "browser-store", "items": [{"id": source["id"], "version": source["version"]}],
            "patch": {"publicNote": "Changed after Copy Day preview"},
        })
        assert changed.status_code == 200, changed.text
        with page.expect_response(lambda response: response.url.endswith("/roster/batch/copy-day")) as commit_response:
            day_dialog.get_by_role("button", name="复制为草稿").click()
        assert commit_response.value.status == 409, commit_response.value.text()
        expect(day_dialog).to_be_visible()
        expect(day_dialog.get_by_text("2/2")).to_have_count(0)
        assert not calendar("2026-10-10")["shifts"]
        assert calendar("2026-10-09")["periods"][0]["version"] > day_preview["sourcePeriodVersion"]

        day_dialog.get_by_role("button", name="检查冲突").click()
        expect(day_dialog.get_by_text("2/2")).to_be_visible(timeout=15000)
        with page.expect_response(lambda response: response.url.endswith("/roster/batch/copy-day")) as fresh_response:
            day_dialog.get_by_role("button", name="复制为草稿").click()
        assert fresh_response.value.status == 201, fresh_response.value.text()
        expect(day_dialog).to_have_count(0)
        assert len(calendar("2026-10-10")["shifts"]) == 2

        page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="复制到下一周期").click()
        week_dialog = page.get_by_role("dialog")
        expect(week_dialog.get_by_text("所有班次均可复制")).to_be_visible(timeout=15000)
        source_period = api.get(base + "/roster/periods/qa-published-period", params={"storeId": "browser-store"}).json()
        reopened = api.post(base + "/roster/periods/qa-published-period/reopen", json={
            "storeId": "browser-store", "version": source_period["version"],
        })
        assert reopened.status_code == 200, reopened.text
        with page.expect_response(lambda response: response.url.endswith("/roster/batch/copy")) as stale_week_response:
            week_dialog.get_by_role("button", name="复制为草稿").click()
        assert stale_week_response.value.status == 409, stale_week_response.value.text()
        expect(week_dialog).to_have_count(0)
        assert not calendar("2026-10-23")["shifts"]
        assert api.get(base + "/roster/periods/qa-published-period/publications", params={"storeId": "browser-store"}).json()
        page.get_by_role("button", name="复制到下一周期").click()
        fresh_week_dialog = page.get_by_role("dialog")
        expect(fresh_week_dialog.get_by_text("所有班次均可复制")).to_be_visible(timeout=15000)
        with page.expect_response(lambda response: response.url.endswith("/roster/batch/copy")) as fresh_week_response:
            fresh_week_dialog.get_by_role("button", name="复制为草稿").click()
        assert fresh_week_response.value.status == 201, fresh_week_response.value.text()
        expect(fresh_week_dialog).to_have_count(0)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        assert len(calendar("2026-10-23")["shifts"]) == 1
        print(json.dumps({"verified": True, "copyDayStaleStatus": commit_response.value.status,
                          "copyDayFreshStatus": fresh_response.value.status,
                          "copyDayTargetShifts": len(calendar("2026-10-10")["shifts"]),
                          "copyWeekStaleStatus": stale_week_response.value.status,
                          "copyWeekFreshStatus": fresh_week_response.value.status,
                          "copyWeekTargetShifts": len(calendar("2026-10-23")["shifts"]),
                          "publishedHistoryRetained": True}))
    finally:
        browser.close()
