"""Confirm an empty Copy Week source is blocked in the UI and database."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-27"] .fc-daygrid-day-number').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy/preview")) as preview_info:
            page.locator(".calendar-toolbar button").filter(has_text="复制上一周").click()
        preview_response = preview_info.value
        preview = preview_response.json()
        if preview_response.status != 200 or preview.get("canCopy") or preview.get("shiftCount") != 0 or not any(
            issue.get("code") == "NO_SOURCE_SHIFTS" for issue in preview.get("issues", [])
        ):
            raise AssertionError(f"Unexpected empty-week preview: {preview_response.status} {preview}")
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("alert")).to_contain_text("来源周期没有可复制的班次")
        expect(dialog.locator(".calendar-primary-button")).to_be_disabled()
        forced = page.context.request.post("http://127.0.0.1:4035/api/roster/batch/copy", data={
            "storeId": "browser-store", "sourcePeriodId": "qa-empty-source-week", "targetStartDate": "2026-10-26",
            "expectedSourcePeriodVersion": preview["sourcePeriodVersion"],
        })
        if forced.status != 422:
            raise AssertionError(f"Expected forced empty Copy Week to fail with 422, got {forced.status}")
        dialog.locator(".calendar-text-button").last.click()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        print(json.dumps({"verified": True, "previewIssue": "NO_SOURCE_SHIFTS", "copyDisabled": True,
                          "forcedExecuteHttp": forced.status, "calendarReloaded": True}))
    finally:
        browser.close()
