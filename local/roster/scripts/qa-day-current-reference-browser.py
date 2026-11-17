"""Capture the current five-card Day view at the measured BHS CSS viewport."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster fixture")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate fixture")
credential = evaluate["credentials"]["browser-admin"]
evidence = Path(__file__).resolve().parents[1] / "docs" / "evidence" / "molly-day-current-reference-viewport-2026-10-21.png"
narrow_evidence = evidence.parent / "molly-day-sidebar-narrow-current-2026-10-21.png"
narrow_sidebar_evidence = evidence.parent / "molly-day-sidebar-open-narrow-current-2026-10-21.png"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 3093, "height": 1670}, locale="zh-CN")
        writes = []
        errors = []
        page.on("request", lambda request: writes.append(request.url) if request.method in ("POST", "PUT", "PATCH", "DELETE")
                and "/api/roster/" in request.url else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-10",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        surface = page.locator(".calendar-surface")
        expect(surface).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(surface.locator(".fc-event:not(.fc-event-mirror)")).to_have_count(5, timeout=15000)
        page.get_by_role("button", name="查看工时侧栏").click()
        sidebar = page.get_by_role("complementary", name="已排班次侧栏")
        expect(sidebar.locator(".calendar-scheduled-employee")).to_have_count(5, timeout=15000)
        expect(sidebar.locator(".calendar-scheduled-worklog-toggle")).to_have_count(5)
        page.wait_for_timeout(450)
        initial_calendar_box = surface.bounding_box()
        assert initial_calendar_box and 0 <= initial_calendar_box["y"] <= 250, initial_calendar_box
        assert page.locator(".calendar-toolbar").get_by_text("复制").count() == 0
        page.screenshot(path=str(evidence))
        boxes = {name: element.bounding_box() for name, element in {
            "calendar": surface, "sidebar": sidebar,
            "firstCard": surface.locator(".fc-event:not(.fc-event-mirror)").first,
            "firstEmployee": sidebar.locator(".calendar-scheduled-employee").first,
        }.items()}
        page.set_viewport_size({"width": 1600, "height": 1100})
        page.get_by_role("button", name="关闭工时侧栏").click()
        page.get_by_role("button", name="查看工时侧栏").click()
        expect(sidebar).to_be_visible()
        page.wait_for_timeout(450)
        common_box = surface.bounding_box()
        assert common_box and 0 <= common_box["y"] <= 250, common_box
        blank = page.locator('.fc-timegrid-slot-lane[data-time="08:00:00"]')
        blank.scroll_into_view_if_needed()
        slot_box = blank.bounding_box()
        assert slot_box
        x = slot_box["x"] + slot_box["width"] * 0.15
        page.mouse.click(x, slot_box["y"] + 4)
        draft = page.get_by_role("dialog")
        expect(draft).to_be_visible()
        assert draft.locator('input[type="time"]').first.input_value() == "08:00"
        page.keyboard.press("Escape")
        expect(draft).to_have_count(0)
        after_cancel = blank.bounding_box()
        assert after_cancel and abs(after_cancel["y"] - slot_box["y"]) < 8, {
            "before": slot_box, "after": after_cancel,
        }

        start = blank.bounding_box()
        end = page.locator('.fc-timegrid-slot-lane[data-time="09:00:00"]').bounding_box()
        assert start and end
        x = start["x"] + start["width"] * 0.15
        page.mouse.move(x, start["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, end["y"] + end["height"] - 3, steps=12)
        mirrors = page.locator(".shift-selection-mirror").all_inner_texts()
        assert len(mirrors) == 1 and "8:00 - 9:30" in mirrors[0], mirrors
        page.mouse.up()
        expect(draft).to_be_visible()
        assert [item.input_value() for item in draft.locator('input[type="time"]').all()[:2]] == ["08:00", "09:30"]
        page.keyboard.press("Escape")
        expect(draft).to_have_count(0)

        surface.locator(".fc-event:not(.fc-event-mirror)").filter(has_text="HandoverEmployee006").first.click()
        expect(draft).to_be_visible()
        page.keyboard.press("Escape")
        expect(draft).to_have_count(0)
        page.set_viewport_size({"width": 640, "height": 800})
        expect(surface.locator(".fc-event:not(.fc-event-mirror)")).to_have_count(5)
        expect(sidebar.locator(".calendar-scheduled-employee")).to_have_count(5)
        narrow_lane = page.locator('.fc-timegrid-slot-lane[data-time="08:00:00"]')
        page.wait_for_function("document.querySelector('.fc-timegrid-slot-lane[data-time=\"08:00:00\"]')?.getBoundingClientRect().width < 600")
        narrow_lane.scroll_into_view_if_needed()
        narrow_box = narrow_lane.bounding_box()
        assert narrow_box and narrow_box["width"] > 100
        page.screenshot(path=str(narrow_evidence))
        page.mouse.click(narrow_box["x"] + narrow_box["width"] * 0.5, narrow_box["y"] + 4)
        expect(draft).to_be_visible()
        narrow_click_time = draft.locator('input[type="time"]').first.input_value()
        assert narrow_click_time == "08:00"
        page.keyboard.press("Escape")
        expect(draft).to_have_count(0)
        narrow_after_cancel = narrow_lane.bounding_box()
        assert narrow_after_cancel and abs(narrow_after_cancel["y"] - narrow_box["y"]) < 8, {
            "before": narrow_box, "after": narrow_after_cancel,
        }
        narrow_end = page.locator('.fc-timegrid-slot-lane[data-time="09:00:00"]').bounding_box()
        assert narrow_end
        narrow_x = narrow_after_cancel["x"] + narrow_after_cancel["width"] * 0.5
        page.mouse.move(narrow_x, narrow_after_cancel["y"] + 4)
        page.mouse.down()
        page.mouse.move(narrow_x, narrow_end["y"] + narrow_end["height"] - 3, steps=12)
        assert "8:00 - 9:30" in page.locator(".shift-selection-mirror").inner_text()
        page.mouse.up()
        expect(draft).to_be_visible()
        assert [item.input_value() for item in draft.locator('input[type="time"]').all()[:2]] == ["08:00", "09:30"]
        page.keyboard.press("Escape")
        expect(draft).to_have_count(0)
        surface.locator(".fc-event:not(.fc-event-mirror)").filter(has_text="HandoverEmployee006").first.click()
        expect(draft).to_be_visible()
        page.keyboard.press("Escape")
        expect(draft).to_have_count(0)
        page.get_by_role("button", name="关闭工时侧栏").click()
        page.get_by_role("button", name="查看工时侧栏").click()
        expect(sidebar).to_be_visible()
        page.wait_for_timeout(450)
        reopened_narrow_box = sidebar.bounding_box()
        assert reopened_narrow_box and 0 <= reopened_narrow_box["y"] < 600, reopened_narrow_box
        page.screenshot(path=str(narrow_sidebar_evidence))
        page.set_viewport_size({"width": 1000, "height": 900})
        page.get_by_role("button", name="关闭工时侧栏").click()
        page.get_by_role("button", name="查看工时侧栏").click()
        expect(sidebar).to_be_visible()
        page.wait_for_timeout(450)
        stacked_box = sidebar.bounding_box()
        assert stacked_box and 0 <= stacked_box["y"] < 250, stacked_box
        assert not writes and not errors, {"writes": writes, "errors": errors}
        print(json.dumps({"verified": True, "viewport": [3093, 1670], "shiftCards": 5, "employeeCards": 5,
                          "boxes": boxes, "commonViewport": [1600, 1100], "commonCalendarY": common_box["y"],
                          "sidebarOpenClick": "08:00", "cancelSlotY": [slot_box["y"], after_cancel["y"]],
                          "sidebarOpenDrag": ["08:00", "09:30"],
                          "sidebarOpenSavedCardClick": True, "narrowViewport": [640, 800],
                          "narrowCancelSlotY": [narrow_box["y"], narrow_after_cancel["y"]],
                          "narrowDrag": ["08:00", "09:30"],
                          "narrowSidebarY": reopened_narrow_box["y"], "stackedSidebarY": stacked_box["y"],
                          "rosterWrites": 0, "pageErrors": 0, "screenshot": str(evidence),
                          "narrowScreenshot": str(narrow_evidence), "narrowSidebarScreenshot": str(narrow_sidebar_evidence)}))
    finally:
        browser.close()
