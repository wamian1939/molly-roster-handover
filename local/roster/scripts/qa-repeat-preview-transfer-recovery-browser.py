"""Repeat Shift must discard a copyable preview after a transferred employee blocks commit."""

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
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        for date, start_at, end_at in [
            ("2026-10-09", "2026-10-08T21:00:00.000Z", "2026-10-09T03:00:00.000Z"),
            ("2026-10-10", "2026-10-09T21:00:00.000Z", "2026-10-10T03:00:00.000Z"),
        ]:
            response = page.context.request.put(f"{api}/roster/availability", data={
                "storeId": "browser-store", "employeeId": "browser-regular", "dates": [date], "expectedRows": [],
                "entries": [{"date": date, "status": "AVAILABLE", "startAt": start_at, "endAt": end_at}],
            })
            assert response.status in (200, 201), (date, response.status, response.text())
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-event').first.click()
        page.get_by_role("dialog").get_by_role("button", name=re.compile("Regular Bob")).click()
        page.get_by_role("dialog").get_by_role("button", name="其他班次操作").click()
        page.get_by_role("dialog").get_by_role("button", name="重复班次").click()
        repeat = page.get_by_role("dialog")
        repeat.get_by_label("重复至").fill("2026-10-10")
        repeat.get_by_label("周六").check()
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/repeat/preview")) as first_preview:
            repeat.get_by_role("button", name="检查冲突").click()
        assert first_preview.value.status == 200 and first_preview.value.json().get("canCopy"), first_preview.value.text()
        expect(repeat.get_by_role("button", name="生成草稿")).to_be_enabled()

        subprocess.run(["node", "scripts/seed-former-employee-browser.mjs"], cwd=workspace, check=True, capture_output=True, text=True)
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/repeat")) as commit:
            repeat.get_by_role("button", name="生成草稿").click()
        assert commit.value.status == 422 and commit.value.json().get("validation", {}).get("code") == "ARCHIVED_EMPLOYEE", commit.value.text()
        expect(repeat.get_by_role("button", name="生成草稿")).to_be_disabled(timeout=15000)
        expect(repeat.get_by_text("生成未完成，请重新检查冲突。")).to_be_visible()
        expect(repeat.get_by_label("重复至")).to_have_value("2026-10-10")
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/repeat/preview")) as fresh_preview:
            repeat.get_by_role("button", name="检查冲突").click()
        assert fresh_preview.value.status == 200 and not fresh_preview.value.json().get("canCopy"), fresh_preview.value.text()
        expect(repeat.get_by_role("button", name="生成草稿")).to_be_disabled()
        print(json.dumps({"verified": True, "commitStatus": commit.value.status, "previewInvalidated": True,
                          "dateRetained": True, "freshPreviewBlocked": True}))
    finally:
        browser.close()
