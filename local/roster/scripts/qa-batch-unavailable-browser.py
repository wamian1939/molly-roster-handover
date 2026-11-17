"""Check grouped Calendar batch role change rejects unavailable staff atomically."""

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
            raise AssertionError("Could not navigate to fixture week")
        event = page.locator(".fc-event").filter(has_text="QA Front").first
        expect(event).to_be_visible()
        page.get_by_role("button", name="批量", exact=True).click()
        event.click()
        expect(page.get_by_text("已选 2 个")).to_be_visible()
        page.get_by_role("combobox", name="统一改为岗位").click()
        page.get_by_role("option", name="QA Batch Target").click()
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/update")) as response_info:
            page.get_by_role("button", name="批量改岗").click()
        response = response_info.value
        result = response.json()
        if response.status != 422 or result.get("validation", {}).get("code") != "EMPLOYEE_UNAVAILABLE" or result["validation"].get("employeeId") != "browser-regular":
            raise AssertionError(f"Unexpected batch response: {response.status} {result}")
        expect(page.get_by_text("批量更新失败")).to_be_visible()
        expect(page.locator(".fc-event").filter(has_text="QA Front")).to_have_count(1)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        for _ in range(6):
            if page.locator('[data-date="2026-10-09"]').count():
                break
            page.get_by_role("button", name="上一页").click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(page.locator(".fc-event").filter(has_text="QA Front")).to_have_count(1)
        print(json.dumps({"verified": True, "status": response.status, "code": result["validation"]["code"],
                          "employeeId": result["validation"]["employeeId"], "originalGroupRetainedAfterReload": True}))
    finally:
        browser.close()
