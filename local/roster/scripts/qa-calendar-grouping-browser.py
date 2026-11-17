"""Read-only browser acceptance for three parallel groups and mixed breaks."""

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
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
if job.status_code != 201:
    existing_jobs = evaluate_api.get("http://127.0.0.1:4010/api/store-jobs", params={"storeId": "browser-store"})
    existing_jobs.raise_for_status()
    assert any(item.get("code") == "qa-front" for item in existing_jobs.json()), job.status_code

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
base = "http://127.0.0.1:4035/api"
settings = api.get(base + "/roster/settings", params={"storeId": "browser-store"})
settings.raise_for_status()
if settings.json()["settings"] is None:
    saved_settings = api.put(base + "/roster/settings/browser-store", json={
        "storeId": "browser-store", "timezone": "Australia/Sydney",
        "openingTime": "09:00", "closingTime": "22:00", "slotIntervalMinutes": 30,
        "minimumShiftMinutes": 60, "defaultBreakMinutes": 0, "weekStartsOn": 1,
        "cycleType": "WEEK", "weeklyHourWarning": 40, "dailyHourWarning": 10,
    })
    saved_settings.raise_for_status()
else:
    assert settings.json()["settings"]["timezone"] == "Australia/Sydney"
shift_ids = ("qa-draft-shift", "qa-draft-grouped-shift", "qa-grouping-early", "qa-grouping-later")
before = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
          for shift_id in shift_ids}
assert [before[item]["breakMinutes"] for item in shift_ids] == [0, 30, 0, 0]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        errors = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/api/roster/" in request.url else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        surface = page.locator(".calendar-surface")
        expect(surface).to_have_attribute("aria-busy", "false", timeout=15000)
        cards = surface.locator(".fc-timegrid-event:not(.fc-event-mirror)")
        if cards.count() == 0:
            print(json.dumps({"url": page.url, "surface": surface.inner_text()[:900],
                              "allEvents": surface.locator(".fc-event").count(),
                              "dayColumns": surface.locator(".fc-timegrid-col").count()}))
        expect(cards).to_have_count(3)
        mixed = cards.filter(has_text="Training Alice")
        expect(mixed).to_have_count(1)
        expect(mixed).to_contain_text("Regular Bob")
        expect(mixed).to_contain_text("休息时长不同")
        expect(cards.filter(has_text="HandoverEmployee006")).to_have_count(1)
        expect(cards.filter(has_text="Cindy")).to_have_count(1)
        geometry = cards.evaluate_all("""cards => cards.map(card => {
          const harness = card.closest('.fc-timegrid-event-harness');
          const column = card.closest('.fc-timegrid-col[data-date]');
          const left = harness.getBoundingClientRect().left;
          const right = harness.getBoundingClientRect().right;
          return {left, right, ratio: (right-left) / column.getBoundingClientRect().width};
        })""")
        assert len({round(item["left"]) for item in geometry}) == 3, geometry
        assert all(0.25 < item["ratio"] < 0.42 for item in geometry), geometry
        mixed.click()
        chooser = page.get_by_role("dialog")
        expect(chooser.get_by_role("heading", name="选择要编辑的班次")).to_be_visible()
        expect(chooser.get_by_role("button").filter(has_text="Training Alice")).to_contain_text("休息 30 分钟")
        chooser.get_by_role("button").filter(has_text="Training Alice").click()
        editor = page.get_by_role("dialog")
        expect(editor.get_by_role("heading", name="编辑班次")).to_be_visible()
        expect(editor).to_contain_text("30 分钟")
        page.keyboard.press("Escape")
        expect(editor).to_have_count(0)
        assert not writes, writes
        assert not errors, errors
        after = {shift_id: api.get(base + "/roster/shifts/" + shift_id,
                                 params={"storeId": "browser-store"}).json() for shift_id in shift_ids}
        assert after == before
        print(json.dumps({"verified": True, "visualGroups": 3, "sourceShifts": 4,
                          "mixedCardNames": 2, "sourceBreakMinutes": [0, 30],
                          "chooserPreservedBreak": True, "rosterWrites": 0,
                          "shiftSnapshotsUnchanged": True}))
    finally:
        browser.close()
