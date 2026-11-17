"""Exercise publish refusal and recovery in a disposable Calendar session."""

import json
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

mode = sys.argv[1] if len(sys.argv) == 2 else ""
if mode not in {"reject", "publish"}:
    raise RuntimeError("Expected reject or publish")
temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate schema")
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
        expect(page.get_by_text("草稿 · 可编辑").first).to_be_visible()
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/periods/qa-draft-period/publish")) as response_info:
            page.get_by_role("button", name="发布本周期").click()
        response = response_info.value
        result = response.json()
        if mode == "reject":
            if response.status != 400 or result.get("validation", {}).get("code") != "MIN_SHIFT_DURATION":
                raise AssertionError(f"Unexpected publish rejection: {response.status} {result}")
            expect(page.get_by_text("状态未改变")).to_be_visible()
        else:
            if response.status != 200:
                raise AssertionError(f"Unexpected publish result: {response.status} {result}")
            expect(page.get_by_text("已发布 · 已锁定").first).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        for _ in range(6):
            if page.locator('[data-date="2026-10-09"]').count():
                break
            page.get_by_role("button", name="上一页").click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(page.get_by_text("草稿 · 可编辑" if mode == "reject" else "已发布 · 已锁定").first).to_be_visible()
        print(json.dumps({"verified": True, "mode": mode, "httpStatus": response.status,
                          "validationCode": result.get("validation", {}).get("code"), "survivedReload": True}))
    finally:
        browser.close()
