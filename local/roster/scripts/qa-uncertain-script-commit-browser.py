"""Verify a committed Script import with unreadable HTTP success is reconciled once."""

import json
import re
import subprocess
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
backend = Path(__file__).resolve().parents[1] / "backend"


def verify(stage):
    result = subprocess.run(["npx.cmd", "tsx", "scripts/verify-multi-employee-script-browser.ts", stage],
                            cwd=backend, check=True, text=True, capture_output=True)
    return json.loads(result.stdout)


api = requests.Session()
base = "http://127.0.0.1:4035/api"
api.post(base + "/auth/login", json=credential).raise_for_status()
configuration = api.get(base + "/roster/availability-script/shortcuts", params={"storeId": "browser-store"})
configuration.raise_for_status()
if configuration.json()["configuration"] is None:
    configuration = api.put(base + "/roster/availability-script/shortcuts", json={"storeId": "browser-store",
        "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}]})
    assert configuration.status_code == 200, configuration.text
settings = api.put(base + "/roster/settings/browser-store", json={
    "storeId": "browser-store", "timezone": "Australia/Sydney", "openingTime": "09:00",
    "closingTime": "22:00", "slotIntervalMinutes": 30, "minimumShiftMinutes": 60,
    "defaultBreakMinutes": 30, "weekStartsOn": 1, "cycleType": "WEEK",
    "weeklyHourWarning": 38, "dailyHourWarning": 10,
})
assert settings.status_code in (200, 201), settings.text
assert verify("before")["availabilityRows"] == 0

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        observed = []
        failures = []
        page.on("response", lambda response: failures.append((response.status, response.url)) if response.status >= 400 else None)

        def intercept(route):
            response = route.fetch()
            observed.append({"status": response.status, "body": route.request.post_data_json})
            if len(observed) == 1:
                assert response.status == 200, response.text()
                route.fulfill(status=200, content_type="application/json", body="{not-json")
            else:
                route.fulfill(response=response)

        page.route("**/api/roster/availability-script/commit", intercept)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        trigger = page.get_by_role("button", name="Edit Preset Time Slot Script")
        try:
            expect(trigger).to_be_enabled(timeout=15000)
        except AssertionError:
            print(json.dumps({"staffText": page.locator("body").inner_text()[-1800:], "failures": failures}, ensure_ascii=False))
            raise
        trigger.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_label("Script", exact=True).fill("HandoverEmployee006\t1AA\nCindy\t2AA")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 2 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="确认追加 2 条").click()
        expect(dialog).to_have_count(0, timeout=15000)
        expect(page.get_by_text("脚本此前已导入")).to_be_visible(timeout=15000)
        assert len(observed) == 2, observed
        assert observed[0]["status"] == observed[1]["status"] == 200, observed
        assert observed[0]["body"] == observed[1]["body"], observed
        after = verify("after")
        page.reload()
        expect(page.get_by_role("button", name="Edit Preset Time Slot Script")).to_be_enabled(timeout=15000)
        print(json.dumps({"verified": True, "commits": len(observed),
                          "sameRequest": True, "availabilityRows": after["availabilityRows"],
                          "importAudits": after["importAudits"]}))
    finally:
        browser.close()
