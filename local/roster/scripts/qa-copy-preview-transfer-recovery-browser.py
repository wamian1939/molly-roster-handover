"""Invalidate Copy Day and Copy Week previews after a workforce change rejects commit."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

workspace = Path(__file__).resolve().parent.parent
temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
api = "http://127.0.0.1:4035/api"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        context = browser.new_context(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        day = context.new_page()
        day.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        day.locator('input[autocomplete="username"]').fill(credential["username"])
        day.locator('input[autocomplete="current-password"]').fill(credential["password"])
        day.locator('button[type="submit"]').click()
        expect(day.locator(".calendar-surface")).to_be_visible(timeout=15000)

        for employee_id, target_date, start_at, end_at in [
            ("browser-regular", "2026-10-09", "2026-10-08T21:00:00.000Z", "2026-10-09T03:00:00.000Z"),
            ("browser-training", "2026-10-09", "2026-10-08T21:00:00.000Z", "2026-10-09T03:00:00.000Z"),
            ("browser-regular", "2026-10-10", "2026-10-09T21:00:00.000Z", "2026-10-10T03:00:00.000Z"),
            ("browser-training", "2026-10-10", "2026-10-09T21:00:00.000Z", "2026-10-10T03:00:00.000Z"),
            ("browser-regular", "2026-10-23", "2026-10-22T21:00:00.000Z", "2026-10-23T03:00:00.000Z"),
        ]:
            response = context.request.put(f"{api}/roster/availability", data={
                "storeId": "browser-store", "employeeId": employee_id, "dates": [target_date], "expectedRows": [],
                "entries": [{"date": target_date, "status": "AVAILABLE", "startAt": start_at, "endAt": end_at}],
            })
            assert response.status in (200, 201), (employee_id, response.status, response.text())

        day.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(day.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        day.get_by_role("button", name="复制一天").click()
        day_dialog = day.get_by_role("dialog")
        day_dialog.get_by_label("来源日期").fill("2026-10-09")
        day_dialog.get_by_label("目标日期").fill("2026-10-10")
        with day.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day/preview")) as day_preview:
            day_dialog.get_by_role("button", name="检查冲突").click()
        assert day_preview.value.status == 200 and day_preview.value.json().get("canCopy"), day_preview.value.text()
        expect(day_dialog.get_by_role("button", name="复制为草稿")).to_be_enabled()

        week = context.new_page()
        week.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-16", wait_until="domcontentloaded")
        expect(week.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        with week.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy/preview")) as week_preview:
            week.get_by_role("button", name="复制到下一周期").click()
        assert week_preview.value.status == 200 and week_preview.value.json().get("canCopy"), week_preview.value.text()
        week_dialog = week.get_by_role("dialog")
        expect(week_dialog.locator("button.calendar-primary-button")).to_be_enabled()

        subprocess.run(["node", "scripts/seed-former-employee-browser.mjs"], cwd=workspace, check=True, capture_output=True, text=True)
        with day.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day")) as day_commit:
            day_dialog.get_by_role("button", name="复制为草稿").click()
        assert day_commit.value.status == 422 and day_commit.value.json().get("validation", {}).get("code") == "ARCHIVED_EMPLOYEE", day_commit.value.text()
        expect(day_dialog.get_by_role("button", name="复制为草稿")).to_be_disabled(timeout=15000)
        expect(day_dialog.get_by_text("可复制班次")).to_have_count(0)
        with day.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day/preview")) as fresh_day:
            day_dialog.get_by_role("button", name="检查冲突").click()
        assert fresh_day.value.status == 200 and not fresh_day.value.json().get("canCopy"), fresh_day.value.text()
        expect(day_dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()
        day_dialog.get_by_role("button", name="取消").click()

        with week.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy")) as week_commit:
            week_dialog.locator("button.calendar-primary-button").click()
        assert week_commit.value.status == 422 and week_commit.value.json().get("validation", {}).get("code") == "ARCHIVED_EMPLOYEE", week_commit.value.text()
        expect(week_dialog).to_have_count(0)
        with week.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy/preview")) as fresh_week:
            week.get_by_role("button", name="复制到下一周期").click()
        assert fresh_week.value.status == 200 and not fresh_week.value.json().get("canCopy"), fresh_week.value.text()
        expect(week.get_by_role("dialog").locator("button.calendar-primary-button")).to_be_disabled()
        print(json.dumps({"verified": True, "dayCommit": day_commit.value.status, "weekCommit": week_commit.value.status,
                          "dayPreviewInvalidated": True, "weekPreviewInvalidated": True,
                          "freshDayBlocked": True, "freshWeekBlocked": True}))
    finally:
        browser.close()
