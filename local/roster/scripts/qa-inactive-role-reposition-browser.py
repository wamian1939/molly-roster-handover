"""An inactive Shift Role must block a real Week row drag without changing the Shift."""

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
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.method not in ("GET", "OPTIONS") and "/roster/shifts/" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="员工行").click()
        board = page.locator('section[aria-label="员工行排班"]')
        expect(board).to_be_visible()
        for _ in range(6):
            if "2026-10-09" in board.inner_text():
                break
            page.get_by_role("button", name="上一页").click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        else:
            raise AssertionError("Could not navigate to fixture week")
        source = board.locator('[role="button"][aria-label*="Regular Bob 2026-10-09 Inactive copy QA"]')
        target = board.locator('[data-drop-target="browser-regular:2026-10-10"]')
        source.scroll_into_view_if_needed()
        source_box = source.bounding_box()
        target_box = target.bounding_box()
        if not source_box or not target_box:
            raise AssertionError("Missing source or target geometry")
        page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + target_box["height"] / 2, steps=12)
        with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/roster/shifts/qa-draft-shift/reposition")) as response_info:
            page.mouse.up()
        response = response_info.value
        if response.status != 422 or response.json().get("validation", {}).get("code") != "INACTIVE_SHIFT_ROLE":
            raise AssertionError(f"Unexpected move response: {response.status} {response.text()}")
        expect(source).to_have_count(1)
        expect(target.locator('[role="button"][aria-label*="Inactive copy QA"]')).to_have_count(0)
        if len(writes) != 1:
            raise AssertionError(f"Expected one refused reposition request: {writes}")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="员工行").click()
        board = page.locator('section[aria-label="员工行排班"]')
        for _ in range(6):
            if "2026-10-09" in board.inner_text():
                break
            page.get_by_role("button", name="上一页").click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        expect(board.locator('[role="button"][aria-label*="Regular Bob 2026-10-09 Inactive copy QA"]')).to_have_count(1)
        expect(board.locator('[data-drop-target="browser-regular:2026-10-10"] [role="button"][aria-label*="Inactive copy QA"]')).to_have_count(0)
        print(json.dumps({"verified": True, "repositionStatus": response.status,
                          "code": response.json()["validation"]["code"], "shiftWrites": len(writes),
                          "sourceRetainedAfterReload": True}))
    finally:
        browser.close()
