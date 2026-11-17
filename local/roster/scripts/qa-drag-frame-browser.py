"""Measure a canceled Week employee-row drag in isolated Chromium at 50/100/500 staff."""

import json
import re
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


staff = int(sys.argv[1])
if staff not in (50, 100, 500):
    raise RuntimeError("Expected 50, 100 or 500 staff")
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
        page.on("request", lambda request: mutations.append(request.url) if request.method not in ("GET", "OPTIONS") else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="上一页").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=60000)
        board = page.get_by_role("region", name="员工行排班")
        expect(board).to_be_visible(timeout=60000)
        source = board.locator('div[role="button"][aria-label*="2026-10-09"]').first
        source.scroll_into_view_if_needed()
        expect(source).to_be_visible()
        targets = board.locator('[data-drop-target$=":2026-10-09"]')
        one = targets.nth(1)
        two = targets.nth(2)
        positions = []
        for item in (source, one, two):
            box = item.bounding_box()
            assert box is not None
            positions.append((box["x"] + box["width"] / 2, box["y"] + box["height"] / 2))
        page.evaluate("""() => {
          window.__dragFrames = [];
          window.__dragFrameRunning = true;
          let prior = null;
          const tick = now => {
            if (!window.__dragFrameRunning) return;
            if (prior !== null) window.__dragFrames.push(now - prior);
            prior = now;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }""")
        page.mouse.move(*positions[0])
        page.mouse.down()
        for index in range(72):
            page.mouse.move(*positions[1 + index % 2], steps=2)
            time.sleep(0.04)
        page.keyboard.press("Escape")
        page.mouse.up()
        frames = page.evaluate("() => { window.__dragFrameRunning = false; return window.__dragFrames }")
        assert len(frames) > 30, "Chromium produced too few visible frames"
        assert not any("/roster/shifts/" in url for url in mutations), "Canceled drag sent a shift mutation"
        frames.sort()
        print(json.dumps({"employees": staff, "frames": len(frames), "medianMs": round(frames[len(frames) // 2], 2),
                          "p95Ms": round(frames[int(len(frames) * 0.95)], 2), "maxMs": round(frames[-1], 2),
                          "over33Ms": sum(value > 33.3 for value in frames), "durationMs": round(sum(frames), 1),
                          "shiftMutations": 0}))
    finally:
        browser.close()
