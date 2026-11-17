"""Check Settings save responses against the submitted values and version."""

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
api = "http://127.0.0.1:4035/api"
settings_url = f"{api}/roster/settings?storeId=browser-store"
save_url = f"{api}/roster/settings/browser-store"
save_pattern = re.compile(r"/api/roster/settings/browser-store$")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        initial_save = page.request.put(save_url, data={
            "storeId": "browser-store", "timezone": "Australia/Sydney",
            "openingTime": "09:00", "closingTime": "22:00", "slotIntervalMinutes": 30,
            "minimumShiftMinutes": 60, "defaultBreakMinutes": 30, "weekStartsOn": 1,
            "cycleType": "WEEK", "weeklyHourWarning": 38, "dailyHourWarning": 10,
        })
        assert initial_save.status == 200, (initial_save.status, initial_save.text())
        baseline = page.request.get(settings_url).json()["settings"]
        assert baseline["version"] == 1 and baseline["openingTime"] == "09:00", baseline
        page.goto("http://127.0.0.1:5177/settings", wait_until="domcontentloaded")
        opening = page.get_by_label("营业开始")
        expect(opening).to_have_value("09:00", timeout=15000)
        opening.fill("08:00")

        calls = []

        def stale_value(route):
            calls.append("stale-value")
            route.fulfill(status=200, content_type="application/json", body=json.dumps({
                **baseline, "version": 2,
            }))

        page.route(save_pattern, stale_value)
        page.get_by_role("button", name="保存规则").click()
        expect(page.get_by_text("保存结果未确认", exact=True).last).to_be_visible(timeout=15000)
        expect(opening).to_have_value("08:00")
        assert page.request.get(settings_url).json()["settings"] == baseline
        page.unroute(save_pattern, stale_value)

        def stale_version(route):
            calls.append("stale-version")
            route.fulfill(status=200, content_type="application/json", body=json.dumps({
                **baseline, "openingTime": "08:00",
            }))

        page.route(save_pattern, stale_version)
        page.get_by_role("button", name="保存规则").click()
        expect(page.get_by_text("保存结果未确认", exact=True).last).to_be_visible(timeout=15000)
        expect(opening).to_have_value("08:00")
        assert page.request.get(settings_url).json()["settings"] == baseline
        page.unroute(save_pattern, stale_version)

        page.get_by_role("button", name="保存规则").click()
        expect(page.get_by_text("门店设置已保存", exact=True).last).to_be_visible(timeout=15000)
        committed = page.request.get(settings_url).json()["settings"]
        assert committed["version"] == 2 and committed["openingTime"] == "08:00", committed
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_label("营业开始")).to_have_value("08:00", timeout=15000)
        assert calls == ["stale-value", "stale-version"], calls
        print(json.dumps({"verified": True, "rejected": calls, "savedVersion": committed["version"],
                          "savedOpeningTime": committed["openingTime"]}))
    finally:
        browser.close()
