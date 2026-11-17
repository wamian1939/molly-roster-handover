"""Set a store fortnight anchor and exercise Calendar create and copy in Chromium."""

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
api = "http://127.0.0.1:4035/api"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        page.goto("http://127.0.0.1:5177/settings", wait_until="domcontentloaded")
        cycle = page.get_by_role("combobox", name="默认周期")
        expect(cycle).to_be_visible()
        cycle.click()
        page.get_by_role("option", name="双周").click()
        anchor = page.get_by_label("双周起始日期")
        expect(anchor).to_be_visible()
        expect(page.get_by_role("button", name="保存规则")).to_be_disabled()
        anchor.fill("2026-10-26")
        with page.expect_response(lambda response: response.request.method == "PUT" and response.url.endswith("/roster/settings/browser-store")) as settings_response:
            page.get_by_role("button", name="保存规则").click()
        if settings_response.value.status not in (200, 201):
            raise AssertionError(f"Fortnight Settings save failed: {settings_response.value.status} {settings_response.value.text()}")
        saved = page.context.request.get(f"{api}/roster/settings?storeId=browser-store")
        if saved.json().get("settings", {}).get("fortnightAnchorDate") != "2026-10-26":
            raise AssertionError(f"Fortnight anchor did not persist: {saved.text()}")

        for date in ("2026-10-29", "2026-10-30", "2026-11-10", "2026-11-12", "2026-11-13"):
            day = date[-2:]
            month = date[5:7]
            year = date[:4]
            previous = f"{year}-{month}-{int(day)-1:02d}"
            availability = page.context.request.put(f"{api}/roster/availability", data={
                "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": [date], "expectedRows": [],
                "entries": [{"date": date, "status": "AVAILABLE", "startAt": f"{previous}T22:00:00.000Z",
                             "endAt": f"{date}T02:00:00.000Z"}],
            })
            if availability.status not in (200, 201):
                raise AssertionError(f"Could not seed disposable Availability for {date}: {availability.status} {availability.text()}")

        page.goto("http://127.0.0.1:5177/calendar", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-29"] .fc-daygrid-day-number').click()
        expect(page.locator(".fc-timegrid")).to_be_visible()
        lane = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]')
        lane.scroll_into_view_if_needed()
        lane.click(position={"x": 300, "y": 5})
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b")).click()
        dialog.locator("footer button").last.click()
        expect(dialog).to_have_count(0)
        expect(page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        page.get_by_role("button", name="复制一天").click()
        copy_day = page.get_by_role("dialog")
        copy_day.get_by_label("来源日期").fill("2026-10-29")
        copy_day.get_by_label("目标日期").fill("2026-10-30")
        copy_day.get_by_role("button", name="检查冲突").click()
        expect(copy_day.get_by_text("1/1")).to_be_visible()
        copy_day.get_by_role("button", name="复制为草稿").click()
        expect(copy_day).to_have_count(0)

        source = page.context.request.get(f"{api}/roster/periods?storeId=browser-store&from=2026-10-26&to=2026-11-08")
        source_periods = source.json()
        source_period = next((period for period in source_periods if period["startDate"] == "2026-10-26"), None)
        if not source_period or source_period["cycleType"] != "FORTNIGHT" or source_period["endDate"] != "2026-11-08":
            raise AssertionError(f"Calendar did not create a 14-day period: {source.text()}")
        preview = page.context.request.post(f"{api}/roster/batch/copy/preview", data={
            "storeId": "browser-store", "sourcePeriodId": source_period["id"], "targetStartDate": "2026-11-09",
        })
        body = preview.json()
        if preview.status != 200 or not body.get("canCopy") or body.get("shiftCount") != 2:
            raise AssertionError(f"Fortnight Copy Period preview failed: {preview.status} {body}")
        copied = page.context.request.post(f"{api}/roster/batch/copy", data={
            "storeId": "browser-store", "sourcePeriodId": source_period["id"], "targetStartDate": "2026-11-09",
            "expectedSourcePeriodVersion": body["sourcePeriodVersion"],
        })
        if copied.status != 201 or copied.json().get("endDate") != "2026-11-22":
            raise AssertionError(f"Fortnight Copy Period failed: {copied.status} {copied.text()}")
        calendar = page.context.request.get(f"{api}/roster/calendar?storeId=browser-store&from=2026-10-29&to=2026-10-30")
        source_shift = next((shift for shift in calendar.json().get("shifts", []) if shift["date"] == "2026-10-29"), None)
        if not source_shift:
            raise AssertionError(f"Cannot find source Shift for Repeat: {calendar.text()}")
        repeat_input = {"storeId": "browser-store", "sourceShiftId": source_shift["id"], "targetDates": ["2026-11-10"]}
        repeat_preview = page.context.request.post(f"{api}/roster/batch/repeat/preview", data=repeat_input)
        repeat_body = repeat_preview.json()
        if repeat_preview.status != 200 or not repeat_body.get("canCopy") or repeat_body.get("shiftCount") != 1:
            raise AssertionError(f"Fortnight Repeat preview failed: {repeat_preview.status} {repeat_body}")
        repeated = page.context.request.post(f"{api}/roster/batch/repeat", data={
            **repeat_input, "expectedSourcePeriodVersion": repeat_body["sourcePeriodVersion"],
            "expectedTargetPeriodVersions": repeat_body["targetPeriodVersions"],
        })
        if repeated.status != 201 or repeated.json().get("created") != 1:
            raise AssertionError(f"Fortnight Repeat failed: {repeated.status} {repeated.text()}")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        print(json.dumps({"verified": True, "anchor": "2026-10-26", "calendarCreate": "2026-10-26/2026-11-08",
                          "copyDay": True, "copyPeriod": "2026-11-09/2026-11-22", "repeat": "2026-11-10", "reloaded": True}))
    finally:
        browser.close()
