"""Fault-inject Script preview and commit responses against disposable services."""

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
base = "http://127.0.0.1:4035/api"

api = requests.Session()
api.post(base + "/auth/login", json=credential, timeout=10).raise_for_status()
settings = api.get(base + "/roster/settings", params={"storeId": "browser-store"}, timeout=10)
settings.raise_for_status()
if settings.json()["settings"] is None:
    api.put(base + "/roster/settings/browser-store", json={
        "storeId": "browser-store", "timezone": "Australia/Sydney",
        "openingTime": "09:00", "closingTime": "22:00", "slotIntervalMinutes": 30,
        "minimumShiftMinutes": 60, "defaultBreakMinutes": 0, "weekStartsOn": 1,
        "cycleType": "WEEK", "weeklyHourWarning": 38, "dailyHourWarning": 10,
    }, timeout=10).raise_for_status()
shortcuts = api.get(base + "/roster/availability-script/shortcuts",
                    params={"storeId": "browser-store"}, timeout=10)
shortcuts.raise_for_status()
if shortcuts.json()["configuration"] is None:
    api.put(base + "/roster/availability-script/shortcuts", json={
        "storeId": "browser-store", "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}],
    }, timeout=10).raise_for_status()
query = {"storeId": "browser-store", "from": "2026-11-02", "to": "2026-11-08", "employeeId": "browser-HandoverEmployee006"}
before = api.get(base + "/roster/availability", params=query, timeout=10)
before.raise_for_status()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        page_errors = []
        preview_calls = []
        commit_calls = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        def preview_route(route):
            preview_calls.append(route.request.post_data_json)
            response = route.fetch()
            assert response.status == 200, (response.status, response.text())
            if len(preview_calls) == 1:
                body = response.json()
                body["issues"] = None
                route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
            else:
                route.fulfill(response=response)

        def commit_route(route):
            commit_calls.append(route.request.post_data_json)
            route.fulfill(status=200, content_type="application/json", body=json.dumps({
                "importId": "wrong-count", "alreadyImported": False, "created": 0, "unchanged": 0,
            }))

        page.route("**/api/roster/availability-script/preview", preview_route)
        page.route("**/api/roster/availability-script/commit", commit_route)
        page.goto("http://127.0.0.1:5177/staff?store=browser-store", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        opener = page.get_by_role("button", name="Edit Preset Time Slot Script")
        expect(opener).to_be_enabled(timeout=15000)
        opener.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        dialog.get_by_label("Script", exact=True).fill("HandoverEmployee006\t1AA")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_role("alert")).to_contain_text("脚本预览响应不完整", timeout=15000)
        expect(dialog.get_by_role("button", name="确认追加 0 条")).to_be_disabled()
        assert not commit_calls

        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("候选新增 1 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="确认追加 1 条").click()
        expect(dialog.get_by_role("alert")).to_contain_text("导入结果仍未确认", timeout=15000)
        expect(page.get_by_text("可用时间脚本已导入")).to_have_count(0)
        assert len(commit_calls) == 2 and commit_calls[0] == commit_calls[1], commit_calls
        after = api.get(base + "/roster/availability", params=query, timeout=10)
        after.raise_for_status()
        assert after.json() == before.json()
        assert not page_errors, page_errors
        print(json.dumps({"verified": True, "previewCalls": len(preview_calls),
                          "malformedPreviewRejected": True, "commitCalls": len(commit_calls),
                          "sameRetryRequest": True, "wrongCountUnconfirmed": True,
                          "databaseUnchanged": True, "pageErrors": page_errors}))
    finally:
        browser.close()
