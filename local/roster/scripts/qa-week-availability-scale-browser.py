"""Measure current-source 500-person Week rows with 5,000 shifts and 2,500 Availability windows."""

import json
import re
import tempfile
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        shift_writes = []
        page.on("request", lambda request: shift_writes.append(request.url)
                if request.method in ("POST", "PATCH", "DELETE") and re.search(r"/api/roster/shifts(?:/|$)", request.url) else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        started = time.perf_counter()
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date=2026-10-19", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=60000)
        board = page.get_by_role("region", name="员工行排班")
        if not board.is_visible():
            page.get_by_role("button", name="员工行").click()
        expect(board).to_be_visible(timeout=60000)
        expect(board.locator('[data-availability="AVAILABLE"]')).to_have_count(300, timeout=60000)
        load_ms = round((time.perf_counter() - started) * 1000)
        assert board.locator('[data-drop-target$=":2026-10-19"]').count() == 60
        api_ms = {}
        for name, path, expected_count in [
            ("calendar", "/roster/calendar?storeId=browser-store&from=2026-10-19&to=2026-10-25", 5000),
            ("availability", "/roster/availability?storeId=browser-store&from=2026-10-18&to=2026-10-25", 2500),
        ]:
            samples = []
            for _ in range(3):
                api_started = time.perf_counter()
                response = page.context.request.get(f"http://127.0.0.1:4035/api{path}", timeout=30000)
                samples.append((time.perf_counter() - api_started) * 1000)
                assert response.status == 200, (name, response.status)
                payload = response.json()
                assert len(payload["shifts"] if name == "calendar" else payload) == expected_count
            api_ms[name] = round(sorted(samples)[1])

        search_started = time.perf_counter()
        board.get_by_placeholder("员工姓名").fill("Valid Employee 0499")
        expect(board.get_by_text("Valid Employee 0499", exact=True)).to_be_visible(timeout=15000)
        expect(board.locator('[data-availability="AVAILABLE"]')).to_have_count(5)
        search_ms = round((time.perf_counter() - search_started) * 1000)
        board.get_by_placeholder("员工姓名").fill("")
        expect(board.locator('[data-availability="AVAILABLE"]')).to_have_count(300)

        source = board.locator('div[role="button"][aria-label*="2026-10-19"]').first
        source.scroll_into_view_if_needed()
        targets = board.locator('[data-drop-target$=":2026-10-19"]')
        positions = []
        for item in (source, targets.nth(1), targets.nth(2)):
            box = item.bounding_box()
            assert box is not None
            positions.append((box["x"] + box["width"] / 2, box["y"] + box["height"] / 2))
        page.evaluate("""() => {
          window.__availabilityDragFrames = [];
          window.__availabilityDragRunning = true;
          let prior = null;
          const tick = now => {
            if (!window.__availabilityDragRunning) return;
            if (prior !== null) window.__availabilityDragFrames.push(now - prior);
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
        frames = page.evaluate("() => { window.__availabilityDragRunning = false; return window.__availabilityDragFrames }")
        assert len(frames) > 30, f"Too few frames: {len(frames)}"
        frames.sort()
        assert not shift_writes, shift_writes

        cdp = page.context.new_cdp_session(page)
        cdp.send("Performance.enable")
        metrics = cdp.send("Performance.getMetrics")["metrics"]
        heap = next((item["value"] for item in metrics if item["name"] == "JSHeapUsedSize"), None)
        print(json.dumps({"verified": True, "employees": 500, "shifts": 5000, "availabilityRows": 2500,
                          "initialRenderedRows": 60, "initialAvailabilityBadges": 300, "loadMs": load_ms,
                          "medianCalendarApiMs": api_ms["calendar"], "medianAvailabilityApiMs": api_ms["availability"],
                          "searchMs": search_ms, "dragFrames": len(frames), "medianFrameMs": round(frames[len(frames) // 2], 2),
                          "p95FrameMs": round(frames[int(len(frames) * 0.95)], 2), "maxFrameMs": round(frames[-1], 2),
                          "over33Ms": sum(value > 33.3 for value in frames),
                          "jsHeapUsedMiB": round(heap / 1048576, 1) if heap is not None else None,
                          "shiftWrites": len(shift_writes)}))
    finally:
        browser.close()
