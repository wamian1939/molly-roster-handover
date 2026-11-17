"""Read a published Shift in Month/Week/Day without entering an edit workflow."""

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
api = requests.Session()
login = api.post("http://127.0.0.1:4040/api/auth/login", json=credential)
login.raise_for_status()
shift_url = "http://127.0.0.1:4040/api/roster/shifts/qa-published-shift"
before_response = api.get(shift_url, params={"storeId": "browser-store"})
before_response.raise_for_status()
before = before_response.json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url)) if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5178/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        for view, event_selector in (("dayGridMonth", ".fc-daygrid-event"), ("timeGridWeek", ".fc-timegrid-event"), ("timeGridDay", ".fc-timegrid-event")):
            page.goto(f"http://127.0.0.1:5178/calendar?view={view}&date=2026-10-16", wait_until="domcontentloaded")
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            event = (page.locator('.fc-daygrid-day[data-date="2026-10-16"]').locator(event_selector)
                     if view == "dayGridMonth" else page.locator(event_selector)).filter(has_text="Regular Bob")
            expect(event).to_have_count(1, timeout=15000)
            expect(event).to_contain_text("QA Front")
            expect(event).not_to_contain_text("待核对")
            expect(event).not_to_contain_text("旧岗位")
            event.click()
            dialog = page.get_by_role("dialog")
            expect(dialog.get_by_role("heading", name="班次详情")).to_be_visible()
            expect(dialog).to_contain_text("已发布")
            expect(dialog).to_contain_text("QA Front")
            expect(dialog).to_contain_text("Regular Bob")
            expect(dialog).to_contain_text("09:00–13:00")
            expect(dialog).to_contain_text("公开备注")
            expect(dialog).to_contain_text("内部备注")
            expect(dialog.get_by_role("button", name="保存班次")).to_have_count(0)
            expect(dialog.get_by_role("button", name="删除班次")).to_have_count(0)
            dialog.get_by_role("button", name="关闭班次详情").click()
            expect(page.get_by_role("dialog")).to_have_count(0)

        assert writes == [], writes
        after_response = api.get(shift_url, params={"storeId": "browser-store"})
        after_response.raise_for_status()
        assert after_response.json() == before
        print(json.dumps({"publishedDetailViews": ["month", "week", "day"], "shiftWrites": 0, "databaseUnchanged": True}))
    finally:
        browser.close()
