"""Check touch edit/create and swipe cancellation in the isolated Week employee board."""

import json
import os
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
viewport_width = int(os.environ.get("ROSTER_QA_VIEWPORT_WIDTH", "390"))
if not 320 <= viewport_width <= 600:
    raise RuntimeError("Touch QA viewport width must be between 320 and 600")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": viewport_width, "height": 844}, is_mobile=True,
                                has_touch=True, device_scale_factor=2, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append(request.url)
                if request.method not in ("GET", "OPTIONS") and "/roster/shifts/" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').tap()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="员工行").tap()
        board = page.locator('section[aria-label="员工行排班"]')
        expect(board).to_be_visible()
        for _ in range(6):
            if "2026-10-09" in board.inner_text():
                break
            page.get_by_role("button", name="上一页").tap()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        else:
            raise AssertionError("Could not navigate to fixture week")

        source = board.locator('[role="button"][aria-label*="Regular Bob 2026-10-09 QA Front"]')
        source.scroll_into_view_if_needed()
        board.locator(".overflow-x-auto").evaluate("element => { element.scrollLeft = Math.max(0, element.scrollLeft - 100) }")
        source.tap()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("textbox", name="开始时间")).to_have_value("09:00")
        expect(dialog.get_by_role("textbox", name="结束时间")).to_have_value("13:00")
        dialog.get_by_role("button", name="取消").tap()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").tap()
        expect(dialog).to_have_count(0)

        employee_button = board.get_by_role("button", name="在时间轴查看 HandoverEmployee006")
        employee_box = employee_button.bounding_box()
        if not employee_box or employee_box["width"] < 44 or employee_box["height"] < 44:
            raise AssertionError(f"Employee-row selection target is below 44px: {employee_box}")

        create_button = board.get_by_role("button", name="为 HandoverEmployee006 在 2026-10-10 新建班次")
        create_box = create_button.bounding_box()
        if not create_box or create_box["width"] < 44 or create_box["height"] < 44:
            raise AssertionError(f"Employee-row touch create target is below 44px: {create_box}")
        create_button.tap()
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("button", name=re.compile("^HandoverEmployee006 "))).to_have_attribute("aria-pressed", "true")
        dialog.get_by_role("button", name="取消").tap()
        expect(dialog).to_have_count(0)

        source.scroll_into_view_if_needed()
        box = source.bounding_box()
        if not box:
            raise AssertionError("Missing touch card geometry")
        x = box["x"] + box["width"] / 2
        y = box["y"] + box["height"] / 2
        before_scroll = board.locator(".overflow-x-auto").evaluate("element => element.scrollLeft")
        client = page.context.new_cdp_session(page)
        client.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y, "id": 1}]})
        for distance in (25, 55, 90):
            client.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x - distance, "y": y, "id": 1}]})
            page.wait_for_timeout(35)
        client.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.wait_for_timeout(200)
        after_scroll = board.locator(".overflow-x-auto").evaluate("element => element.scrollLeft")
        expect(dialog).to_have_count(0)
        employee_button.tap()
        expect(page.locator('[aria-label="日历员工筛选"] input')).to_have_value("HandoverEmployee006")
        if mutations:
            raise AssertionError(f"Touch swipe sent Shift mutations: {mutations}")
        print(json.dumps({"verified": True, "viewport": f"{viewport_width}x844", "tapEdit": True,
                          "tapCreateCancel": True, "tapSelectEmployee": True, "swipeShiftWrites": len(mutations),
                          "swipeScrollBefore": before_scroll, "swipeScrollAfter": after_scroll,
                          "createTarget": create_box, "employeeTarget": employee_box}))
    finally:
        browser.close()
