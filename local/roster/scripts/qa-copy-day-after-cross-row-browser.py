"""Verify Copy Day uses the saved cross-row employee, with a browser reload."""

import json
import re
import sys
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
        if "--week-preview-only" in sys.argv:
            with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy/preview")) as week_response:
                page.locator(".calendar-toolbar button").filter(has_text="复制上一周").click()
            week_preview = week_response.value.json()
            if week_response.value.status != 200 or week_preview.get("canCopy"):
                raise AssertionError(f"Expected published target to block Copy Week: {week_preview}")
            week_dialog = page.get_by_role("dialog")
            expect(week_dialog.locator(".calendar-primary-button")).to_be_disabled()
            print(json.dumps({"verified": True, "weekPreviewBlocked": True, "issues": [issue.get("code") for issue in week_preview.get("issues", [])]}))
            sys.exit(0)
        if "--verify-only" not in sys.argv:
            page.get_by_role("button", name="复制一天").click()
            dialog = page.get_by_role("dialog")
            dialog.get_by_label("来源日期").fill("2026-10-09")
            dialog.get_by_label("目标日期").fill("2026-10-10")
            with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day/preview")) as preview_response:
                dialog.get_by_role("button", name="检查冲突").click()
            preview = preview_response.value.json()
            if preview_response.value.status != 200 or not preview.get("canCopy") or preview.get("shiftCount") != 2:
                raise AssertionError(f"Unexpected Copy Day preview: {preview_response.value.status} {preview}")
            expect(dialog.get_by_text("2/2")).to_be_visible()
            with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day")) as copy_response:
                dialog.get_by_role("button", name="复制为草稿").click()
            if copy_response.value.status != 201:
                raise AssertionError(f"Copy Day failed: {copy_response.value.status} {copy_response.value.text()}")
            expect(dialog).to_have_count(0)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".fc-daygrid-day[data-date='2026-10-10'] .fc-event").filter(has_text="HandoverEmployee006")).to_be_visible()
        print(json.dumps({"verified": True, "mode": "reload-only" if "--verify-only" in sys.argv else "copy-and-reload", "retainedAfterReload": True}))
    finally:
        browser.close()
