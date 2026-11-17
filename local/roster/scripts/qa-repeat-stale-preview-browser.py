"""Changing Repeat dates must discard an in-flight conflict preview."""

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
        writes = []
        page.on("request", lambda request: writes.append(request.url) if request.method == "POST" and request.url.endswith("/roster/batch/repeat") else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-event').first.click()
        page.get_by_role("dialog").get_by_role("button", name=re.compile("Regular Bob")).click()
        page.get_by_role("dialog").get_by_role("button", name="其他班次操作").click()
        page.get_by_role("dialog").get_by_role("button", name="重复班次").click()
        repeat = page.get_by_role("dialog")
        repeat.get_by_label("重复至").fill("2026-10-10")
        repeat.get_by_label("周六").check()
        pending = []

        def hold_preview(route):
            response = route.fetch()
            pending.append((route, response))

        page.route("**/roster/batch/repeat/preview", hold_preview)
        repeat.get_by_role("button", name="检查冲突").click()
        for _ in range(100):
            if pending:
                break
            page.wait_for_timeout(50)
        assert len(pending) == 1 and pending[0][1].status == 200, "Repeat preview did not return"
        repeat.get_by_label("重复至").fill("2026-10-17")
        expect(repeat.get_by_label("重复至")).to_have_value("2026-10-17")
        pending[0][0].fulfill(response=pending[0][1])
        expect(repeat.get_by_role("button", name="检查冲突")).to_be_enabled(timeout=15000)
        expect(repeat.get_by_text(re.compile("可创建 .* 个班次"))).to_have_count(0)
        expect(repeat.get_by_role("button", name="生成草稿")).to_be_disabled()
        page.unroute("**/roster/batch/repeat/preview", hold_preview)
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/repeat/preview")) as fresh_response:
            repeat.get_by_role("button", name="检查冲突").click()
        fresh = fresh_response.value.json()
        assert fresh_response.value.status == 200 and fresh["targetDates"] == ["2026-10-10", "2026-10-16", "2026-10-17"], fresh
        expect(repeat.get_by_text(re.compile("可创建 .* 个班次"))).to_be_visible()
        repeat.get_by_role("button", name="取消").click()
        expect(repeat).to_have_count(0)
        assert not writes, writes
        print(json.dumps({"verified": True, "oldPreviewDiscarded": True, "freshTargetDates": fresh["targetDates"], "repeatWrites": len(writes)}))
    finally:
        browser.close()
