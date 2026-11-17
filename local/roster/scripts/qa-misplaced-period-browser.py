"""Verify malformed source Shift cannot be published or copied in Calendar."""

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
        for _ in range(6):
            if page.locator('[data-date="2026-10-09"]').count():
                break
            page.get_by_role("button", name="上一页").click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        else:
            raise AssertionError("Fixture week not visible")
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy/preview")) as preview_info:
            page.get_by_role("button", name="复制到下一周期").click()
        preview_response = preview_info.value
        preview = preview_response.json()
        if preview_response.status != 200 or preview.get("canCopy") or not any(
            issue.get("code") == "SHIFT_PERIOD_MISMATCH" and issue.get("shiftId") == "qa-misplaced-shift"
            for issue in preview.get("issues", [])
        ):
            raise AssertionError(f"Unexpected Copy Week preview: {preview_response.status} {preview}")
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()
        expect(dialog.get_by_role("alert")).to_contain_text("所属排班周期不一致")
        execute = page.context.request.post("http://127.0.0.1:4035/api/roster/batch/copy", data={
            "storeId": "browser-store", "sourcePeriodId": "qa-draft-period", "targetStartDate": "2026-10-19",
            "expectedSourcePeriodVersion": preview["sourcePeriodVersion"],
        })
        if execute.status != 409 or execute.json().get("validation", {}).get("code") != "SHIFT_PERIOD_MISMATCH":
            raise AssertionError(f"Unexpected Copy Week execution: {execute.status} {execute.text()}")
        dialog.get_by_role("button", name="取消").click()
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/periods/qa-draft-period/publish")) as publish_info:
            page.get_by_role("button", name="发布本周期").click()
        publish = publish_info.value
        if publish.status != 409 or publish.json().get("validation", {}).get("code") != "SHIFT_PERIOD_MISMATCH":
            raise AssertionError(f"Unexpected Publish response: {publish.status} {publish.text()}")
        expect(page.get_by_text("状态未改变")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        for _ in range(6):
            if page.locator('[data-date="2026-10-09"]').count():
                break
            page.get_by_role("button", name="上一页").click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(page.get_by_text("草稿 · 可编辑").first).to_be_visible()
        print(json.dumps({"verified": True, "previewIssue": "SHIFT_PERIOD_MISMATCH", "copyHttp": execute.status,
                          "publishHttp": publish.status, "draftRetainedAfterReload": True}))
    finally:
        browser.close()
