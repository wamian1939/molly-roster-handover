"""Exercise employee-row drag near the scroll viewport edge in disposable Chromium."""

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
        page = browser.new_page(viewport={"width": 1200, "height": 650}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append(request.url)
                if request.method not in ("GET", "OPTIONS") and "/roster/shifts/" in request.url else None)
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
        expect(source).to_be_visible()
        source.scroll_into_view_if_needed()
        viewport = page.locator(".app-workspace-scroll")
        viewport_box = viewport.bounding_box()
        source_box = source.bounding_box()
        if not viewport_box or not source_box:
            raise AssertionError("Missing scroll or source geometry")
        before = viewport.evaluate("element => element.scrollTop")
        start_x = source_box["x"] + source_box["width"] / 2
        start_y = source_box["y"] + source_box["height"] / 2
        edge_y = viewport_box["y"] + viewport_box["height"] - 18
        page.mouse.move(start_x, start_y)
        page.mouse.down()
        page.mouse.move(start_x, edge_y, steps=10)
        page.wait_for_timeout(800)
        after = viewport.evaluate("element => element.scrollTop")
        page.keyboard.press("Escape")
        page.mouse.up()
        stopped = viewport.evaluate("element => element.scrollTop")
        page.wait_for_timeout(120)
        stable = viewport.evaluate("element => element.scrollTop")
        if after <= before + 30:
            raise AssertionError(f"Employee-row drag did not auto-scroll: before={before}, after={after}")
        if stable != stopped:
            raise AssertionError(f"Scrolling continued after Escape: stopped={stopped}, stable={stable}")

        source.scroll_into_view_if_needed()
        source_box = source.bounding_box()
        viewport_box = viewport.bounding_box()
        if not source_box or not viewport_box:
            raise AssertionError("Missing geometry for upward drag")
        before_up = viewport.evaluate("element => element.scrollTop")
        page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(source_box["x"] + source_box["width"] / 2, viewport_box["y"] + 18, steps=10)
        page.wait_for_timeout(800)
        after_up = viewport.evaluate("element => element.scrollTop")
        page.keyboard.press("Escape")
        page.mouse.up()
        if after_up >= before_up - 30:
            raise AssertionError(f"Employee-row drag did not scroll upward: before={before_up}, after={after_up}")
        expect(page.get_by_role("dialog")).to_have_count(0)
        if mutations:
            raise AssertionError(f"Canceled drag sent mutations: {mutations}")
        print(json.dumps({"verified": True, "downBefore": before, "downAfter": after,
                          "upBefore": before_up, "upAfter": after_up, "cancelSentMutations": False}))
    finally:
        browser.close()
