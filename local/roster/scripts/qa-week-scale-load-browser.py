"""Measure current-source Week employee-board load with 500 employees/5,000 shifts."""

import json
import re
import tempfile
import time
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
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=60000)
        if not page.get_by_role("region", name="员工行排班").count():
            page.get_by_role("button", name="员工行").click()
        expect(page.get_by_role("region", name="员工行排班")).to_be_visible(timeout=60000)

        started = time.perf_counter()
        with page.expect_response(lambda response: response.request.method == "GET" and "/roster/calendar?" in response.url
                                  and "from=2026-10-05" in response.url, timeout=60000) as calendar_response:
            page.get_by_role("button", name="上一页").click()
        response = calendar_response.value
        assert response.status == 200
        calendar = response.json()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=60000)
        board = page.get_by_role("region", name="员工行排班")
        expect(board).to_be_visible(timeout=60000)
        rendered_ms = round((time.perf_counter() - started) * 1000)
        benchmark_shifts = sum(shift["id"].startswith("bench-shift-") for shift in calendar["shifts"])
        assert benchmark_shifts == 5000, f"Expected 5,000 benchmark Shifts; found {benchmark_shifts}"
        assert len(board.locator('[data-drop-target$=":2026-10-05"]').all()) == 60

        search_started = time.perf_counter()
        board.get_by_placeholder("员工姓名").fill("Benchmark 0499")
        expect(board.get_by_text("Benchmark 0499", exact=True)).to_be_visible(timeout=10000)
        search_ms = round((time.perf_counter() - search_started) * 1000)
        cdp = page.context.new_cdp_session(page)
        cdp.send("Performance.enable")
        metrics = cdp.send("Performance.getMetrics")["metrics"]
        heap_used = next((item["value"] for item in metrics if item["name"] == "JSHeapUsedSize"), None)
        print(json.dumps({"verified": True, "employees": 500, "benchmarkShifts": benchmark_shifts,
                          "renderedMs": rendered_ms, "searchMs": search_ms, "initialRenderedRows": 60,
                          "jsHeapUsedMiB": round(heap_used / (1024 * 1024), 1) if heap_used is not None else None}))
    finally:
        browser.close()
