"""Verify Week employee-row Availability, overnight carryover, failure isolation and retry."""

import json
import re
import tempfile
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
evidence = Path(__file__).resolve().parent.parent / "docs" / "evidence" / "calendar-week-availability-2026-10-15.png"
base = "http://127.0.0.1:4035/api"


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

        for employee_id, date, status, start, end in [
            ("browser-HandoverEmployee006", "2026-10-09", "AVAILABLE", "2026-10-09T11:00:00.000Z", "2026-10-09T15:00:00.000Z"),
            ("browser-cindy", "2026-10-10", "UNAVAILABLE", "2026-10-10T03:00:00.000Z", "2026-10-10T05:00:00.000Z"),
        ]:
            response = page.context.request.put(f"{base}/roster/availability", data={
                "storeId": "browser-store", "employeeId": employee_id, "dates": [date], "expectedRows": [],
                "entries": [{"date": date, "status": status, "startAt": start, "endAt": end}],
            })
            assert response.status == 200, (response.status, response.text())

        failures = []

        def fail_availability(route):
            failures.append(route.request.url)
            route.fulfill(status=503, content_type="application/json", body='{"message":"Availability fixture unavailable"}')

        pattern = re.compile(r"/api/roster/availability\?")
        page.route(pattern, fail_availability)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        board = page.get_by_role("region", name="员工行排班")
        if not board.is_visible():
            page.get_by_role("button", name="员工行").click()
        expect(board).to_be_visible()
        expect(board.get_by_role("alert")).to_contain_text("Availability fixture unavailable")
        expect(board.get_by_role("button", name=re.compile("Regular Bob 2026-10-09"))).to_be_visible()
        assert failures and all("from=2026-10-04&to=2026-10-11" in url for url in failures), failures

        page.unroute(pattern, fail_availability)
        board.get_by_role("button", name="重试").click()
        expect(board.get_by_role("alert")).to_have_count(0, timeout=15000)
        expect(board.get_by_label("HandoverEmployee006 2026-10-09 可用时间")).to_contain_text("可用 22:00–24:00")
        expect(board.get_by_label("HandoverEmployee006 2026-10-10 可用时间")).to_contain_text("可用 00:00–02:00")
        expect(board.get_by_label("Cindy 2026-10-10 可用时间")).to_contain_text("不可用 14:00–16:00")
        board.get_by_label("HandoverEmployee006 2026-10-09 可用时间").locator("span").first.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))).to_have_attribute("aria-pressed", "true")
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        evidence.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(evidence), full_page=True)

        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        board = page.get_by_role("region", name="员工行排班")
        if not board.is_visible():
            page.get_by_role("button", name="员工行").click()
        expect(board.get_by_label("HandoverEmployee006 2026-10-10 可用时间")).to_contain_text("可用 00:00–02:00", timeout=15000)
        assert not shift_writes, shift_writes
        print(json.dumps({"verified": True, "availability503DidNotBlankCalendar": True,
                          "retryRecovered": True, "overnightSplit": ["22:00–24:00", "00:00–02:00"],
                          "unavailableWindow": "14:00–16:00", "badgeClickOpenedCreate": True, "reloadPersisted": True,
                          "shiftWrites": len(shift_writes), "screenshot": str(evidence)}))
    finally:
        browser.close()
