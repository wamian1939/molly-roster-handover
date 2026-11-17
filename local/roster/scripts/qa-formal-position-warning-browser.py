"""Confirm Shift staff picker distinguishes Evaluate formal jobs from skill matching."""

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
api.post(base + "/auth/login", json=credential).raise_for_status()
period_url = base + "/roster/periods/qa-draft-period"
before_period = api.get(period_url, params={"storeId": "browser-store"}).json()
before_shifts = api.get(base + "/roster/calendar", params={"storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-10"}).json()["shifts"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridWeek&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        board.get_by_role("button", name="为 Regular Bob 在 2026-10-10 新建班次").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        regular = dialog.get_by_role("button", name=re.compile("^Regular Bob "))
        training = dialog.get_by_role("button", name=re.compile("^Training Alice "))
        expect(regular).to_contain_text("正式岗位：QA Front")
        expect(regular).to_contain_text("时间、班次技能与正式岗位资格已核对")
        expect(training).to_contain_text("正式岗位：未确认")
        expect(training).to_contain_text("当前班次正式岗位资格未确认")
        expect(training).not_to_contain_text("时间、班次技能与正式岗位资格已核对")
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        assert mutations == [], mutations
    finally:
        browser.close()

after_period = api.get(period_url, params={"storeId": "browser-store"}).json()
after_shifts = api.get(base + "/roster/calendar", params={"storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-10"}).json()["shifts"]
assert after_period == before_period and after_shifts == before_shifts
print(json.dumps({"verified": True, "confirmed": "Regular Bob", "unconfirmed": "Training Alice",
                  "rosterWrites": 0, "shiftAndPeriodUnchanged": True}))
