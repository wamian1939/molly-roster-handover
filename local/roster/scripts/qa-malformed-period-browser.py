"""Verify a malformed historical WEEK cannot be copied or published."""

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
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        page.get_by_role("button", name="下一页").click()
        day = page.locator('.fc-daygrid-day[data-date="2026-11-02"]')
        expect(day).to_be_visible()
        day.locator(".fc-daygrid-day-number").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="复制到下一周期").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_contain_text("来源排班周期长度与周或双周类型不符")
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()

        base = "http://127.0.0.1:4035/api"
        roles = page.request.get(f"{base}/roster/roles?storeId=browser-store")
        if roles.status != 200:
            raise AssertionError(f"Fixture roles unavailable: {roles.status}")
        role = next(item for item in roles.json() if item["code"] == "qa-front")
        shift_input = {"storeId": "browser-store", "date": "2026-11-02",
            "startAt": "2026-11-01T23:00:00.000Z", "endAt": "2026-11-02T00:00:00.000Z",
            "breakMinutes": 0, "shiftRoleId": role["id"], "employeeIds": ["browser-cindy"]}
        auto_create = page.request.post(f"{base}/roster/shifts/with-period", data={**shift_input,
            "targetStartDate": "2026-11-02", "targetEndDate": "2026-11-08"})
        explicit_create = page.request.post(f"{base}/roster/shifts", data={**shift_input,
            "rosterPeriodId": "qa-malformed-period"})
        edit = page.request.patch(f"{base}/roster/shifts/qa-malformed-shift", data={**shift_input,
            "startAt": "2026-11-01T22:00:00.000Z", "endAt": "2026-11-01T23:00:00.000Z",
            "employeeIds": ["browser-HandoverEmployee006"], "rosterPeriodId": "qa-malformed-period", "version": 1})
        batch_update = page.request.post(f"{base}/roster/batch/update", data={
            "storeId": "browser-store", "items": [{"id": "qa-malformed-shift", "version": 1}],
            "patch": {"publicNote": "Must not save"}})
        if [auto_create.status, explicit_create.status, edit.status, batch_update.status] != [409, 409, 409, 409]:
            raise AssertionError(f"Malformed period Shift mutation statuses: {auto_create.status}, {explicit_create.status}, {edit.status}, {batch_update.status}")
        copy = page.request.post(f"{base}/roster/batch/copy", data={"storeId": "browser-store",
            "sourcePeriodId": "qa-malformed-period", "targetStartDate": "2026-11-09", "expectedSourcePeriodVersion": 1})
        day_input = {"storeId": "browser-store", "sourceDate": "2026-11-02", "targetDate": "2026-11-09"}
        day_preview_response = page.request.post(f"{base}/roster/batch/copy-day/preview", data=day_input)
        if day_preview_response.status != 200:
            raise AssertionError(f"Copy Day preview failed: {day_preview_response.status}")
        day_preview = day_preview_response.json()
        if day_preview["canCopy"] or not any(issue["code"] == "INVALID_TIME_RANGE" for issue in day_preview["issues"]):
            raise AssertionError(f"Malformed Copy Day source was offered: {day_preview}")
        day_commit = page.request.post(f"{base}/roster/batch/copy-day", data={**day_input,
            "expectedSourcePeriodVersion": day_preview["sourcePeriodVersion"],
            "expectedTargetPeriodVersion": day_preview["targetPeriodVersion"]})
        repeat_input = {"storeId": "browser-store", "sourceShiftId": "qa-malformed-shift", "targetDates": ["2026-11-09"]}
        repeat_preview_response = page.request.post(f"{base}/roster/batch/repeat/preview", data=repeat_input)
        if repeat_preview_response.status != 200:
            raise AssertionError(f"Repeat preview failed: {repeat_preview_response.status}")
        repeat_preview = repeat_preview_response.json()
        if repeat_preview["canCopy"] or not any(issue["code"] == "INVALID_TIME_RANGE" for issue in repeat_preview["issues"]):
            raise AssertionError(f"Malformed Repeat source was offered: {repeat_preview}")
        repeat_commit = page.request.post(f"{base}/roster/batch/repeat", data={**repeat_input,
            "expectedSourcePeriodVersion": repeat_preview["sourcePeriodVersion"],
            "expectedTargetPeriodVersions": repeat_preview["targetPeriodVersions"]})
        publish = page.request.post(f"{base}/roster/periods/qa-malformed-period/publish", data={
            "storeId": "browser-store", "version": 1})
        if [copy.status, day_commit.status, repeat_commit.status, publish.status] != [409, 409, 409, 409]:
            raise AssertionError(f"Malformed period mutation statuses: {copy.status}, {day_commit.status}, {repeat_commit.status}, {publish.status}")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        print(json.dumps({"verified": True, "previewBlocked": True, "copyCommit": copy.status,
                          "copyDayCommit": day_commit.status, "repeatCommit": repeat_commit.status,
                          "autoCreate": auto_create.status, "explicitCreate": explicit_create.status,
                          "edit": edit.status, "batchUpdate": batch_update.status,
                          "publish": publish.status, "reloaded": True}))
    finally:
        browser.close()
