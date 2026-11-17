"""Check small pointer movement still clicks, while a saved Shift drag stays inert."""

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
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
queries = [
    {"storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-09"},
    {"storeId": "browser-store", "from": "2026-10-16", "to": "2026-10-16"},
]
before = []
for query in queries:
    response = api.get("http://127.0.0.1:4035/api/roster/calendar", params=query)
    response.raise_for_status()
    before.append(response.json())


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 2109, "height": 1139}, locale="zh-CN")
        writes = []
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridWeek&date=2026-10-09",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)

        results = []
        for view, label in (("Week", "周视图"), ("Day", "日视图")):
            page.get_by_role("button", name=label).click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            for jitter in (1, 3, 5):
                slot = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]')
                slot.scroll_into_view_if_needed()
                box = slot.bounding_box()
                column = page.locator('.fc-timegrid-col[data-date="2026-10-09"]').bounding_box()
                assert box and column
                x = column["x"] + column["width"] * 0.5
                y = box["y"] + box["height"] * 0.5
                page.mouse.move(x, y)
                page.mouse.down()
                page.mouse.move(x + jitter, y + 1)
                page.mouse.up()
                dialog = page.get_by_role("dialog")
                expect(dialog).to_be_visible(timeout=3000)
                clocks = dialog.locator('input[type="time"]')
                values = [clocks.nth(index).input_value() for index in range(2)]
                assert values == ["14:00", "14:30"], (view, jitter, values)
                dialog.get_by_role("button", name="取消").click()
                expect(dialog).to_have_count(0)
                results.append((view, jitter, "blank click"))

            # Releasing a blank-grid drag outside the calendar cancels the draft.
            slot = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]')
            slot.scroll_into_view_if_needed()
            box = slot.bounding_box()
            column = page.locator('.fc-timegrid-col[data-date="2026-10-09"]').bounding_box()
            assert box and column
            x = column["x"] + column["width"] * 0.5
            page.mouse.move(x, box["y"] + box["height"] * 0.5)
            page.mouse.down()
            page.mouse.move(x, 5)
            page.mouse.up()
            page.wait_for_timeout(150)
            expect(page.get_by_role("dialog")).to_have_count(0)
            results.append((view, "outside", "blank drag cancel"))

            card = page.locator('.fc-timegrid-event').first
            expect(card).to_be_visible()
            card.scroll_into_view_if_needed()
            box = card.bounding_box()
            assert box
            x = box["x"] + box["width"] * 0.5
            y = box["y"] + box["height"] * 0.5
            for jitter in (1, 3, 5):
                page.mouse.move(x, y)
                page.mouse.down()
                page.mouse.move(x + jitter, y + 1)
                page.mouse.up()
                dialog = page.get_by_role("dialog")
                expect(dialog).to_be_visible(timeout=3000)
                if dialog.get_by_role("button", name="关闭班次选择").count():
                    assert "选择要编辑的班次" in dialog.inner_text(), (view, jitter, dialog.inner_text())
                    dialog.get_by_role("button", name="关闭班次选择").click()
                else:
                    assert dialog.get_by_role("button", name="删除班次").count(), (view, jitter, dialog.inner_text())
                    dialog.get_by_role("button", name="取消").click()
                expect(dialog).to_have_count(0)
                results.append((view, jitter, "saved click"))

        assert not writes, writes
        after = []
        for query in queries:
            response = api.get("http://127.0.0.1:4035/api/roster/calendar", params=query)
            response.raise_for_status()
            after.append(response.json())
        assert after == before, "Draft or published Calendar changed after pointer gestures"
        assert not errors, errors
        print(json.dumps({"verified": True, "jitterCases": results, "rosterWrites": len(writes),
                          "draftAndPublishedJsonUnchanged": True, "pageErrors": len(errors)}))
    finally:
        browser.close()
