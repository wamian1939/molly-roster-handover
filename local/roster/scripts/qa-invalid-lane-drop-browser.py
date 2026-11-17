"""Verify an overlapping Week row drop is blocked locally in disposable Chromium."""

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
        shift_mutations = []
        page.on("request", lambda request: shift_mutations.append(request.url)
                if request.method not in ("GET", "OPTIONS") and "/roster/shifts/" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="上一页").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        source = board.get_by_role("button", name=re.compile(r"Regular Bob 2026-10-09 QA Front"))
        target = board.locator('[data-drop-target="browser-HandoverEmployee006:2026-10-09"]')
        source.scroll_into_view_if_needed()
        target.scroll_into_view_if_needed()
        source_box = source.bounding_box()
        target_box = target.bounding_box()
        assert source_box is not None and target_box is not None
        viewport = page.viewport_size
        assert viewport is not None
        for box in (source_box, target_box):
            assert 0 <= box["x"] + box["width"] / 2 < viewport["width"]
            assert 0 <= box["y"] + box["height"] / 2 < viewport["height"], "Drag endpoints must be in the browser viewport"
        page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + target_box["height"] / 2, steps=12)
        expect(target).to_have_class(re.compile(r"ring-red-500"))
        expect(board.get_by_role("status")).to_contain_text("目标员工已有重叠班次")
        page.mouse.up()
        expect(board.get_by_role("alert")).to_contain_text("目标员工已有重叠班次")
        expect(source).to_be_visible()
        expect(page.get_by_role("dialog")).to_have_count(0)
        assert not shift_mutations, "Known-invalid drop sent a Shift mutation"
        print(json.dumps({"verified": True, "invalidTargetRing": True, "visibleError": True,
                          "sourceUnchanged": True, "shiftMutations": len(shift_mutations)}))
    finally:
        browser.close()
