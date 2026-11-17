"""Verify a Sydney repeated-hour Availability badge remains distinct and fits its Week cell."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]
evidence = Path(__file__).resolve().parent.parent / "docs" / "evidence" / "calendar-availability-fallback-2026-10-15.png"
separate_evidence = Path(__file__).resolve().parent.parent / "docs" / "evidence" / "calendar-availability-fallback-distinct-2026-10-20.png"

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code in (201, 409), (job.status_code, job.text)

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        shift_writes = []
        page.on("request", lambda request: shift_writes.append(request.url)
                if request.method in ("POST", "PATCH", "DELETE") and re.search(r"/api/roster/shifts(?:/|$)", request.url) else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        availability_url = "http://127.0.0.1:4035/api/roster/availability?storeId=browser-store&from=2026-04-05&to=2026-04-05&employeeId=browser-HandoverEmployee006"
        baseline = page.context.request.get(availability_url)
        assert baseline.status == 200
        original_rows = baseline.json()
        expected_rows = [{"id": row["id"], "version": row["version"]} for row in original_rows]
        for start, end in [
            ("2026-04-04T15:30:00.000Z", "2026-04-05T16:30:00.000Z"),
        ]:
            rejected = page.context.request.put("http://127.0.0.1:4035/api/roster/availability", data={
                "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-04-05"], "expectedRows": expected_rows,
                "entries": [{"date": "2026-04-05", "status": "AVAILABLE", "startAt": start, "endAt": end}],
            })
            assert rejected.status == 400 and rejected.json().get("validation", {}).get("code") == "INVALID_AVAILABILITY_RANGE", (rejected.status, rejected.text())
        unchanged = page.context.request.get(availability_url)
        assert unchanged.status == 200 and unchanged.json() == original_rows, (unchanged.status, unchanged.text())

        response = page.context.request.put("http://127.0.0.1:4035/api/roster/availability", data={
            "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-04-05"], "expectedRows": expected_rows,
            "entries": [{"date": "2026-04-05", "status": "AVAILABLE",
                         "startAt": "2026-04-04T14:30:00.000Z", "endAt": "2026-04-04T17:30:00.000Z"}],
        })
        assert response.status == 200, (response.status, response.text())

        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date=2026-04-05", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        board = page.get_by_role("region", name="员工行排班")
        if not board.is_visible():
            page.get_by_role("button", name="员工行").click()
        marker = board.get_by_label("HandoverEmployee006 2026-04-05 可用时间")
        expect(marker).to_contain_text("01:30 UTC+11–03:30 UTC+10", timeout=15000)
        cell = board.locator('[data-drop-target="browser-HandoverEmployee006:2026-04-05"]')
        cell_box = cell.bounding_box()
        marker_box = marker.bounding_box()
        assert cell_box and marker_box
        if marker_box["x"] + marker_box["width"] > cell_box["x"] + cell_box["width"] - 2:
            raise AssertionError(f"Repeated-hour marker overflows its day cell: {marker_box} versus {cell_box}")
        evidence.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(evidence), full_page=True)

        marker.locator("span").first.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))).to_have_attribute("aria-pressed", "true")
        dialog.get_by_role("button", name="取消").click()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        board = page.get_by_role("region", name="员工行排班")
        if not board.is_visible():
            page.get_by_role("button", name="员工行").click()
        expect(board.get_by_label("HandoverEmployee006 2026-04-05 可用时间")).to_contain_text("01:30 UTC+11–03:30 UTC+10", timeout=15000)

        saved_rows = page.context.request.get(availability_url).json()
        separate = page.context.request.put("http://127.0.0.1:4035/api/roster/availability", data={
            "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-04-05"],
            "expectedRows": [{"id": row["id"], "version": row["version"]} for row in saved_rows],
            "entries": [
                {"date": "2026-04-05", "status": "AVAILABLE", "startAt": "2026-04-04T15:15:00.000Z", "endAt": "2026-04-04T15:45:00.000Z"},
                {"date": "2026-04-05", "status": "AVAILABLE", "startAt": "2026-04-04T16:15:00.000Z", "endAt": "2026-04-04T16:45:00.000Z"},
            ],
        })
        assert separate.status == 200, (separate.status, separate.text())
        assert len(page.context.request.get(availability_url).json()) == 2
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        board = page.get_by_role("region", name="员工行排班")
        if not board.is_visible():
            page.get_by_role("button", name="员工行").click()
        separate_marker = board.get_by_label("HandoverEmployee006 2026-04-05 可用时间")
        expect(separate_marker.locator("span")).to_have_count(2, timeout=15000)
        expect(separate_marker).to_contain_text("02:15 UTC+11–02:45 UTC+11")
        expect(separate_marker).to_contain_text("02:15 UTC+10–02:45 UTC+10")
        page.screenshot(path=str(separate_evidence), full_page=True)

        board.get_by_role("button", name="为 HandoverEmployee006 在 2026-04-05 新建班次").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        times = dialog.locator('input[type="time"]')
        times.nth(0).fill("02:15")
        times.nth(1).fill("02:45")
        HandoverEmployee006 = dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))
        expect(HandoverEmployee006).to_have_attribute("aria-pressed", "true")
        expect(HandoverEmployee006).not_to_contain_text("超出可用时段")
        dialog.get_by_role("combobox", name="结束时间出现两次").click()
        page.get_by_role("option", name=re.compile(r"第二次 02:45")).click()
        expect(HandoverEmployee006).to_contain_text("超出可用时段")
        dialog.get_by_role("button", name=re.compile(r"保存班次")).click()
        expect(dialog.get_by_role("alert")).to_contain_text("没有完整的可用时间")
        dialog.get_by_role("combobox", name="开始时间出现两次").click()
        page.get_by_role("option", name=re.compile(r"第二次 02:15")).click()
        expect(HandoverEmployee006).not_to_contain_text("超出可用时段")
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        assert not shift_writes, shift_writes
        print(json.dumps({"verified": True, "over24HoursStatus": 400,
                          "label": "01:30 UTC+11–03:30 UTC+10", "markerFitsCell": True,
                          "separateFallbackRows": 2, "distinctRepeatedHourOffsets": True,
                          "dialogRejectsGap": True, "dialogAcceptsSecondWindow": True,
                          "clickedAddAndCancelled": True, "reloadPersisted": True, "shiftWrites": len(shift_writes),
                          "screenshot": str(evidence), "distinctScreenshot": str(separate_evidence)}))
    finally:
        browser.close()
