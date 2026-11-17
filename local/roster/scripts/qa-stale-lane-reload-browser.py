"""Verify an employee-row stale save reloads the authoritative Shift after HTTP 409."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster QA schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate QA schema")
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
        page.get_by_role("button", name="员工行").click()
        board = page.locator('section[aria-label="员工行排班"]')
        source = board.locator('[role="button"][aria-label*="Regular Bob 2026-10-09 QA Front"]')
        target = board.locator('[data-drop-target="browser-cindy:2026-10-09"]')
        expect(source).to_be_visible()
        expect(target).to_be_visible()

        roles_response = page.context.request.get("http://127.0.0.1:4035/api/roster/roles?storeId=browser-store")
        if roles_response.status != 200:
            raise AssertionError(f"Cannot read fixture roles: {roles_response.status}")
        role = next(row for row in roles_response.json() if row["code"] == "qa-stale-lane")
        admin_update = page.context.request.post("http://127.0.0.1:4035/api/roster/batch/update", data={
            "storeId": "browser-store", "items": [{"id": "qa-draft-shift", "version": 1}], "patch": {"shiftRoleId": role["id"]},
        })
        if admin_update.status != 200:
            raise AssertionError(f"Concurrent administrator update failed: {admin_update.status} {admin_update.text()}")

        source.scroll_into_view_if_needed()
        source_box = source.bounding_box()
        target_box = target.bounding_box()
        if not source_box or not target_box:
            raise AssertionError("Missing lane drag geometry")
        page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + target_box["height"] / 2, steps=12)
        with page.expect_response(lambda response: response.request.method == "PATCH" and "/roster/shifts/qa-draft-shift" in response.url) as stale_response:
            page.mouse.up()
        if stale_response.value.status != 409:
            raise AssertionError(f"Expected stale Shift rejection, got {stale_response.value.status}")
        expect(board.locator('[role="button"][aria-label*="Regular Bob 2026-10-09 QA Changed"]')).to_be_visible(timeout=10000)
        expect(board.locator('[role="button"][aria-label*="Regular Bob 2026-10-09 QA Front"]')).to_have_count(0)
        expect(board.locator('[role="button"][aria-label*="Cindy 2026-10-09 QA Changed"]')).to_have_count(0)
        print(json.dumps({"verified": True, "staleStatus": 409, "authoritativeRoleVisible": True,
                          "sourceEmployeeRetained": True}))
    finally:
        browser.close()
