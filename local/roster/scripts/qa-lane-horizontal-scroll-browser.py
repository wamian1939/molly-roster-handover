"""Check horizontal Week employee-row dragging in an isolated narrow viewport."""

import json
import re
import sys
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
commit = "--commit" in sys.argv
verify_saved = "--verify-saved" in sys.argv
right = "--right" in sys.argv
fresh_right = "--right-fresh" in sys.argv
right = right or fresh_right

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 600, "height": 700}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append(request.url)
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
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        if verify_saved:
            expect(board.locator('[role="button"][aria-label*="Regular Bob 2026-10-05 QA Front"]')).to_be_visible()
            print(json.dumps({"verifiedAfterReload": True, "sourceShiftDate": "2026-10-05"}))
            sys.exit(0)
        source_date = "2026-10-05" if right and not fresh_right else "2026-10-09"
        source = board.locator(f'[role="button"][aria-label*="Regular Bob {source_date} QA Front"]')
        source.scroll_into_view_if_needed()
        scroller = board.locator(".overflow-x-auto")
        if fresh_right:
            scroller.evaluate("element => element.scrollLeft = 220")
        bounds = scroller.bounding_box()
        source_box = source.bounding_box()
        if not bounds or not source_box:
            raise AssertionError("Missing narrow-board geometry")
        candidates = [("right", "2026-10-11")] if right else [("left", "2026-10-05")]
        for direction, date in candidates:
            cell = board.locator(f'[data-drop-target="browser-regular:{date}"]')
            cell_box = cell.bounding_box()
            if cell_box and ((direction == "left" and cell_box["x"] + cell_box["width"] <= bounds["x"])
                             or (direction == "right" and cell_box["x"] >= bounds["x"] + bounds["width"])):
                break
        else:
            raise AssertionError(f"No offscreen target date; source={source_box}, board={bounds}")
        before = scroller.evaluate("element => element.scrollLeft")
        y = source_box["y"] + source_box["height"] / 2
        page.mouse.move(source_box["x"] + source_box["width"] / 2, y)
        page.mouse.down()
        edge_x = bounds["x"] + 176 + 18 if direction == "left" else bounds["x"] + bounds["width"] - 18
        page.mouse.move(edge_x, y, steps=10)
        page.wait_for_timeout(800)
        after = scroller.evaluate("element => element.scrollLeft")
        if (direction == "left" and after >= before - 30) or (direction == "right" and after <= before + 30):
            raise AssertionError(f"Horizontal drag did not auto-scroll {direction}: before={before}, after={after}")
        if direction == "left" and "ring-brand-500" not in cell.get_attribute("class"):
            raise AssertionError("Revealed destination did not receive valid-drop preview")
        if commit:
            if date != "2026-10-05":
                raise AssertionError("Commit fixture only supports the guarded 5 October target")
            target_box = cell.bounding_box()
            if not target_box:
                raise AssertionError("Scrolled destination has no geometry")
            page.mouse.move(target_box["x"] + target_box["width"] / 2, y, steps=8)
            page.mouse.up()
            moved = board.locator('[role="button"][aria-label*="Regular Bob 2026-10-05 QA Front"]')
            expect(moved).to_be_visible(timeout=15000)
            if len(mutations) != 1:
                raise AssertionError(f"Expected one Shift mutation, got {mutations}")
        else:
            page.keyboard.press("Escape")
            page.mouse.up()
        if mutations:
            if not commit:
                raise AssertionError(f"Canceled drag sent Shift mutations: {mutations}")
        print(json.dumps({"verified": True, "direction": direction, "targetDate": date,
                          "before": before, "after": after, "committed": commit,
                          "shiftMutationCount": len(mutations)}))
    finally:
        browser.close()
