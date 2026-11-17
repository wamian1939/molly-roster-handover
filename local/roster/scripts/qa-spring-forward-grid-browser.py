"""Inspect Sydney spring-forward time-grid labels and click semantics without saving."""

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
        page = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-04", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        clocks = ["01:30:00", "02:00:00", "02:30:00", "03:00:00"]
        slots = {clock: page.locator(f'.fc-timegrid-slot-lane[data-time="{clock}"]').count() for clock in clocks}
        selected = {}
        for clock in ["02:00:00", "02:30:00", "14:00:00", "15:00:00"]:
            target = page.locator(f'.fc-timegrid-slot-lane[data-time="{clock}"]')
            if not target.count():
                continue
            target.scroll_into_view_if_needed()
            slot = target.bounding_box()
            column = page.locator('.fc-timegrid-col[data-date="2026-10-04"]').bounding_box()
            assert slot and column
            page.mouse.click(column["x"] + column["width"] * 0.6, slot["y"] + slot["height"] * 0.5)
            dialog = page.get_by_role("dialog")
            if clock in ["14:00:00", "15:00:00"]:
                expect(dialog).to_be_visible(timeout=5000)
            else:
                page.wait_for_timeout(150)
            if dialog.count():
                selected[clock] = [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)]
                dialog.get_by_role("button", name="取消").click()
            else:
                selected[clock] = None
        assert selected == {"02:00:00": None, "02:30:00": None,
                            "14:00:00": ["14:00", "14:30"], "15:00:00": ["15:00", "15:30"]}, selected
        assert page.get_by_text("该时间不能用于排班").count() > 0
        invalid_start = page.locator('.fc-timegrid-slot-lane[data-time="02:00:00"]')
        invalid_end = page.locator('.fc-timegrid-slot-lane[data-time="02:30:00"]')
        invalid_start.scroll_into_view_if_needed()
        invalid_first, invalid_last = invalid_start.bounding_box(), invalid_end.bounding_box()
        invalid_column = page.locator('.fc-timegrid-col[data-date="2026-10-04"]').bounding_box()
        assert invalid_first and invalid_last and invalid_column
        invalid_x = invalid_column["x"] + invalid_column["width"] * 0.6
        page.mouse.move(invalid_x, invalid_first["y"] + 4)
        page.mouse.down()
        page.mouse.move(invalid_x, invalid_last["y"] + invalid_last["height"] - 3, steps=8)
        page.mouse.up()
        expect(page.get_by_role("dialog")).to_have_count(0)
        first = page.locator('.fc-timegrid-slot-lane[data-time="16:00:00"]')
        last = page.locator('.fc-timegrid-slot-lane[data-time="16:30:00"]')
        first.scroll_into_view_if_needed()
        first_box, last_box = first.bounding_box(), last.bounding_box()
        column = page.locator('.fc-timegrid-col[data-date="2026-10-04"]').bounding_box()
        assert first_box and last_box and column
        x = column["x"] + column["width"] * 0.6
        page.mouse.move(x, first_box["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, last_box["y"] + last_box["height"] - 3, steps=8)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        assert [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)] == ["16:00", "17:00"]
        dialog.get_by_role("button", name="取消").click()
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-timegrid-col[data-date="2026-10-04"]').scroll_into_view_if_needed()
        week_slot = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]')
        week_slot.scroll_into_view_if_needed()
        week_lane, week_column = week_slot.bounding_box(), page.locator('.fc-timegrid-col[data-date="2026-10-04"]').bounding_box()
        assert week_lane and week_column
        page.mouse.click(week_column["x"] + week_column["width"] * 0.6, week_lane["y"] + week_lane["height"] * 0.5)
        dialog = page.get_by_role("dialog")
        if not dialog.count():
            print(json.dumps({"weekPoint": [week_column["x"] + week_column["width"] * 0.6, week_lane["y"] + week_lane["height"] * 0.5],
                              "weekFeedback": page.locator('[role="status"], [role="alert"]').all_text_contents()}, ensure_ascii=False))
        expect(dialog).to_be_visible()
        assert [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)] == ["14:00", "14:30"]
        dialog.get_by_role("button", name="取消").click()
        week_start = page.locator('.fc-timegrid-slot-lane[data-time="16:00:00"]')
        week_end = page.locator('.fc-timegrid-slot-lane[data-time="16:30:00"]')
        week_start.scroll_into_view_if_needed()
        week_first, week_last = week_start.bounding_box(), week_end.bounding_box()
        week_column = page.locator('.fc-timegrid-col[data-date="2026-10-04"]').bounding_box()
        assert week_first and week_last and week_column
        week_x = week_column["x"] + week_column["width"] * 0.6
        page.mouse.move(week_x, week_first["y"] + 4)
        page.mouse.down()
        page.mouse.move(week_x, week_last["y"] + week_last["height"] - 3, steps=10)
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        assert [dialog.locator('input[type="time"]').nth(index).input_value() for index in range(2)] == ["16:00", "17:00"]
        dialog.get_by_role("button", name="取消").click()
        page.get_by_role("button", name="新增班次").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        assert dialog.locator('input[type="time"]').count() >= 2
        dialog.get_by_role("button", name="取消").click()
        assert not writes, writes
        print(json.dumps({"date": "2026-10-04", "timezone": "Australia/Sydney",
                          "slotCounts": slots, "clickedPrefill": selected, "rosterWrites": 0}))
    finally:
        browser.close()
