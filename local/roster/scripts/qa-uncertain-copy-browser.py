"""Exercise committed Copy Day and Copy Period with unreadable success bodies in disposable schemas."""

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
        commits = {"day": [], "period": []}

        def corrupt_after_commit(kind):
            def handler(route):
                response = route.fetch()
                commits[kind].append(response.status)
                if response.status != 201:
                    route.fulfill(response=response)
                    return
                route.fulfill(status=201, content_type="application/json", body="{broken")
            return handler

        page.route("**/api/roster/batch/copy-day", corrupt_after_commit("day"))
        page.route("**/api/roster/batch/copy", corrupt_after_commit("period"))
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        if "--week-only" not in sys.argv:
            page.get_by_role("button", name="复制一天").click()
            dialog = page.get_by_role("dialog")
            dialog.get_by_label("来源日期").fill("2026-10-09")
            dialog.get_by_label("目标日期").fill("2026-10-10")
            dialog.get_by_role("button", name="检查冲突").click()
            expect(dialog.get_by_text("2/2")).to_be_visible(timeout=15000)
            dialog.get_by_role("button", name="复制为草稿").click()
            expect(dialog).to_have_count(0, timeout=15000)
            expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=15000)
            expect(page.locator('.fc-col-header-cell[data-date="2026-10-10"]')).to_be_visible(timeout=15000)
            expect(page.locator(".fc-event").filter(has_text="Regular Bob").first).to_be_visible(timeout=15000)
            assert commits["day"] == [201], commits

        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-daygrid-day[data-date="2026-10-16"] .fc-daygrid-day-number').click()
        expect(page.get_by_role("button", name="日视图")).to_be_visible(timeout=15000)
        expect(page.locator("aside").filter(has_text="已发布")).to_be_visible(timeout=15000)
        expect(page.get_by_role("button", name="复制到下一周期")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="复制到下一周期").click()
        week_dialog = page.get_by_role("dialog")
        expect(week_dialog.get_by_text("所有班次均可复制")).to_be_visible(timeout=15000)
        week_dialog.get_by_role("button", name="复制为草稿").click()
        expect(week_dialog).to_have_count(0, timeout=15000)
        expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=15000)
        assert commits["period"] == [201], commits
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        print(json.dumps({"verified": True, "copyDayCommitted": "--week-only" not in sys.argv, "copyPeriodCommitted": True,
                          "malformedSuccessBody": True, "oldPreviewsClosed": True, "requests": commits,
                          "reloadSucceeded": True}))
    finally:
        browser.close()
