"""Probe one-move blank drags and saved-card drags without scheduling writes."""

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
draft_query = {"storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-09"}
published_query = {"storeId": "browser-store", "from": "2026-10-16", "to": "2026-10-16"}
draft_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=draft_query).json()
published_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query).json()
assert draft_before["shifts"] and published_before["shifts"]


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 2109, "height": 1139}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridWeek&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        toolbar = page.locator(".calendar-toolbar")
        assert toolbar.get_by_role("button", name="上一页").count() == 1
        assert toolbar.get_by_role("button", name="今天").count() == 1
        assert toolbar.get_by_role("button", name="下一页").count() == 1
        assert toolbar.get_by_role("button", name=re.compile("复制|批量|刷新|新增")).count() == 0
        assert page.locator(".calendar-footer-actions").get_by_role("button", name="排班操作").count() == 1
        results = []
        for view, label in (("Week", "周视图"), ("Day", "日视图")):
            page.get_by_role("button", name=label).click()
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            for attempt in range(6):
                start = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]')
                end = page.locator('.fc-timegrid-slot-lane[data-time="15:00:00"]')
                start.scroll_into_view_if_needed()
                first, last = start.bounding_box(), end.bounding_box()
                column = page.locator('.fc-timegrid-col[data-date="2026-10-09"]').bounding_box()
                assert first and last and column
                x = column["x"] + column["width"] * (0.35, 0.55, 0.7)[attempt % 3]
                page.mouse.move(x, first["y"] + 4)
                page.mouse.down()
                page.mouse.move(x, last["y"] + last["height"] - 3)
                page.mouse.up()
                dialog = page.get_by_role("dialog")
                expect(dialog).to_be_visible(timeout=5000)
                fields = dialog.locator('input[type="time"]')
                clocks = [fields.nth(index).input_value() for index in range(2)]
                assert clocks == ["14:00", "15:30"], (view, attempt, clocks)
                dialog.get_by_role("button", name="取消").click()
                expect(dialog).to_have_count(0)
                results.append((view, clocks))

            card = page.locator('.fc-timegrid-event').first
            expect(card).to_be_visible()
            bounds = card.bounding_box()
            assert bounds
            x = bounds["x"] + bounds["width"] / 2
            y = bounds["y"] + bounds["height"] / 2
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x + 90, y + 45)
            page.mouse.up()
            page.wait_for_timeout(850)
            expect(page.get_by_role("dialog")).to_have_count(0)
        assert not writes, writes
        assert api.get("http://127.0.0.1:4035/api/roster/calendar", params=draft_query).json() == draft_before
        assert api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query).json() == published_before
        print(json.dumps({"verified": True, "fastBlankGestures": len(results),
                          "savedCardDrags": 2, "rosterWrites": len(writes),
                          "draftAndPublishedJsonUnchanged": True,
                          "primaryToolbarHasCopyOrBatch": False}))
    finally:
        browser.close()
