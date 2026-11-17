"""Published Month cards must not enter the editable batch selection."""

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
api.post("http://127.0.0.1:4040/api/auth/login", json=credential).raise_for_status()
before = api.get("http://127.0.0.1:4040/api/roster/calendar", params={"storeId": "browser-store", "from": "2026-10-01", "to": "2026-10-31"}).json()

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
        page.goto("http://127.0.0.1:5178/calendar?view=dayGridMonth&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="批量", exact=True).click()
        selected = page.get_by_text(re.compile("已选 [0-9]+ 个"))
        expect(selected).to_contain_text("已选 0 个")
        published = page.locator('.fc-daygrid-day[data-date="2026-10-16"] .fc-daygrid-event')
        expect(published).to_have_count(1)
        published.click()
        expect(selected).to_contain_text("已选 0 个")
        expect(page.get_by_role("button", name="批量删除")).to_be_disabled()

        draft = page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event')
        expect(draft).to_have_count(1)
        draft.click()
        expect(selected).to_contain_text("已选 2 个")
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(selected).to_contain_text("已选 0 个")
        assert writes == [], writes
    finally:
        browser.close()

after = api.get("http://127.0.0.1:4040/api/roster/calendar", params={"storeId": "browser-store", "from": "2026-10-01", "to": "2026-10-31"}).json()
assert after == before
print(json.dumps({"publishedSelected": 0, "draftSelected": 2, "selectionPrunedAfterWeekSwitch": True, "shiftWrites": 0, "calendarUnchanged": True}))
