"""Check that a blank time drag selects a shift interval without selecting page text."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url) if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-10", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        start = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]')
        finish = page.locator('.fc-timegrid-slot-lane[data-time="15:00:00"]')
        start.scroll_into_view_if_needed()
        first, last = start.bounding_box(), finish.bounding_box()
        column = page.locator('.fc-timegrid-col[data-date="2026-10-10"]')
        col = column.bounding_box()
        assert first and last and col
        x = col["x"] + col["width"] * 0.55
        page.mouse.move(x, first["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, last["y"] + last["height"] - 3, steps=14)
        day_mirror = page.locator(".shift-selection-mirror").all_inner_texts()
        selected_while_dragging = page.evaluate("window.getSelection()?.toString() || ''")
        page.mouse.up()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        values = [field.input_value() for field in dialog.locator('input[type="time"]').all()[:2]]
        assert values == ["14:00", "15:30"], values
        selected_after_dragging = page.evaluate("window.getSelection()?.toString() || ''")
        dialog.get_by_role("button", name="取消").click()
        assert len(day_mirror) == 1 and "14:00 - 15:30" in day_mirror[0], day_mirror
        assert selected_while_dragging == "", selected_while_dragging
        assert selected_after_dragging == "", selected_after_dragging
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        start = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]')
        finish = page.locator('.fc-timegrid-slot-lane[data-time="15:00:00"]')
        start.scroll_into_view_if_needed()
        first, last = start.bounding_box(), finish.bounding_box()
        col = page.locator('.fc-timegrid-col[data-date="2026-10-10"]').bounding_box()
        assert first and last and col
        x = col["x"] + col["width"] * 0.55
        page.mouse.move(x, first["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, last["y"] + last["height"] - 3, steps=14)
        week_mirror = page.locator(".shift-selection-mirror").all_inner_texts()
        week_selected_during_drag = page.evaluate("window.getSelection()?.toString() || ''")
        page.mouse.up()
        week_dialog = page.get_by_role("dialog")
        expect(week_dialog).to_be_visible()
        week_values = [field.input_value() for field in week_dialog.locator('input[type="time"]').all()[:2]]
        week_selected_after_drag = page.evaluate("window.getSelection()?.toString() || ''")
        assert week_values == ["14:00", "15:30"], week_values
        assert len(week_mirror) == 1 and "14:00 - 15:30" in week_mirror[0], week_mirror
        assert week_selected_during_drag == "", week_selected_during_drag
        assert week_selected_after_drag == "", week_selected_after_drag
        week_dialog.get_by_role("button", name="取消").click()
        assert not writes, writes
        print(json.dumps({"verified": True, "dayMirror": day_mirror, "weekMirror": week_mirror,
                          "dayDraftTimes": values, "weekDraftTimes": week_values,
                          "selectedDuringDayDrag": selected_while_dragging, "selectedAfterDayDrag": selected_after_dragging,
                          "selectedDuringWeekDrag": week_selected_during_drag, "selectedAfterWeekDrag": week_selected_after_drag,
                          "rosterWrites": len(writes)}, ensure_ascii=False))
    finally:
        browser.close()
