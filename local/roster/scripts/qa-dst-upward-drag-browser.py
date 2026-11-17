"""Check Day upward selection on Sydney clock-change dates without saving."""

import json
import re
import sys
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
save_fallback = "--save-fallback" in sys.argv
week = "--week" in sys.argv
if save_fallback and week:
    raise ValueError("The Week gesture run is read-only; save the Day case separately")
if save_fallback:
    evaluate_api = requests.Session()
    evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
    job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
        "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
    })
    assert job.status_code in (201, 409), job.text
    roster_api = requests.Session()
    roster_api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
    availability = roster_api.get("http://127.0.0.1:4035/api/roster/availability", params={
        "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "from": "2026-04-05", "to": "2026-04-05",
    }).json()
    assert availability == [], availability
    allowed = roster_api.put("http://127.0.0.1:4035/api/roster/availability", json={
        "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-04-05"],
        "expectedRows": [], "entries": [{"date": "2026-04-05", "status": "AVAILABLE",
                                    "startAt": "2026-04-04T14:00:00.000Z", "endAt": "2026-04-04T18:00:00.000Z"}],
    })
    assert allowed.status_code in (200, 201), allowed.text

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append(request.url)
                if request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        observations = []
        for date, first_clock, last_clock, expected in [
            ("2026-04-05", "03:30:00", "02:00:00", ["02:00", "03:30"]),
            ("2026-10-04", "04:00:00", "03:30:00", ["03:30", "04:00"]),
        ]:
            view = "timeGridWeek" if week else "timeGridDay"
            page.goto(f"http://127.0.0.1:5177/calendar?store=browser-store&view={view}&date={date}", wait_until="domcontentloaded")
            expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            first = page.locator(f'.fc-timegrid-slot-lane[data-time="{first_clock}"]')
            last = page.locator(f'.fc-timegrid-slot-lane[data-time="{last_clock}"]')
            first.scroll_into_view_if_needed()
            first_box, last_box = first.bounding_box(), last.bounding_box()
            column = page.locator(f'.fc-timegrid-col[data-date="{date}"]').bounding_box()
            assert first_box and last_box and column
            x = column["x"] + column["width"] * 0.55
            page.mouse.move(x, first_box["y"] + 4)
            page.mouse.down()
            page.mouse.move(x, last_box["y"] + last_box["height"] - 3, steps=15)
            mirror = page.locator(".shift-selection-mirror").all_inner_texts()
            mirror_box = page.locator(".fc-event-mirror").bounding_box()
            mirror_class = page.locator(".fc-event-mirror").get_attribute("class")
            page.mouse.up()
            dialog = page.get_by_role("dialog")
            expect(dialog).to_be_visible(timeout=4000)
            fields = dialog.locator('input[type="time"]')
            actual = [fields.nth(i).input_value() for i in range(2)]
            observations.append({"date": date, "mirror": mirror, "mirrorClass": mirror_class,
                                 "mirrorHeight": mirror_box["height"] if mirror_box else None,
                                 "slotHeight": last_box["height"], "actual": actual, "expected": expected})
            if actual != expected:
                raise AssertionError(json.dumps(observations, ensure_ascii=False))
            if not mirror or not all(clock in mirror[0] for clock in expected) or "upward-selection-mirror" not in (mirror_class or ""):
                raise AssertionError(json.dumps(observations, ensure_ascii=False))
            if date == "2026-04-05" and save_fallback:
                job_choice = dialog.get_by_role("radio", name="QA Front")
                job_choice.locator("..").click()
                HandoverEmployee006 = dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))
                expect(HandoverEmployee006).to_be_enabled()
                HandoverEmployee006.click()
                dialog.locator("textarea").first.fill("DST upward QA")
                dialog.locator("footer button").last.click()
                expect(dialog).to_have_count(0, timeout=10000)
                page.reload(wait_until="domcontentloaded")
                expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
                event = page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")
                expect(event).to_be_visible()
                event.click()
                edit = page.get_by_role("dialog")
                expect(edit.locator('input[type="time"]').nth(0)).to_have_value("02:00")
                expect(edit.locator('input[type="time"]').nth(1)).to_have_value("03:30")
                edit.get_by_role("button", name="取消").click()
            else:
                dialog.get_by_role("button", name="取消").click()
            expect(page.get_by_role("dialog")).to_have_count(0)
            if week and date == "2026-04-05":
                other = page.locator('.fc-timegrid-col[data-date="2026-04-04"]').bounding_box()
                assert other
                first.scroll_into_view_if_needed()
                first_box, last_box = first.bounding_box(), last.bounding_box()
                assert first_box and last_box
                page.mouse.move(x, first_box["y"] + 4)
                page.mouse.down()
                page.mouse.move(other["x"] + other["width"] * 0.5,
                                last_box["y"] + last_box["height"] - 3, steps=18)
                page.mouse.up()
                expect(page.get_by_role("dialog")).to_have_count(0)
        assert len(writes) == (1 if save_fallback else 0), writes
        print(json.dumps({"passed": True, "observations": observations, "shiftWrites": len(writes),
                          "savedFallback": save_fallback, "view": "Week" if week else "Day",
                          "crossDateBlocked": week}, ensure_ascii=False))
    finally:
        browser.close()
