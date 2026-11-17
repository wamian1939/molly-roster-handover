"""Check that existing cards do not drag while blank time selection creates a draft."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]

api = requests.Session()
response = api.post("http://127.0.0.1:4040/api/auth/login", json=credential)
response.raise_for_status()
calendar_url = "http://127.0.0.1:4040/api/roster/calendar"
params = {"storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-09"}
before = api.get(calendar_url, params=params).json()["shifts"]
assert before, "Expected seeded shifts on 9 October"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append((request.method, request.url)) if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5178/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-day-number').click()
        expect(page.locator(".fc-timegrid-event").first).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        event = page.locator(".fc-timegrid-event").first
        box = event.bounding_box()
        assert box
        x = box["x"] + box["width"] * 0.5
        y = box["y"] + box["height"] * 0.5
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x, y + 65, steps=10)
        page.mouse.up()
        expect(page.locator(".fc-timegrid-event").first).to_be_visible()
        assert not mutations, f"Existing card drag sent mutation: {mutations}"
        assert api.get(calendar_url, params=params).json()["shifts"] == before, "Existing Shift changed"
        expect(page.get_by_role("dialog")).to_have_count(0)
        event.click()
        expect(page.get_by_role("dialog")).to_be_visible()
        page.keyboard.press("Escape")
        if page.get_by_role("dialog").count():
            page.get_by_role("dialog").get_by_role("button", name=re.compile("取消|关闭")).first.click()
        start = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]')
        finish = page.locator('.fc-timegrid-slot-lane[data-time="15:00:00"]')
        start.scroll_into_view_if_needed()
        first = start.bounding_box()
        last = finish.bounding_box()
        assert first and last
        x = first["x"] + first["width"] * 0.55
        page.mouse.move(x, first["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, last["y"] + last["height"] - 3, steps=12)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        times = dialog.locator('input[type="time"]')
        actual = [times.nth(index).input_value() for index in range(2)]
        assert actual == ["14:00", "15:30"], actual
        assert not mutations, f"Unsaved selection sent mutation: {mutations}"
        print(json.dumps({"existingCardDragMutationCount": 0, "existingCardClickOpensDialog": True,
                          "blankDragDraftTimes": actual, "databaseUnchanged": True}))
    finally:
        browser.close()
