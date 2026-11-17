"""Fault-inject Copy Day preview and commit responses in disposable services."""

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

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential, timeout=10).raise_for_status()
base = "http://127.0.0.1:4035/api"
settings = api.get(base + "/roster/settings", params={"storeId": "browser-store"}, timeout=10)
settings.raise_for_status()
if settings.json()["settings"] is None:
    saved_settings = api.put(base + "/roster/settings/browser-store", json={
        "storeId": "browser-store", "timezone": "Australia/Sydney",
        "openingTime": "00:00", "closingTime": "23:59", "slotIntervalMinutes": 30,
        "minimumShiftMinutes": 60, "defaultBreakMinutes": 0, "weekStartsOn": 1,
        "cycleType": "WEEK", "weeklyHourWarning": 38, "dailyHourWarning": 10,
    }, timeout=10)
    saved_settings.raise_for_status()

query = {"storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-10"}
calendar_url = base + "/roster/calendar"
before = api.get(calendar_url, params=query, timeout=10)
before.raise_for_status()
before_data = before.json()
assert len(before_data["shifts"]) == 2

source_date, target_date = "2026-10-09", "2026-10-10"
valid_preview = {
    "policy": "ALL_OR_NOTHING", "shiftCount": 1, "readyShifts": 1,
    "availableAssignments": 1, "blockedAssignments": 0,
    "unavailableAssignments": 0, "conflictingAssignments": 0,
    "issues": [], "canCopy": True, "sourceDate": source_date, "targetDate": target_date,
    "sourcePeriodVersion": 1, "targetPeriodVersion": 1,
}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        page_errors = []
        copy_posts = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        def malformed_preview(route):
            request = route.request.post_data_json
            body = {**valid_preview, "sourceDate": request["sourceDate"],
                    "targetDate": request["targetDate"], "issues": None}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

        def valid_response(route):
            request = route.request.post_data_json
            assert request["sourceDate"] == source_date and request["targetDate"] == target_date
            route.fulfill(status=200, content_type="application/json", body=json.dumps(valid_preview))

        def wrong_version_copy(route):
            copy_posts.append(route.request.post_data_json)
            route.fulfill(status=201, content_type="application/json", body=json.dumps({
                "created": 1, "period": {"id": "wrong-version-period", "storeId": "browser-store",
                "startDate": "2026-10-05", "endDate": "2026-10-11", "cycleType": "WEEK",
                "status": "DRAFT", "version": 99, "publishedAt": None},
            }))

        page.route("**/roster/batch/copy-day/preview", malformed_preview)
        page.route("**/roster/batch/copy-day", wrong_version_copy)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="排班操作").click()
        page.get_by_role("button", name="复制一天").click()
        dialog = page.get_by_role("dialog", name="复制一天")
        dialog.get_by_label("来源日期").fill(source_date)
        dialog.get_by_label("目标日期").fill(target_date)
        expect(dialog.get_by_role("alert")).to_contain_text("预览响应不完整", timeout=15000)
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()
        assert copy_posts == []

        page.unroute("**/roster/batch/copy-day/preview", malformed_preview)
        page.route("**/roster/batch/copy-day/preview", valid_response)
        dialog.get_by_role("button", name="检查冲突").click()
        expect(dialog.get_by_text("无冲突，可以复制。")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="复制为草稿").click()
        expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=15000)
        expect(page.get_by_text("已复制一天", exact=True)).to_have_count(0)
        expect(dialog).to_have_count(0)
        assert len(copy_posts) == 1
        assert copy_posts[0]["sourceDate"] == source_date and copy_posts[0]["targetDate"] == target_date

        after = api.get(calendar_url, params=query, timeout=10)
        after.raise_for_status()
        assert after.json() == before_data
        assert not page_errors, page_errors
        print(json.dumps({"verified": True, "malformedPreviewRejected": True,
                          "wrongVersionCopyNotConfirmed": True, "copyRequestsIntercepted": len(copy_posts),
                          "calendarUnchanged": True, "pageErrors": len(page_errors)}))
    finally:
        browser.close()
