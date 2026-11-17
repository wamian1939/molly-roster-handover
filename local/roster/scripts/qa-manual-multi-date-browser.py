"""Exercise non-overwriting manual multi-date Availability in disposable browser schemas."""

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
base = "http://127.0.0.1:4035/api"
query = {"storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "from": "2026-10-26", "to": "2026-10-29"}
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
assert api.get(base + "/roster/availability", params=query).json() == []
published_query = {"storeId": "browser-store", "from": "2026-10-16", "to": "2026-10-16"}
published_before = api.get(base + "/roster/calendar", params=published_query).json()
assert published_before["shifts"]


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        writes = []
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method == "PUT" and request.url.endswith("/roster/availability") else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        card = page.locator(".staff-directory-card").filter(has_text="HandoverEmployee006")
        expect(card).to_be_visible(timeout=15000)
        card.click()
        opener = page.get_by_role("button", name="手动录入多日期")
        expect(opener).to_be_enabled(timeout=15000)

        def open_dialog():
            opener.click()
            dialog = page.get_by_role("dialog")
            expect(dialog.get_by_role("heading", name="手动录入多日期 · HandoverEmployee006")).to_be_visible()
            return dialog

        dialog = open_dialog()
        for date in ("2026-10-26", "2026-10-27"):
            button = dialog.get_by_role("button", name=date)
            expect(button).to_be_enabled(timeout=15000)
            button.click()
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        assert api.get(base + "/roster/availability", params=query).json() == []
        assert not writes

        dialog = open_dialog()
        for date in ("2026-10-26", "2026-10-27"):
            dialog.get_by_role("button", name=date).click()
        with page.expect_response(lambda response: response.url.endswith("/roster/availability")
                                  and response.request.method == "PUT") as saved:
            dialog.get_by_role("button", name="保存 2 天可用时间").click()
        assert saved.value.status == 200, saved.value.text()
        expect(dialog).to_have_count(0)
        rows = api.get(base + "/roster/availability", params=query).json()
        assert [(row["date"], row["startAt"], row["endAt"], row["source"], row["employeeId"]) for row in rows] == [
            ("2026-10-26", "2026-10-25T22:00:00.000Z", "2026-10-26T11:00:00.000Z", "MANUAL", "browser-HandoverEmployee006"),
            ("2026-10-27", "2026-10-26T22:00:00.000Z", "2026-10-27T11:00:00.000Z", "MANUAL", "browser-HandoverEmployee006"),
        ], rows

        dialog = open_dialog()
        expect(dialog.get_by_role("button", name="2026-10-26")).to_be_disabled(timeout=15000)
        date = dialog.get_by_role("button", name="2026-10-29")
        expect(date).to_be_enabled()
        date.click()
        competing = api.put(base + "/roster/availability", json={
            "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-29"],
            "expectedRows": [], "entries": [{"date": "2026-10-29", "status": "AVAILABLE",
              "startAt": "2026-10-28T23:00:00.000Z", "endAt": "2026-10-29T06:00:00.000Z", "source": "MANUAL"}],
        })
        assert competing.status_code == 200, competing.text
        with page.expect_response(lambda response: response.url.endswith("/roster/availability")
                                  and response.request.method == "PUT") as stale:
            dialog.get_by_role("button", name="保存 1 天可用时间").click()
        assert stale.value.status == 409, stale.value.text()
        expect(dialog.get_by_role("alert")).to_contain_text("其他人修改")
        expect(dialog.get_by_role("button", name="保存 1 天可用时间")).to_be_disabled()
        dialog.get_by_role("button", name="重新核对日期").click()
        expect(dialog.get_by_role("alert")).to_contain_text("已有记录", timeout=15000)
        dialog.get_by_role("button", name="取消").click()

        after = api.get(base + "/roster/availability", params=query).json()
        assert len(after) == 3 and after[:2] == rows
        assert after[2]["date"] == "2026-10-29" and after[2]["startAt"] == "2026-10-28T23:00:00.000Z"
        assert api.get(base + "/roster/calendar", params=published_query).json() == published_before
        assert len(writes) == 2 and not errors, (writes, errors)
        print(json.dumps({"verified": True, "cancelWrites": 0, "savedDates": 2,
                          "staleResponse": 409, "winnerRetained": True,
                          "publishedJsonUnchanged": True, "pageErrors": len(errors)}))
    finally:
        browser.close()
