"""Exercise Month blank create and date navigation in disposable local Chromium."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster QA schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate QA schema")
credential = evaluate["credentials"]["browser-admin"]

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code in (201, 409), job.text

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
availability_rows = api.get("http://127.0.0.1:4035/api/roster/availability", params={
    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "from": "2026-10-10", "to": "2026-10-10",
}).json()
if not availability_rows:
    availability = api.put("http://127.0.0.1:4035/api/roster/availability", json={
        "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
        "expectedRows": [], "entries": [{"date": "2026-10-10", "status": "AVAILABLE",
                                      "startAt": "2026-10-09T22:00:00.000Z", "endAt": "2026-10-10T07:00:00.000Z"}],
    })
    assert availability.status_code in (200, 201), availability.text

target_query = {"storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10"}
published_query = {"storeId": "browser-store", "from": "2026-10-16", "to": "2026-10-16"}
target_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=target_query).json()
published_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query).json()
assert target_before["shifts"] == [], "This QA script needs an unused target date in its disposable schema"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="下一页").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(page.get_by_text("点击日期空白处创建第一个班次")).to_be_visible()
        page.get_by_role("button", name="上一页").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        cell = page.locator('.fc-daygrid-day[data-date="2026-10-10"]')
        expect(cell).to_be_visible()
        cell.locator(".fc-daygrid-day-frame").click(position={"x": 20, "y": 30})
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("textbox", name="开始时间")).to_have_value("09:00")
        expect(dialog.get_by_role("textbox", name="结束时间")).to_have_value("10:00")
        expect(dialog.get_by_text("10月10日星期六")).to_be_visible()
        expect(dialog.get_by_role("radio", name="QA Front")).not_to_be_checked()
        dialog.get_by_role("radio", name="QA Front").locator("..").click()
        dialog.get_by_role("button", name="HandoverEmployee006", exact=False).click()
        dialog.get_by_role("textbox", name="公开备注").fill("Month blank create QA")
        dialog.get_by_role("button", name=re.compile("^保存班次")).click()
        expect(dialog).to_have_count(0)
        expect(cell.locator(".fc-event")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        cell = page.locator('.fc-daygrid-day[data-date="2026-10-10"]')
        expect(cell.locator(".fc-event")).to_be_visible()
        cell.locator(".fc-event").click()
        expect(page.get_by_role("dialog")).to_be_visible()
        page.get_by_role("dialog").get_by_role("button", name="取消").click()
        if page.get_by_role("alertdialog").count():
            page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        cell.locator(".fc-daygrid-day-number").click()
        expect(page.locator(".fc-timegrid")).to_be_visible()
        expect(page.get_by_text("2026年10月10日", exact=False)).to_be_visible()
        assert page.locator(".calendar-toolbar").get_by_role("button", name="复制一天").count() == 0
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        draft_week_column = page.locator('.fc-timegrid-col[data-date="2026-10-10"]')
        expect(draft_week_column).to_be_visible()
        draft_week_slot = page.locator('.fc-timegrid-slot-lane[data-time="11:00:00"]')
        draft_week_slot.scroll_into_view_if_needed()
        draft_week_slot_box = draft_week_slot.bounding_box()
        draft_week_column_box = draft_week_column.bounding_box()
        assert draft_week_slot_box is not None and draft_week_column_box is not None
        page.mouse.click(draft_week_column_box["x"] + draft_week_column_box["width"] * 0.6,
                         draft_week_slot_box["y"] + draft_week_slot_box["height"] * 0.5)
        week_dialog = page.get_by_role("dialog")
        expect(week_dialog).to_be_visible()
        expect(week_dialog.get_by_role("textbox", name="开始时间")).to_have_value("11:00")
        expect(week_dialog.get_by_role("radio", name="QA Front")).not_to_be_checked()
        week_dialog.get_by_role("button", name="取消").click()
        expect(week_dialog).to_have_count(0)
        page.get_by_role("button", name="月视图").click()
        published = page.locator('.fc-daygrid-day[data-date="2026-10-16"]')
        published_frame = published.locator(".fc-daygrid-day-frame")
        published_box = published_frame.bounding_box()
        assert published_box is not None
        published_frame.click(position={"x": 20, "y": published_box["height"] - 5})
        expect(page.get_by_role("dialog")).to_have_count(0)
        published.locator(".fc-daygrid-day-number").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        day_column = page.locator('.fc-timegrid-col[data-date="2026-10-16"]')
        expect(day_column).to_be_visible()
        empty_slot = page.locator('.fc-timegrid-slot-lane[data-time="15:00:00"]')
        empty_slot.scroll_into_view_if_needed()
        slot_box = empty_slot.bounding_box()
        day_box = day_column.bounding_box()
        assert slot_box is not None and day_box is not None
        page.mouse.click(day_box["x"] + day_box["width"] * 0.6, slot_box["y"] + slot_box["height"] * 0.5)
        expect(page.get_by_role("dialog")).to_have_count(0)
        next_slot = page.locator('.fc-timegrid-slot-lane[data-time="16:00:00"]').bounding_box()
        assert next_slot is not None
        page.mouse.move(day_box["x"] + day_box["width"] * 0.6, slot_box["y"] + slot_box["height"] * 0.5)
        page.mouse.down()
        page.mouse.move(day_box["x"] + day_box["width"] * 0.6, next_slot["y"] + next_slot["height"] * 0.5, steps=5)
        page.mouse.up()
        expect(page.get_by_role("dialog")).to_have_count(0)
        page.get_by_role("button", name="排班操作").click()
        page.get_by_role("button", name="新增班次").click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        week_column = page.locator('.fc-timegrid-col[data-date="2026-10-16"]')
        expect(week_column).to_be_visible()
        week_slot = page.locator('.fc-timegrid-slot-lane[data-time="15:00:00"]')
        week_slot.scroll_into_view_if_needed()
        week_slot_box = week_slot.bounding_box()
        week_box = week_column.bounding_box()
        assert week_slot_box is not None and week_box is not None
        page.mouse.click(week_box["x"] + week_box["width"] * 0.6, week_slot_box["y"] + week_slot_box["height"] * 0.5)
        expect(page.get_by_role("dialog")).to_have_count(0)
        target_after = api.get("http://127.0.0.1:4035/api/roster/calendar", params=target_query).json()
        published_after = api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query).json()
        assert len(target_after["shifts"]) == 1, target_after["shifts"]
        created = target_after["shifts"][0]
        assert (created["startAt"], created["endAt"]) == (
            "2026-10-09T22:00:00.000Z", "2026-10-09T23:00:00.000Z")
        assert [row["employeeId"] for row in created["assignments"]] == ["browser-HandoverEmployee006"]
        assert published_after == published_before, "Published calendar data changed during draft creation"
        print(json.dumps({"verified": True, "date": "2026-10-10", "monthBlankCreate": True,
                          "emptyMonthHint": True,
                          "savedAndReloaded": True, "databaseUtcAndEmployeeVerified": True,
                          "oneTargetShift": True, "publishedDataUnchanged": True,
                          "eventEdit": True, "dateNumberNavigates": True,
                          "monthAndWeekJobsInitiallyUnchecked": True,
                          "weekClickPrefillsTimeWithoutSaving": True,
                          "dayTopCopyAbsent": True,
                          "publishedCreateBlocked": True, "publishedDayClickDragAndToolbarBlocked": True,
                          "publishedWeekClickBlocked": True}))
    finally:
        browser.close()
