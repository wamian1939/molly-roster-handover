"""Measure a disposable Day view with 50, 100 or 500 employees."""

import json
import re
import statistics
import sys
import tempfile
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


staff = int(sys.argv[1])
assert staff in (50, 100, 500)
measure_drag = "--drag" in sys.argv[2:]
temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        errors = []
        writes = []
        calendar_counts = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: writes.append(request.url) if
                request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/" in request.url else None)
        page.on("response", lambda response: calendar_counts.append(len(response.json().get("shifts", []))) if
                response.request.method == "GET" and "/api/roster/calendar?" in response.url and
                response.status == 200 else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible(timeout=15000)
        start = time.perf_counter()
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-05",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=30000)
        expect(page.locator(".fc-timegrid-event").first).to_be_visible(timeout=30000)
        expect(page.get_by_label("日历员工筛选").get_by_role("status")).to_contain_text(
            f"本页 20 / 当前视图 {staff * 2} 个班次", timeout=30000)
        ready_ms = round((time.perf_counter() - start) * 1000)
        cards = page.locator(".fc-timegrid-event").count()
        assert cards <= 30, f"Day should page dense employee cards, got {cards}"
        cdp = page.context.new_cdp_session(page)
        cdp.send("Performance.enable")
        metrics = {item["name"]: item["value"] for item in cdp.send("Performance.getMetrics")["metrics"]}
        heap_mib = round(metrics.get("JSHeapUsedSize", 0) / 1024 / 1024, 1)
        dimensions = page.evaluate("() => ({document: document.documentElement.scrollWidth, viewport: innerWidth})")
        assert dimensions["document"] <= dimensions["viewport"] + 2, dimensions
        drag_metrics = {}
        if measure_drag:
            page.locator('.fc-timegrid-slot-lane[data-time="20:00:00"]').scroll_into_view_if_needed()
            point = page.evaluate("""() => {
              const column = document.querySelector('.fc-timegrid-col[data-date="2026-10-05"]')?.getBoundingClientRect();
              const first = document.querySelector('.fc-timegrid-slot-lane[data-time="20:00:00"]')?.getBoundingClientRect();
              const last = document.querySelector('.fc-timegrid-slot-lane[data-time="21:00:00"]')?.getBoundingClientRect();
              if (!column || !first || !last) return null;
              for (let fraction = 0.1; fraction < 1; fraction += 0.1) {
                const x = column.left + column.width * fraction;
                const y1 = first.top + first.height / 2;
                const y2 = last.top + last.height / 2;
                if (x < 0 || x > innerWidth || y1 < 0 || y2 > innerHeight) continue;
                if (![y1, y2].some(y => document.elementFromPoint(x, y)?.closest('.fc-event'))) return {x, y1, y2};
              }
              return null;
            }""")
            if point is None:
                drag_metrics = {"dragMeasured": False, "reason": "No visible blank 20:00–21:00 point"}
            else:
                page.evaluate("""() => {
                  window.__dayFrameSamples = []; window.__dayFrameRunning = true;
                  let prior = null;
                  const tick = now => {
                    if (!window.__dayFrameRunning) return;
                    if (prior !== null) window.__dayFrameSamples.push(now - prior);
                    prior = now; requestAnimationFrame(tick);
                  };
                  requestAnimationFrame(tick);
                }""")
                page.mouse.move(point["x"], point["y1"])
                page.mouse.down()
                for index in range(90):
                    page.mouse.move(point["x"], point["y2"] if index % 2 else point["y1"], steps=2)
                    time.sleep(0.03)
                page.keyboard.press("Escape")
                page.mouse.up()
                samples = page.evaluate("() => { window.__dayFrameRunning = false; return window.__dayFrameSamples }")
                assert len(samples) > 30, f"Too few Day drag frames: {len(samples)}"
                drag_metrics = {"dragMeasured": True, "frames": len(samples),
                                "medianFrameMs": round(statistics.median(samples), 2),
                                "p95FrameMs": round(sorted(samples)[int(len(samples) * 0.95)], 2),
                                "over33Ms": sum(value > 33.3 for value in samples)}
                expect(page.get_by_role("dialog")).to_have_count(0)
        assert not errors and not writes, {"errors": errors, "writes": writes}
        print(json.dumps({"verified": True, "employees": staff, "readyMs": ready_ms,
                          "renderedCards": cards, "largestCalendarResponseShifts": max(calendar_counts, default=0),
                          "heapMiB": heap_mib, "documentWidth": dimensions["document"],
                          "viewportWidth": dimensions["viewport"], "rosterWrites": 0, "pageErrors": 0,
                          **drag_metrics}))
    finally:
        browser.close()
