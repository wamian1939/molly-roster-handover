"""Exercise a cross-month Availability conflict in disposable browser schemas."""

import json
import re
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster QA schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate QA schema")
credential = evaluate["credentials"]["browser-admin"]
api = "http://127.0.0.1:4035/api/roster/availability"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        reads = []
        writes = []

        def capture(request):
            if "/api/roster/availability?" in request.url and request.method == "GET":
                query = parse_qs(urlparse(request.url).query)
                if query.get("employeeId") == ["browser-HandoverEmployee006"]:
                    reads.append((query.get("from", [""])[0], query.get("to", [""])[0]))
            if request.url.endswith("/api/roster/availability") and request.method == "PUT":
                writes.append(request.post_data_json)

        page.on("request", capture)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("link", name="员工与可用时间")).to_be_visible()
        page.get_by_role("link", name="员工与可用时间").click()
        page.get_by_role("button", name=re.compile("^HandoverEmployee006")).click()
        page.get_by_role("button", name="手动录入多日期").click()
        dialog = page.get_by_role("dialog")
        october = dialog.get_by_role("button", name="2026-10-15")
        expect(october).to_be_enabled()
        october.click()
        dialog.get_by_role("button", name="下一个月").click()
        november = dialog.get_by_role("button", name="2026-11-09")
        expect(november).to_be_enabled()
        november.click()
        save = dialog.get_by_role("button", name="保存 2 天可用时间")
        expect(save).to_be_enabled()

        concurrent = page.request.put(api, data={
            "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006",
            "dates": ["2026-10-15"], "expectedRows": [],
            "entries": [{"date": "2026-10-15", "status": "AVAILABLE",
                         "startAt": "2026-10-14T22:00:00.000Z",
                         "endAt": "2026-10-15T06:00:00.000Z", "source": "MANUAL"}],
        })
        if concurrent.status != 200:
            raise AssertionError(f"Concurrent disposable Availability write returned HTTP {concurrent.status}")

        with page.expect_response(lambda response: response.request.method == "PUT"
                                  and response.url.endswith("/api/roster/availability")) as conflict_info:
            save.click()
        if conflict_info.value.status != 409:
            raise AssertionError(f"Batch write returned HTTP {conflict_info.value.status}, expected 409")
        expect(dialog.get_by_role("alert")).to_contain_text("已被其他人修改")
        expect(save).to_be_disabled()
        dialog.get_by_role("button", name="下一个月").click()
        expect(dialog.get_by_role("button", name="2026-12-09")).to_be_enabled()
        expect(save).to_be_disabled()
        dialog.get_by_role("button", name="上一个月").click()
        dialog.get_by_role("button", name="重新核对日期").click()
        expect(dialog.get_by_role("alert")).to_contain_text("已有记录")
        expect(save).to_be_disabled()
        if ("2026-10-15", "2026-10-15") not in reads:
            raise AssertionError("Retry did not re-read the selected October date")
        if len(writes) != 1 or writes[0]["dates"] != ["2026-10-15", "2026-11-09"]:
            raise AssertionError("Batch attempted an unexpected Availability mutation")
        rows = page.request.get(f"{api}?storeId=browser-store&from=2026-10-15&to=2026-11-09&employeeId=browser-HandoverEmployee006")
        if rows.status != 200 or [row["date"] for row in rows.json()] != ["2026-10-15"]:
            raise AssertionError("Conflict unexpectedly changed the selected dates")
        print(json.dumps({"verified": True, "conflictStatus": 409, "retriedOctober": True,
                          "batchWrites": len(writes), "savedDates": ["2026-10-15"]}))
    finally:
        browser.close()
