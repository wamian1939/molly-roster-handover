"""A Copy Day preview must match the dates currently visible in the dialog."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
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
        page.get_by_role("button", name="复制一天").click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("来源日期").fill("2026-10-09")
        dialog.get_by_label("目标日期").fill("2026-10-10")
        pending = []

        def hold_preview(route):
            response = route.fetch()
            pending.append((route, response))

        page.route("**/roster/batch/copy-day/preview", hold_preview)
        dialog.get_by_role("button", name="检查冲突").click()
        for _ in range(100):
            if pending:
                break
            page.wait_for_timeout(50)
        assert len(pending) == 1 and pending[0][1].status == 200, "Copy Day preview was not returned"
        dialog.get_by_label("目标日期").fill("2026-10-11")
        expect(dialog.get_by_label("目标日期")).to_have_value("2026-10-11")
        pending[0][0].fulfill(response=pending[0][1])
        expect(dialog.get_by_role("button", name="检查冲突")).to_be_enabled(timeout=15000)
        expect(dialog.get_by_text("可复制班次")).to_have_count(0)
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()
        page.unroute("**/roster/batch/copy-day/preview", hold_preview)
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day/preview")) as fresh_response:
            dialog.get_by_role("button", name="检查冲突").click()
        fresh = fresh_response.value.json()
        assert fresh_response.value.status == 200 and fresh["sourceDate"] == "2026-10-09" and fresh["targetDate"] == "2026-10-11", fresh
        expect(dialog.get_by_text("可复制班次")).to_be_visible()
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        print(json.dumps({"verified": True, "oldPreviewDiscarded": True, "freshTargetDate": fresh["targetDate"], "copied": False}))
    finally:
        browser.close()
