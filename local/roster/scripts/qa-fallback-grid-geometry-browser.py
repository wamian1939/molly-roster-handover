"""Inspect fall-back card placement and drag prefill in disposable Chromium."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-04-05", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        slot = page.locator('.fc-timegrid-slot-lane[data-time="02:30:00"]')
        slot.scroll_into_view_if_needed()
        lane_box = slot.bounding_box()
        card = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(card).to_be_visible()
        card_box = card.bounding_box()
        assert lane_box and card_box
        result = {"savedCardTopMinus0230Lane": round(card_box["y"] - lane_box["y"], 1),
                  "savedCardHeight": round(card_box["height"], 1), "slotHeight": round(lane_box["height"], 1)}
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-timegrid-col[data-date="2026-04-05"]').scroll_into_view_if_needed()
        week_slot = page.locator('.fc-timegrid-slot-lane[data-time="02:30:00"]')
        week_slot.scroll_into_view_if_needed()
        week_card = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(week_card).to_be_visible()
        week_lane_box, week_card_box = week_slot.bounding_box(), week_card.bounding_box()
        assert week_lane_box and week_card_box
        result["weekSavedCardTopMinus0230Lane"] = round(week_card_box["y"] - week_lane_box["y"], 1)
        result["weekSavedCardHeight"] = round(week_card_box["height"], 1)
        week_card.click()
        week_detail = page.get_by_role("dialog")
        expect(week_detail).to_be_visible()
        result["weekEditTimes"] = [week_detail.locator('input[type="time"]').nth(index).input_value() for index in range(2)]
        expect(week_detail.get_by_role("combobox", name="开始时间出现两次")).to_contain_text("第一次")
        expect(week_detail.get_by_role("combobox", name="结束时间出现两次")).to_contain_text("第二次")
        week_detail.get_by_role("button", name="取消").click()

        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2027-04-04", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        first = page.locator('.fc-timegrid-slot-lane[data-time="02:00:00"]')
        last = page.locator('.fc-timegrid-slot-lane[data-time="03:00:00"]')
        first.scroll_into_view_if_needed()
        first_box, last_box = first.bounding_box(), last.bounding_box()
        column_box = page.locator('.fc-timegrid-col[data-date="2027-04-04"]').bounding_box()
        assert first_box and last_box and column_box
        x = column_box["x"] + column_box["width"] * 0.6
        page.mouse.move(x, first_box["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, last_box["y"] + last_box["height"] - 3, steps=12)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        result["dragTimes"] = [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)]
        result["durationSummary"] = dialog.locator(".bg-graphite-50").first.inner_text()
        dialog.get_by_role("button", name="取消").click()
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-timegrid-col[data-date="2027-04-04"]').scroll_into_view_if_needed()
        first = page.locator('.fc-timegrid-slot-lane[data-time="02:00:00"]')
        last = page.locator('.fc-timegrid-slot-lane[data-time="03:00:00"]')
        first.scroll_into_view_if_needed()
        first_box, last_box = first.bounding_box(), last.bounding_box()
        column_box = page.locator('.fc-timegrid-col[data-date="2027-04-04"]').bounding_box()
        assert first_box and last_box and column_box
        x = column_box["x"] + column_box["width"] * 0.6
        page.mouse.move(x, first_box["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, last_box["y"] + last_box["height"] - 3, steps=12)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        result["weekDragTimes"] = [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)]
        dialog.get_by_role("button", name="取消").click()
        first_box, last_box = first.bounding_box(), last.bounding_box()
        column_box = page.locator('.fc-timegrid-col[data-date="2027-04-04"]').bounding_box()
        assert first_box and last_box and column_box
        x = column_box["x"] + column_box["width"] * 0.6
        page.mouse.move(x, last_box["y"] + last_box["height"] - 3)
        page.mouse.down()
        page.mouse.move(x, first_box["y"] + 4, steps=12)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        result["upwardWeekDragTimes"] = [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)]
        dialog.get_by_role("button", name="取消").click()
        assert not writes, writes
        result["rosterWrites"] = 0
        assert result["savedCardTopMinus0230Lane"] == 0
        assert result["weekSavedCardTopMinus0230Lane"] == 0
        assert result["weekEditTimes"] == ["02:30", "02:30"]
        assert result["dragTimes"] == result["weekDragTimes"] == result["upwardWeekDragTimes"] == ["02:00", "03:30"]
        print(json.dumps(result, ensure_ascii=False))
    finally:
        browser.close()
