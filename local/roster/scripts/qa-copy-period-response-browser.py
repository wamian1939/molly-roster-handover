"""Check Copy Period preview and mutation response boundaries in disposable services."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster_state = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate_state = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster_state["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate_state["schema"])
credential = evaluate_state["credentials"]["browser-admin"]

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential, timeout=10).raise_for_status()
calendar_url = "http://127.0.0.1:4035/api/roster/calendar"
query = {"storeId": "browser-store", "from": "2026-10-19", "to": "2026-10-25"}
before = api.get(calendar_url, params=query, timeout=10)
before.raise_for_status()
before_data = before.json()

preview = {"policy": "ALL_OR_NOTHING", "shiftCount": 1, "readyShifts": 1,
           "availableAssignments": 1, "blockedAssignments": 0,
           "unavailableAssignments": 0, "conflictingAssignments": 0,
           "issues": [], "canCopy": True, "targetStartDate": "2026-10-19",
           "sourcePeriodVersion": 1}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        page_errors = []
        copy_posts = []
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-19", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)

        def open_copy():
            page.get_by_role("button", name="排班操作").click()
            page.get_by_role("button", name="复制上一周").click()

        def malformed_preview(route):
            route.fulfill(status=200, content_type="application/json", body=json.dumps({**preview, "issues": None}))

        page.route("**/roster/batch/copy/preview", malformed_preview)
        open_copy()
        expect(page.get_by_text("复制上一周预览失败")).to_be_visible(timeout=15000)
        expect(page.get_by_role("dialog", name="复制上一周期")).to_have_count(0)
        page.unroute("**/roster/batch/copy/preview", malformed_preview)

        def valid_preview(route):
            route.fulfill(status=200, content_type="application/json", body=json.dumps(preview))

        def wrong_store_copy(route):
            copy_posts.append(route.request.post_data_json)
            route.fulfill(status=201, content_type="application/json", body=json.dumps({
                "id": "unexpected-period", "storeId": "another-store",
                "startDate": "2026-10-19", "endDate": "2026-10-25",
                "cycleType": "WEEK", "status": "DRAFT", "version": 1,
                "publishedAt": None,
            }))

        page.route("**/roster/batch/copy/preview", valid_preview)
        page.route("**/roster/batch/copy", wrong_store_copy)
        open_copy()
        dialog = page.get_by_role("dialog", name="复制上一周期")
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_enabled(timeout=15000)
        dialog.get_by_role("button", name="复制为草稿").click()
        expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=10000)
        expect(page.get_by_text("草稿已复制", exact=True)).to_have_count(0)
        expect(dialog).to_have_count(0)
        assert len(copy_posts) == 1, copy_posts
        assert copy_posts[0]["storeId"] == "browser-store"
        assert copy_posts[0]["targetStartDate"] == "2026-10-19"

        after = api.get(calendar_url, params=query, timeout=10)
        after.raise_for_status()
        assert after.json() == before_data
        assert not page_errors, page_errors
        print(json.dumps({"verified": True, "malformedPreviewRejected": True,
                          "wrongStoreCopyNotConfirmed": True, "copyRequestsIntercepted": len(copy_posts),
                          "targetCalendarUnchanged": True, "pageErrors": len(page_errors)}))
    finally:
        browser.close()
