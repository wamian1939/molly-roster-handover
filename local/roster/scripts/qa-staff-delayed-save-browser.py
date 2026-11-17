"""A delayed Staff save response must not replace a newer read for the same employee."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
api = "http://127.0.0.1:4035/api/roster/availability"
query = f"{api}?storeId=browser-store&from=2026-10-10&to=2026-10-10&employeeId=browser-HandoverEmployee006"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/staff?store=browser-store", wait_until="domcontentloaded")
        page.locator(".staff-directory-card").filter(has_text="HandoverEmployee006").click()
        page.locator('input[type="date"]').fill("2026-10-10")
        day = page.locator(".availability-day-card").nth(5)
        expect(day).to_contain_text("10/10", timeout=15000)
        existing = page.context.request.get(query).json()
        if existing:
            reset = page.context.request.put(api, data={
                "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
                "expectedRows": [{"id": row["id"], "version": row["version"]} for row in existing], "entries": [],
            })
            assert reset.status == 200, (reset.status, reset.text())
            page.reload(wait_until="domcontentloaded")
            page.locator(".staff-directory-card").filter(has_text="HandoverEmployee006").click()
            page.locator('input[type="date"]').fill("2026-10-10")
        expect(day.get_by_role("button", name="添加第一个时间段")).to_be_visible()
        pending = []

        def hold_save(route):
            if route.request.method != "PUT":
                route.continue_()
                return
            response = route.fetch()
            pending.append((route, response))

        page.route("**/api/roster/availability", hold_save)
        day.get_by_role("button", name="添加第一个时间段").click()
        page.get_by_role("button", name="保存可用时间", exact=True).click()
        for _ in range(100):
            if pending:
                break
            page.wait_for_timeout(50)
        assert len(pending) == 1, "Staff save request did not reach the backend"
        assert pending[0][1].status == 200, pending[0][1].status
        first = page.context.request.get(query).json()
        assert len(first) == 1 and first[0]["startAt"] == "2026-10-09T22:00:00.000Z", first
        replacement = page.context.request.put(api, data={
            "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
            "expectedRows": [{"id": first[0]["id"], "version": first[0]["version"]}],
            "entries": [{"date": "2026-10-10", "status": "AVAILABLE", "startAt": "2026-10-09T23:00:00.000Z", "endAt": "2026-10-10T07:00:00.000Z"}],
        })
        assert replacement.status == 200, (replacement.status, replacement.text())
        page.locator(".staff-directory-card").filter(has_text="Cindy").click()
        page.locator(".staff-directory-card").filter(has_text="HandoverEmployee006").click()
        start = day.get_by_label("2026-10-10 第 1 个时段开始时间", exact=True)
        expect(start).to_have_value("10:00", timeout=15000)
        pending[0][0].fulfill(response=pending[0][1])
        expect(page.get_by_role("button", name="保存可用时间", exact=True)).to_be_enabled(timeout=15000)
        expect(start).to_have_value("10:00")
        page.reload(wait_until="domcontentloaded")
        page.locator(".staff-directory-card").filter(has_text="HandoverEmployee006").click()
        page.locator('input[type="date"]').fill("2026-10-10")
        expect(day.get_by_label("2026-10-10 第 1 个时段开始时间", exact=True)).to_have_value("10:00", timeout=15000)
        latest = page.context.request.get(query).json()
        assert len(latest) == 1 and latest[0]["startAt"] == "2026-10-09T23:00:00.000Z", latest
        print(json.dumps({"verified": True, "olderSaveStatus": 200, "newerStartAt": latest[0]["startAt"], "rowCount": len(latest)}))
    finally:
        browser.close()
