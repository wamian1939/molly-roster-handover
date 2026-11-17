"""Verify Copy Day UI and Repeat API block an out-of-period source Shift."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1200, "height": 850}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="复制一天").click()
        dialog = page.get_by_role("dialog")
        dates = dialog.locator('input[type="date"]')
        expect(dates).to_have_count(2)
        dates.nth(0).fill("2026-10-12")
        dates.nth(1).fill("2026-10-19")
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day/preview")) as preview_info:
            dialog.get_by_role("button", name="检查冲突").click()
        preview_response = preview_info.value
        preview = preview_response.json()
        if preview_response.status != 200 or preview.get("canCopy") or not any(
            issue.get("code") == "SHIFT_PERIOD_MISMATCH" and issue.get("shiftId") == "qa-misplaced-shift"
            for issue in preview.get("issues", [])
        ):
            raise AssertionError(f"Unexpected Copy Day preview: {preview_response.status} {preview}")
        expect(dialog.get_by_role("alert")).to_contain_text("所属排班周期不一致")
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()
        day_execute = page.context.request.post("http://127.0.0.1:4035/api/roster/batch/copy-day", data={
            "storeId": "browser-store", "sourceDate": "2026-10-12", "targetDate": "2026-10-19",
            "expectedSourcePeriodVersion": preview["sourcePeriodVersion"],
            "expectedTargetPeriodVersion": preview["targetPeriodVersion"],
        })
        if day_execute.status != 409 or day_execute.json().get("validation", {}).get("code") != "SHIFT_PERIOD_MISMATCH":
            raise AssertionError(f"Unexpected Copy Day execute: {day_execute.status} {day_execute.text()}")
        repeat_preview_response = page.context.request.post("http://127.0.0.1:4035/api/roster/batch/repeat/preview", data={
            "storeId": "browser-store", "sourceShiftId": "qa-misplaced-shift", "targetDates": ["2026-10-26"],
        })
        repeat_preview = repeat_preview_response.json()
        if repeat_preview_response.status != 200 or repeat_preview.get("canCopy") or not any(
            issue.get("code") == "SHIFT_PERIOD_MISMATCH" for issue in repeat_preview.get("issues", [])
        ):
            raise AssertionError(f"Unexpected Repeat preview: {repeat_preview_response.status} {repeat_preview}")
        repeat_execute = page.context.request.post("http://127.0.0.1:4035/api/roster/batch/repeat", data={
            "storeId": "browser-store", "sourceShiftId": "qa-misplaced-shift", "targetDates": ["2026-10-26"],
            "expectedSourcePeriodVersion": repeat_preview["sourcePeriodVersion"],
            "expectedTargetPeriodVersions": repeat_preview["targetPeriodVersions"],
        })
        if repeat_execute.status != 409 or repeat_execute.json().get("validation", {}).get("code") != "SHIFT_PERIOD_MISMATCH":
            raise AssertionError(f"Unexpected Repeat execute: {repeat_execute.status} {repeat_execute.text()}")
        dialog.get_by_role("button", name="取消").click()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        print(json.dumps({"verified": True, "dayPreviewIssue": "SHIFT_PERIOD_MISMATCH", "dayExecuteHttp": day_execute.status,
                          "repeatPreviewIssue": "SHIFT_PERIOD_MISMATCH", "repeatExecuteHttp": repeat_execute.status,
                          "calendarReloaded": True}))
    finally:
        browser.close()
