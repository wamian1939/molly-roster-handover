"""Publishing a draft with a transferred employee must fail without changing history."""

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
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.get_by_text("Regular Bob 已不在当前在职名单")).to_be_visible()
        with page.expect_response(lambda response: response.request.method == "POST"
                                  and response.url.endswith("/roster/periods/qa-draft-period/publish")) as publish:
            page.get_by_role("button", name="发布本周期").click()
        response = publish.value
        assert response.status == 422 and response.json().get("validation", {}).get("code") == "ARCHIVED_EMPLOYEE", response.text()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.get_by_role("button", name="发布本周期")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.get_by_role("button", name="发布本周期")).to_be_visible()
        print(json.dumps({"verified": True, "publishStatus": response.status,
                          "reason": "ARCHIVED_EMPLOYEE", "draftRetained": True, "reloaded": True}))
    finally:
        browser.close()
