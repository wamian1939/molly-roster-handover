"""Verify Day paging never hides scheduled staff in a disposable 50-person fixture."""

import json
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
staff = int(sys.argv[1]) if len(sys.argv) > 1 else 50
assert staff in (50, 500)
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
        roster_writes = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: roster_writes.append(request.url) if
                request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-05",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=30000)
        filter_panel = page.get_by_label("日历员工筛选")
        expect(filter_panel).to_be_visible()
        benchmark_names = set()
        page_counts = []
        for index in range(staff // 10):
            expect(filter_panel.get_by_role("status")).to_contain_text(
                f"显示 {index * 10 + 1}–{(index + 1) * 10} / {staff}", timeout=10000)
            expect(filter_panel.get_by_role("status")).to_contain_text(
                f"本页 20 / 当前视图 {staff * 2} 个班次", timeout=10000)
            cards = page.locator(".fc-timegrid-event")
            expect(cards.first).to_be_visible(timeout=10000)
            page_counts.append(cards.count())
            visible_text = "\n".join(cards.all_inner_texts())
            benchmark_names.update(re.findall(r"Benchmark \d{4}", visible_text))
            if index < staff // 10 - 1:
                filter_panel.get_by_role("button", name="下一组").click()
        assert len(benchmark_names) == staff - 10, {"benchmarkNames": len(benchmark_names), "pages": page_counts}

        search = filter_panel.get_by_role("textbox", name="搜索员工")
        last_employee = f"Benchmark {staff - 1:04d}"
        search.fill(last_employee)
        expect(filter_panel.get_by_role("status")).to_contain_text("显示 1–1 / 1", timeout=10000)
        expect(filter_panel.get_by_role("status")).to_contain_text(
            f"本页 2 / 当前视图 {staff * 2} 个班次", timeout=10000)
        expect(page.locator(".fc-timegrid-event").first).to_contain_text(last_employee, timeout=10000)
        search.fill("")
        expect(filter_panel.get_by_role("status")).to_contain_text(f"显示 1–10 / {staff}", timeout=10000)
        assert not errors and not roster_writes, {"errors": errors, "writes": roster_writes}
        print(json.dumps({"verified": True, "day": "2026-10-05", "staff": staff,
                          "pages": staff // 10, "cardsPerPage": page_counts,
                          "benchmarkStaffSeen": len(benchmark_names),
                          "lastEmployeeSearch": True, "rosterWrites": 0, "pageErrors": 0}))
    finally:
        browser.close()
