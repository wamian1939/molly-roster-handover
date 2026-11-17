"""Check that an inactive Shift Role blocks Copy Day in an isolated browser fixture."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster QA schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate QA schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="复制一天").click()
        dialog = page.locator('[role="dialog"]').last
        expect(dialog).to_be_visible()
        dates = dialog.locator('input[type="date"]')
        expect(dates).to_have_count(2)
        dates.nth(0).fill("2026-10-09")
        dates.nth(1).fill("2026-10-10")
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day/preview")) as response_info:
            dialog.get_by_role("button", name="检查冲突").click()
        response = response_info.value
        if response.status != 200:
            raise AssertionError(f"Copy Day preview returned {response.status}")
        preview = response.json()
        if not any(issue.get("code") == "INACTIVE_SHIFT_ROLE" for issue in preview.get("issues", [])):
            raise AssertionError(f"Missing inactive-role issue: {preview}")
        expect(dialog.get_by_role("alert")).to_contain_text("岗位")
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()
        execute = page.context.request.post("http://127.0.0.1:4035/api/roster/batch/copy-day", data={
            "storeId": "browser-store", "sourceDate": "2026-10-09", "targetDate": "2026-10-10",
            "expectedSourcePeriodVersion": preview["sourcePeriodVersion"],
            "expectedTargetPeriodVersion": preview["targetPeriodVersion"],
        })
        if execute.status != 422 or execute.json().get("validation", {}).get("code") != "INACTIVE_SHIFT_ROLE":
            raise AssertionError(f"Unexpected execute response: {execute.status} {execute.text()}")
        print(json.dumps({"verified": True, "previewStatus": response.status, "inactiveRoleIssue": True,
                          "copyDisabled": True, "executeStatus": execute.status, "shiftCount": preview["shiftCount"]}))
    finally:
        browser.close()
