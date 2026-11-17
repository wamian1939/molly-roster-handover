"""Compare draft current role names with frozen published Shift display in Chromium."""

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

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "Official QA Front", "code": "qa-front", "colorToken": "teal", "displayOrder": 1,
})
assert job.status_code in (201, 409), job.text

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
published_url = base + "/roster/shifts/qa-published-shift"
draft_url = base + "/roster/shifts/qa-draft-shift"
published_before = api.get(published_url, params={"storeId": "browser-store"}).json()
draft_before = api.get(draft_url, params={"storeId": "browser-store"}).json()
assert published_before["roleNameSnapshot"] == draft_before["roleNameSnapshot"] == "QA Front"

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

        page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        published_card = page.locator(".fc-timegrid-event").filter(has_text="Regular Bob")
        expect(published_card).to_contain_text("QA Front", timeout=15000)
        expect(published_card).not_to_contain_text("Official QA Front")
        published_card.click()
        expect(page.get_by_role("dialog")).to_contain_text("QA Front")
        page.get_by_role("button", name="关闭班次详情").click()

        page.goto("http://127.0.0.1:5178/calendar?view=timeGridWeek&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行", exact=True).click()
        published_row = page.locator('[aria-label="员工行排班"]').get_by_role("button", name=re.compile("Regular Bob.*2026-10-16"))
        expect(published_row).to_contain_text("QA Front", timeout=15000)
        expect(published_row).not_to_contain_text("Official QA Front")

        page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").first).to_contain_text("Official QA Front", timeout=15000)
        assert writes == [], writes
    finally:
        browser.close()

assert api.get(published_url, params={"storeId": "browser-store"}).json() == published_before
assert api.get(draft_url, params={"storeId": "browser-store"}).json() == draft_before
print(json.dumps({"publishedCardRole": "QA Front", "publishedEmployeeRowRole": "QA Front", "draftCardRole": "Official QA Front", "shiftWrites": 0, "shiftsUnchanged": True}))
