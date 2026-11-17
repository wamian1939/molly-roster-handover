"""Reject a store minimum duration longer than its operating window."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

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
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("link", name="设置").click()
        minimum = page.get_by_label("最短班次（分钟）")
        expect(minimum).to_have_value("65")
        minimum.fill("900")
        with page.expect_response(lambda response: response.request.method == "PUT"
                                  and "/roster/settings/browser-store" in response.url) as pending:
            page.get_by_role("button", name="保存规则").click()
        response = pending.value
        if response.status != 400:
            raise AssertionError(f"Unusable store rule saved with HTTP {response.status}")
        expect(page.get_by_role("alert").filter(has_text="最短班次不能长于门店营业时段").last).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_label("最短班次（分钟）")).to_have_value("65")
        print(json.dumps({"verified": True, "httpStatus": response.status, "reloadedMinimumMinutes": 65}))
    finally:
        browser.close()
