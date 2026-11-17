"""Verify a saved overnight Shift appears on both Week employee-row dates."""

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
        mutations = []
        page.on("request", lambda request: mutations.append(request.url)
                if request.method not in ("GET", "OPTIONS") and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="上一页").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        original = board.get_by_role("button", name=re.compile(r"HandoverEmployee006 2026-10-09 QA Front 22:00–02:00"))
        continuation = board.get_by_role("button", name=re.compile(r"HandoverEmployee006 2026-10-09 跨天延续至 2026-10-10 QA Front 00:00–02:00"))
        expect(original).to_be_visible()
        expect(continuation).to_be_visible()
        continuation.click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("heading", name="编辑班次")).to_be_visible()
        expect(dialog.locator('input[type="time"]').nth(0)).to_have_value("22:00")
        expect(dialog.locator('input[type="time"]').nth(1)).to_have_value("02:00")
        dialog.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        expect(dialog).to_have_count(0)
        continuation.scroll_into_view_if_needed()
        box = continuation.bounding_box()
        target = board.locator('[data-drop-target="browser-cindy:2026-10-10"]')
        target.scroll_into_view_if_needed()
        target_box = target.bounding_box()
        assert box and target_box
        page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
        page.mouse.down()
        page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + target_box["height"] / 2, steps=10)
        page.mouse.up()
        expect(continuation).to_be_visible()
        assert not mutations, "Continuation drag sent a Shift mutation"
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        if board.count() == 0:
            page.get_by_role("button", name="员工行").click()
        expect(board.get_by_role("button", name=re.compile(r"HandoverEmployee006 2026-10-09 跨天延续至 2026-10-10"))).to_be_visible()
        print(json.dumps({"verified": True, "sourceDate": "2026-10-09", "continuationDate": "2026-10-10",
                          "editOriginal": True, "dragMutations": len(mutations), "reloadVisible": True}))
    finally:
        browser.close()
