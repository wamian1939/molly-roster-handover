"""Check that a malformed successful Availability save cannot be treated as confirmed."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
base = "http://127.0.0.1:4035/api"

api = requests.Session()
api.post(base + "/auth/login", json=credential, timeout=10).raise_for_status()
settings = api.get(base + "/roster/settings", params={"storeId": "browser-store"}, timeout=10)
settings.raise_for_status()
if settings.json()["settings"] is None:
    api.put(base + "/roster/settings/browser-store", json={
        "storeId": "browser-store", "timezone": "Australia/Sydney",
        "openingTime": "00:00", "closingTime": "23:59", "slotIntervalMinutes": 30,
        "minimumShiftMinutes": 60, "defaultBreakMinutes": 0, "weekStartsOn": 1,
        "cycleType": "WEEK", "weeklyHourWarning": 38, "dailyHourWarning": 10,
    }, timeout=10).raise_for_status()

query = {"storeId": "browser-store", "from": "2026-10-05", "to": "2026-10-11", "employeeId": "browser-HandoverEmployee006"}
before = api.get(base + "/roster/availability", params=query, timeout=10)
before.raise_for_status()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page_errors = []
        submitted = []
        malformed_reads = []
        malformed_read_enabled = True
        page.on("pageerror", lambda error: page_errors.append(str(error)))

        def malformed_save(route):
            body = route.request.post_data_json
            assert body["storeId"] == "browser-store" and body["employeeId"] == "browser-HandoverEmployee006"
            assert body["entries"], "The injected response must mismatch a nonempty replacement"
            submitted.append(body)
            route.fulfill(status=200, content_type="application/json", body="[]")

        def availability_route(route):
            if route.request.method == "PUT":
                malformed_save(route)
            elif (malformed_read_enabled and "employeeId=browser-HandoverEmployee006" in route.request.url
                  and "from=2026-10-05" in route.request.url):
                malformed_reads.append(route.request.url)
                route.fulfill(status=200, content_type="application/json", body=json.dumps([{
                    "id": "foreign-row", "storeId": "browser-store", "employeeId": "browser-cindy",
                    "date": "2026-10-10", "status": "AVAILABLE",
                    "startAt": "2026-10-09T23:00:00.000Z", "endAt": "2026-10-10T07:00:00.000Z",
                    "note": None, "source": "MANUAL", "version": 1,
                }]))
            else:
                route.continue_()

        page.route(re.compile(r"/api/roster/availability(?:\?|$)"), availability_route)
        page.goto("http://127.0.0.1:5177/staff?store=browser-store", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.get_by_role("heading", name="员工与可用时间")).to_be_visible(timeout=15000)
        page.locator(".staff-directory-card").filter(has_text="HandoverEmployee006").click()
        page.locator('input[type="date"]').fill("2026-10-10")
        error = page.locator('div.bg-red-50[role="alert"]')
        expect(error).to_contain_text("可用时间读取结果不完整", timeout=15000)
        expect(page.get_by_role("button", name="保存可用时间", exact=True)).to_be_disabled()
        assert malformed_reads
        malformed_read_enabled = False
        page.get_by_role("button", name="重试可用时间").click()
        day = page.locator(".availability-day-card").filter(has_text="10/10")
        expect(day.get_by_role("button", name="添加第一个时间段")).to_be_visible(timeout=15000)
        day.get_by_role("button", name="添加第一个时间段").click()
        save = page.get_by_role("button", name="保存可用时间", exact=True)
        expect(save).to_be_enabled()
        save.click()
        alert = page.locator('div.bg-amber-50[role="alert"]')
        expect(alert).to_contain_text("上次保存结果尚未确认", timeout=15000)
        expect(save).to_be_disabled()
        expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible()
        expect(page.get_by_text("可用时间已保存", exact=True)).to_have_count(0)
        assert len(submitted) == 1
        assert api.get(base + "/roster/availability", params=query, timeout=10).json() == before.json()
        page.get_by_role("button", name="重新加载可用时间").click()
        expect(save).to_be_enabled(timeout=15000)
        assert not page_errors, page_errors
        print(json.dumps({"verified": True, "malformedReadRejected": True,
                          "submittedEntries": len(submitted[0]["entries"]),
                          "uncertainBanner": True, "retryBlocked": True, "databaseUnchanged": True,
                          "reloadEnabledSave": True, "pageErrors": page_errors}))
    finally:
        browser.close()
