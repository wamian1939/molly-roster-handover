"""Copy Shift checks target publication state and fails closed on a target-calendar outage."""

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
        page.get_by_role("button", name="上一页").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator(".fc-event").filter(has_text="Regular Bob").first.click()
        dialog = page.get_by_role("dialog")
        if dialog.get_by_role("button", name=re.compile("Regular Bob.*班次记录")).count():
            dialog.get_by_role("button", name=re.compile("Regular Bob.*班次记录")).click()
        expect(dialog.get_by_role("heading", name="编辑班次")).to_be_visible()
        dialog.get_by_role("button", name="其他班次操作").click()
        dialog.get_by_role("button", name="复制班次").click()
        expect(dialog.get_by_role("heading", name="复制班次")).to_be_visible()
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.method in ("POST", "PATCH", "DELETE") and "/roster/shifts" in request.url else None)
        dialog.get_by_label("复制到日期").fill("2026-10-16")
        expect(dialog.get_by_role("alert")).to_contain_text("目标日期的排班已发布", timeout=15000)
        expect(dialog.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_disabled()
        assert not writes, writes

        def fail_target(route):
            route.fulfill(status=503, content_type="application/json", body='{"error":"QA target calendar outage"}')

        page.route("**/api/roster/calendar?*from=2026-10-23*", fail_target)
        dialog.get_by_label("复制到日期").fill("2026-10-23")
        expect(dialog.get_by_role("alert")).to_contain_text("目标日期的班次无法确认", timeout=15000)
        expect(dialog.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_disabled()
        page.unroute("**/api/roster/calendar?*from=2026-10-23*", fail_target)
        dialog.get_by_role("button", name="重试员工与可用时间").click()
        expect(dialog.get_by_role("alert")).to_have_count(0, timeout=15000)
        assert not writes, writes
        dialog.get_by_role("button", name="取消").click()
        print(json.dumps({"verified": True, "publishedTargetBlocked": True, "outageBlocked": True, "writes": len(writes)}))
    finally:
        browser.close()
