"""Drag a Shift to an employee initially below the scroll viewport."""

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
second_pointer = "--second-pointer" in sys.argv

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1200, "height": 650}, locale="zh-CN")
        shift_mutations = []
        page.on("request", lambda request: shift_mutations.append(request.url)
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
        target = board.locator('[data-drop-target="browser-HandoverEmployee006:2026-10-09"]')
        expect(source).to_be_visible()
        source.scroll_into_view_if_needed()
        viewport = page.locator(".app-workspace-scroll")
        viewport_box = viewport.bounding_box()
        source_box = source.bounding_box()
        target_box = target.bounding_box()
        if not viewport_box or not source_box or not target_box:
            raise AssertionError("Missing drag geometry")
        if target_box["y"] + target_box["height"] > viewport_box["y"]:
            raise AssertionError("Target was already in the viewport")
        before = viewport.evaluate("element => element.scrollTop")
        x = source_box["x"] + source_box["width"] / 2
        page.mouse.move(x, source_box["y"] + source_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(x, viewport_box["y"] + 18, steps=10)
        if second_pointer:
            source.evaluate("""element => {
              for (const type of ['pointerdown', 'pointermove', 'pointercancel', 'pointerup']) {
                element.dispatchEvent(new PointerEvent(type, {
                  bubbles: true, pointerId: 2, pointerType: 'pen', isPrimary: true,
                  button: 0, clientX: 180, clientY: 180,
                }));
              }
            }""")
            if shift_mutations:
                raise AssertionError(f"Second pointer committed a Shift before the owner released: {shift_mutations}")
        for _ in range(25):
            target_box = target.bounding_box()
            if target_box and viewport_box["y"] < target_box["y"] and target_box["y"] + target_box["height"] < viewport_box["y"] + viewport_box["height"]:
                break
            page.wait_for_timeout(80)
        else:
            page.keyboard.press("Escape")
            page.mouse.up()
            raise AssertionError("Auto-scroll did not reveal HandoverEmployee006's row")
        after = viewport.evaluate("element => element.scrollTop")
        if after >= before - 30:
            raise AssertionError("Target became visible without auto-scrolling")
        for _ in range(5):
            target_box = target.bounding_box()
            assert target_box is not None
            x = target_box["x"] + target_box["width"] / 2
            y = target_box["y"] + target_box["height"] / 2
            page.mouse.move(x, y, steps=5)
            hit = page.evaluate("([x,y]) => document.elementFromPoint(x,y)?.closest('[data-drop-target]')?.getAttribute('data-drop-target')", [x, y])
            if hit == "browser-HandoverEmployee006:2026-10-09":
                break
        else:
            page.keyboard.press("Escape")
            page.mouse.up()
            raise AssertionError(f"Could not settle on HandoverEmployee006's cell after auto-scroll: hit={hit}, scroll={viewport.evaluate('element => element.scrollTop')}")
        with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/roster/shifts/qa-draft-shift")) as move_response:
            page.mouse.up()
        if move_response.value.status != 200:
            raise AssertionError(f"Cross-row save returned {move_response.value.status}: {move_response.value.text()}")
        if len(shift_mutations) != 1:
            raise AssertionError(f"Expected one owner-pointer Shift mutation, got {shift_mutations}")
        expect(board.locator('[role="button"][aria-label*="HandoverEmployee006 2026-10-09 QA Front"]')).to_be_visible(timeout=10000)
        expect(board.locator('[role="button"][aria-label*="Regular Bob 2026-10-09 QA Front"]')).to_have_count(0)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="上一页").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        if not page.locator('section[aria-label="员工行排班"]').count():
            page.get_by_role("button", name="员工行").click()
        board = page.locator('section[aria-label="员工行排班"]')
        expect(board.locator('[role="button"][aria-label*="HandoverEmployee006 2026-10-09 QA Front"]')).to_have_count(1)
        expect(board.locator('[role="button"][aria-label*="Regular Bob 2026-10-09 QA Front"]')).to_have_count(0)
        print(json.dumps({"verified": True, "scrollBefore": before, "scrollAfter": after,
                          "moveStatus": move_response.value.status, "berlinRetainedAfterReload": True,
                          "secondPointer": second_pointer, "shiftMutationCount": len(shift_mutations)}))
    finally:
        browser.close()
