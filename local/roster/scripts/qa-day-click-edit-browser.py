"""Click a saved Day Shift, edit its start only, reload and verify disposable PostgreSQL."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


workspace = Path(__file__).resolve().parents[1]
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
assert job.status_code == 201, job.text

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
availability = api.put("http://127.0.0.1:4035/api/roster/availability", json={
    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
    "expectedRows": [], "entries": [{"date": "2026-10-10", "status": "AVAILABLE",
                                  "startAt": "2026-10-09T21:00:00.000Z", "endAt": "2026-10-10T12:00:00.000Z"}],
})
assert availability.status_code in (200, 201), availability.text
source = api.get("http://127.0.0.1:4035/api/roster/shifts/qa-bhs-day-long", params={"storeId": "browser-store"})
source.raise_for_status()
assert source.json()["version"] == 1
published_query = {"storeId": "browser-store", "from": "2026-10-16", "to": "2026-10-16"}
published_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query)
published_before.raise_for_status()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        errors = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/api/roster/shifts" in request.url else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-10",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        surface = page.locator(".calendar-surface")
        expect(surface).to_have_attribute("aria-busy", "false", timeout=15000)
        card = surface.locator(".fc-event:not(.fc-event-mirror)").filter(has_text="HandoverEmployee006")
        expect(card).to_have_count(1)
        card.click()
        editor = page.get_by_role("dialog")
        expect(editor.get_by_role("heading", name="编辑班次")).to_be_visible()
        clocks = editor.locator('input[type="time"]')
        assert [clocks.nth(index).input_value() for index in range(2)] == ["10:00", "22:00"]
        clocks.first.fill("11:00")
        expect(editor.get_by_role("button", name=re.compile("保存班次"))).to_be_enabled(timeout=15000)
        editor.get_by_role("button", name=re.compile("保存班次")).click()
        expect(editor).to_have_count(0, timeout=15000)
        expect(card).to_contain_text("11:00", timeout=15000)
        page.reload(wait_until="domcontentloaded")
        expect(surface).to_have_attribute("aria-busy", "false", timeout=15000)
        card = surface.locator(".fc-event:not(.fc-event-mirror)").filter(has_text="HandoverEmployee006")
        expect(card).to_contain_text("11:00", timeout=15000)
        card.click()
        editor = page.get_by_role("dialog")
        expect(editor.get_by_role("heading", name="编辑班次")).to_be_visible()
        clocks = editor.locator('input[type="time"]')
        assert [clocks.nth(index).input_value() for index in range(2)] == ["11:00", "22:00"]
        page.keyboard.press("Escape")
        expect(editor).to_have_count(0)
        assert len(writes) == 1 and writes[0][0] in ("PATCH", "PUT"), writes
        assert not errors, errors

        second_credential = evaluate["credentials"]["browser-evaluator-b"]
        page_b = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        second_writes = []
        page_b.on("request", lambda request: second_writes.append((request.method, request.url))
                  if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/api/roster/shifts" in request.url else None)
        page_b.on("pageerror", lambda error: errors.append(str(error)))
        page_b.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-10",
                    wait_until="domcontentloaded")
        page_b.locator('input[autocomplete="username"]').fill(second_credential["username"])
        page_b.locator('input[autocomplete="current-password"]').fill(second_credential["password"])
        page_b.locator('button[type="submit"]').click()
        second_surface = page_b.locator(".calendar-surface")
        expect(second_surface).to_have_attribute("aria-busy", "false", timeout=15000)
        second_surface.locator(".fc-event:not(.fc-event-mirror)").filter(has_text="HandoverEmployee006").click()
        editor_b = page_b.get_by_role("dialog")
        expect(editor_b.get_by_role("heading", name="编辑班次")).to_be_visible()
        assert editor_b.locator('input[type="time"]').first.input_value() == "11:00"
        editor_b.locator('input[type="time"]').first.fill("13:00")

        card.click()
        editor_a = page.get_by_role("dialog")
        expect(editor_a.get_by_role("heading", name="编辑班次")).to_be_visible()
        editor_a.locator('input[type="time"]').first.fill("12:00")
        with page.expect_response(lambda response: response.request.method == "PATCH"
                                  and "/api/roster/shifts/qa-bhs-day-long" in response.url) as winner_response:
            editor_a.get_by_role("button", name=re.compile("保存班次")).click()
        assert winner_response.value.status == 200
        expect(editor_a).to_have_count(0)
        with page_b.expect_response(lambda response: response.request.method == "PATCH"
                                    and "/api/roster/shifts/qa-bhs-day-long" in response.url) as stale_response:
            editor_b.get_by_role("button", name=re.compile("保存班次")).click()
        assert stale_response.value.status == 409
        expect(editor_b).to_be_visible()
        assert editor_b.locator('input[type="time"]').first.input_value() == "13:00"
        expect(editor_b.get_by_text("班次已被其他人修改或删除", exact=False)).to_be_visible()
        page_b.reload(wait_until="domcontentloaded")
        expect(second_surface).to_have_attribute("aria-busy", "false", timeout=15000)
        second_surface.locator(".fc-event:not(.fc-event-mirror)").filter(has_text="HandoverEmployee006").click()
        editor_b = page_b.get_by_role("dialog")
        assert [editor_b.locator('input[type="time"]').nth(index).input_value() for index in range(2)] == ["12:00", "22:00"]
        page_b.keyboard.press("Escape")
        expect(editor_b).to_have_count(0)
        assert len(writes) == 2 and len(second_writes) == 1, {"first": writes, "second": second_writes}
        assert not errors, errors

        published_after = api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query)
        published_after.raise_for_status()
        assert published_after.json() == published_before.json()
        verify = subprocess.run(["npx.cmd", "tsx", "scripts/verify-day-click-edit-browser.ts"],
                                cwd=workspace / "backend", check=True, text=True, capture_output=True)
        print(json.dumps({"verified": True, "dayEdit": ["10:00–22:00", "11:00–22:00", "12:00–22:00"],
                          "successfulShiftWrites": len(writes), "staleShiftStatus": 409,
                          "staleInputPreserved": "13:00", "savedAndReloaded": True,
                          "publishedCalendarUnchanged": True, "database": json.loads(verify.stdout)}))
    finally:
        browser.close()
