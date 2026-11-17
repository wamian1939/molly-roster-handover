"""Verify Adelaide spring and fall Day pointer times in disposable paired stores."""

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
store_id = "browser-other-store"

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
current_response = api.get("http://127.0.0.1:4035/api/roster/settings", params={"storeId": store_id})
current_response.raise_for_status()
current = current_response.json().get("settings")
payload = {
    "storeId": store_id, "timezone": "Australia/Adelaide", "openingTime": "00:00",
    "closingTime": "23:59", "slotIntervalMinutes": 30, "minimumShiftMinutes": 30,
    "defaultBreakMinutes": 0, "weekStartsOn": 1, "cycleType": "WEEK",
    "fortnightAnchorDate": None, "weeklyHourWarning": 38, "dailyHourWarning": 10,
}
if current:
    payload["version"] = current["version"]
configured = api.put(f"http://127.0.0.1:4035/api/roster/settings/{store_id}", json=payload)
assert configured.status_code == 200, configured.text
assert (configured.json().get("settings") or configured.json())["timezone"] == "Australia/Adelaide"


def click_slot(page, date, clock):
    lane = page.locator(f'.fc-timegrid-slot-lane[data-time="{clock}:00"]')
    lane.scroll_into_view_if_needed()
    row, column = lane.bounding_box(), page.locator(f'.fc-timegrid-col[data-date="{date}"]').bounding_box()
    assert row and column
    page.mouse.click(column["x"] + column["width"] * 0.6, row["y"] + row["height"] * 0.5)


def drag_slots(page, date, first_clock, last_clock):
    first = page.locator(f'.fc-timegrid-slot-lane[data-time="{first_clock}:00"]')
    last = page.locator(f'.fc-timegrid-slot-lane[data-time="{last_clock}:00"]')
    first.scroll_into_view_if_needed()
    first_box, last_box = first.bounding_box(), last.bounding_box()
    column = page.locator(f'.fc-timegrid-col[data-date="{date}"]').bounding_box()
    assert first_box and last_box and column
    x = column["x"] + column["width"] * 0.6
    page.mouse.move(x, first_box["y"] + 4)
    page.mouse.down()
    page.mouse.move(x, last_box["y"] + last_box["height"] - 3, steps=12)
    page.mouse.up()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        results = {}
        for date, clock, expected in [
            ("2026-10-04", "02:30", None),
            ("2026-10-04", "14:00", ["14:00", "14:30"]),
            ("2026-04-05", "02:30", ["02:30", "02:30"]),
        ]:
            page.goto(f"http://127.0.0.1:5177/calendar?store={store_id}&view=timeGridDay&date={date}", wait_until="domcontentloaded")
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            expect(page.get_by_role("combobox", name="门店")).to_contain_text("Other Store")
            click_slot(page, date, clock)
            dialog = page.get_by_role("dialog")
            if expected is None:
                expect(dialog).to_have_count(0)
                results[f"{date} {clock}"] = None
            else:
                expect(dialog).to_be_visible()
                times = [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)]
                assert times == expected, (date, clock, times)
                results[f"{date} {clock}"] = times
                if date == "2026-04-05":
                    summary = dialog.locator(".bg-graphite-50").first.inner_text()
                    assert "实际经过 1 小时" in summary and "UTC+10:30" in summary and "UTC+09:30" in summary, summary
                dialog.get_by_role("button", name="取消").click()
        for date, first_clock, last_clock, expected in [
            ("2026-10-04", "14:00", "14:30", ["14:00", "15:00"]),
            ("2026-04-05", "02:00", "03:00", ["02:00", "03:30"]),
        ]:
            page.goto(f"http://127.0.0.1:5177/calendar?store={store_id}&view=timeGridDay&date={date}", wait_until="domcontentloaded")
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            drag_slots(page, date, first_clock, last_clock)
            dialog = page.get_by_role("dialog")
            expect(dialog).to_be_visible()
            times = [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)]
            assert times == expected, (date, times)
            if date == "2026-04-05":
                summary = dialog.locator(".bg-graphite-50").first.inner_text()
                assert "实际经过 2 小时 30 分钟" in summary and "UTC+10:30" in summary and "UTC+09:30" in summary
            results[f"{date} drag"] = times
            dialog.get_by_role("button", name="取消").click()
        assert not writes, writes
        print(json.dumps({"verified": True, "timezone": "Australia/Adelaide", "clicks": results, "rosterWrites": 0}, ensure_ascii=False))
    finally:
        browser.close()
