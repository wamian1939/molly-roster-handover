"""Exercise uncertain Repeat Shift and batch-delete responses in disposable databases."""

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
assert job.status_code in (201, 409), job.status_code
jobs = evaluate_api.get("http://127.0.0.1:4010/api/store-jobs", params={"storeId": "browser-store"})
jobs.raise_for_status()
formal_job_id = next(item["id"] for item in jobs.json() if item["code"] == "qa-front")
assignment = evaluate_api.put("http://127.0.0.1:4010/api/employees/browser-regular", json={
    "jobIds": [formal_job_id],
})
assignment.raise_for_status()

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
base = "http://127.0.0.1:4035/api"
settings = api.get(base + "/roster/settings", params={"storeId": "browser-store"})
settings.raise_for_status()
if settings.json()["settings"] is None:
    saved = api.put(base + "/roster/settings/browser-store", json={
        "storeId": "browser-store", "timezone": "Australia/Sydney",
        "openingTime": "00:00", "closingTime": "23:59", "slotIntervalMinutes": 30,
        "minimumShiftMinutes": 60, "defaultBreakMinutes": 0, "weekStartsOn": 1,
        "cycleType": "WEEK", "weeklyHourWarning": 38, "dailyHourWarning": 10,
    })
    saved.raise_for_status()
availability = api.get(base + "/roster/availability", params={
    "storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-10",
})
availability.raise_for_status()
existing_availability = [row for row in availability.json() if row["employeeId"] == "browser-regular"]
saved_availability = api.put(base + "/roster/availability", json={
    "storeId": "browser-store", "employeeId": "browser-regular",
    "dates": ["2026-10-09", "2026-10-10"],
    "expectedRows": [{"id": row["id"], "version": row["version"]} for row in existing_availability],
    "entries": [
        {"date": "2026-10-09", "status": "AVAILABLE",
         "startAt": "2026-10-08T22:00:00.000Z", "endAt": "2026-10-09T02:00:00.000Z"},
        {"date": "2026-10-10", "status": "AVAILABLE",
         "startAt": "2026-10-09T22:00:00.000Z", "endAt": "2026-10-10T02:00:00.000Z"},
    ],
})
assert saved_availability.ok, saved_availability.text


def calendar_shifts():
    response = api.get(base + "/roster/calendar", params={
        "storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-10",
    })
    response.raise_for_status()
    return [(shift["id"], shift["version"]) for shift in response.json()["shifts"]]


before = calendar_shifts()
assert len(before) == 2, before

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        errors = []
        preview_calls = []
        repeat_posts = []
        delete_posts = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def preview_response(route):
            preview_calls.append(1)
            if len(preview_calls) == 1:
                route.fulfill(status=200, content_type="application/json", body="{}")
            else:
                route.continue_()

        def repeat_response(route):
            repeat_posts.append(json.loads(route.request.post_data))
            route.fulfill(status=201, content_type="application/json", body='{"created":0}')

        def delete_response(route):
            delete_posts.append(json.loads(route.request.post_data))
            route.fulfill(status=200, content_type="application/json", body='{"deleted":0}')

        page.route("**/api/roster/batch/repeat/preview", preview_response)
        page.route("**/api/roster/batch/repeat", repeat_response)
        page.route("**/api/roster/batch/delete", delete_response)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-event').first.click()
        page.get_by_role("dialog").get_by_role("button", name=re.compile("Regular Bob")).click()
        shift_dialog = page.get_by_role("dialog")
        shift_dialog.get_by_role("button", name="其他班次操作").click()
        shift_dialog.get_by_role("button", name="重复班次").click()
        if shift_dialog.get_by_role("button", name="放弃修改并重复").count():
            shift_dialog.get_by_role("button", name="放弃修改并重复").click()
        chooser = page.get_by_role("dialog")
        expect(chooser).to_contain_text("选择要重复的班次")
        chooser.get_by_role("button", name=re.compile("Regular Bob")).click()
        repeat = page.get_by_role("dialog")
        repeat.get_by_label("重复至").fill("2026-10-10")
        repeat.get_by_label("周六").check()
        repeat.get_by_role("button", name="检查冲突").click()
        expect(repeat.get_by_role("alert")).to_contain_text("预览响应不完整", timeout=15000)
        expect(repeat.get_by_role("button", name="生成草稿")).to_be_disabled()
        repeat.get_by_role("button", name="检查冲突").click()
        expect(repeat.get_by_text("全部目标日期可用")).to_be_visible(timeout=15000)
        repeat.get_by_role("button", name="生成草稿").click()
        expect(repeat).to_have_count(0, timeout=15000)
        expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=15000)
        expect(page.get_by_text("重复班次已生成", exact=True)).to_have_count(0)
        assert len(repeat_posts) == 1 and repeat_posts[0]["targetDates"] == ["2026-10-10"]
        assert calendar_shifts() == before

        page.get_by_role("button", name="排班操作").click()
        page.get_by_role("button", name="批量操作").click()
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-event').first.click()
        expect(page.get_by_text("已选 2 个")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="批量删除").click()
        page.get_by_role("button", name="确认删除 2 个").click()
        expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=15000)
        expect(page.get_by_text("已删除 0 个班次", exact=True)).to_have_count(0)
        assert len(delete_posts) == 1 and len(delete_posts[0]["items"]) == 2
        assert calendar_shifts() == before
        assert errors == [], errors
        print(json.dumps({"verified": True, "malformedPreviewRejected": True,
                          "repeatCountMismatchRejected": True, "deleteCountMismatchRejected": True,
                          "calendarUnchanged": True, "pageErrors": len(errors)}))
    finally:
        browser.close()
