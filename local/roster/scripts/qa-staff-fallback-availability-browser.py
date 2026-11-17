"""Verify Staff can save and reload distinct Sydney fallback clock occurrences."""

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
evidence = Path(__file__).resolve().parent.parent / "docs" / "evidence" / "staff-fallback-occurrence-2026-10-15.png"
api = "http://127.0.0.1:4035/api/roster/availability"
start_at = "2026-04-04T15:30:00.000Z"
end_at = "2026-04-04T16:30:00.000Z"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        before_reset = page.context.request.get(f"{api}?storeId=browser-store&from=2026-04-05&to=2026-04-05&employeeId=browser-HandoverEmployee006").json()
        reset = page.context.request.put(api, data={"storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-04-05"], "expectedRows": [{"id": row["id"], "version": row["version"]} for row in before_reset], "entries": []})
        assert reset.status == 200, (reset.status, reset.text())
        page.goto("http://127.0.0.1:5177/staff?store=browser-store", wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="员工与可用时间")).to_be_visible(timeout=15000)
        page.locator(".staff-directory-card").filter(has_text="HandoverEmployee006").click()
        page.locator('input[type="date"]').fill("2026-04-05")
        day = page.locator(".availability-day-card").last
        expect(day).to_be_visible(timeout=15000)
        day.get_by_role("button", name="添加第一个时间段").click()
        start = day.get_by_label("2026-04-05 第 1 个时段开始时间", exact=True)
        end = day.get_by_label("2026-04-05 第 1 个时段结束时间", exact=True)
        start.fill("02:30")
        end.fill("02:30")
        end_occurrence = day.get_by_role("combobox", name="2026-04-05 第 1 个时段结束时间次数")
        expect(end_occurrence).to_contain_text("第一次 02:30 UTC+11")
        end_occurrence.click()
        page.get_by_role("option", name="第二次 02:30 UTC+10").click()
        expect(end_occurrence).to_contain_text("第二次 02:30 UTC+10")
        save = page.get_by_role("button", name="保存可用时间", exact=True)
        expect(save).to_be_enabled()
        save.click()
        expect(page.get_by_text("可用时间已保存")).to_be_visible(timeout=15000)
        query = f"{api}?storeId=browser-store&from=2026-04-05&to=2026-04-05&employeeId=browser-HandoverEmployee006"
        rows = page.context.request.get(query).json()
        assert len(rows) == 1 and rows[0]["startAt"] == start_at and rows[0]["endAt"] == end_at, rows
        page.reload(wait_until="domcontentloaded")
        page.locator('input[type="date"]').fill("2026-04-05")
        expect(day).to_be_visible(timeout=15000)
        expect(day.get_by_label("2026-04-05 第 1 个时段开始时间", exact=True)).to_have_value("02:30")
        expect(day.get_by_label("2026-04-05 第 1 个时段结束时间", exact=True)).to_have_value("02:30")
        expect(day.get_by_role("combobox", name="2026-04-05 第 1 个时段结束时间次数")).to_contain_text("第二次 02:30 UTC+10")
        day.scroll_into_view_if_needed()
        evidence.parent.mkdir(parents=True, exist_ok=True)
        day.screenshot(path=str(evidence))
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PUT") and "/api/roster/availability" in request.url else None)
        page.get_by_role("textbox", name="将当前多时段配置保存为模板").fill("DST specific")
        page.get_by_role("button", name="保存为模板").click()
        expect(page.get_by_text("无法保存为模板")).to_be_visible()
        day.get_by_role("checkbox").check()
        expect(day.get_by_role("alert")).to_contain_text("24 小时")
        expect(page.get_by_role("button", name="保存可用时间", exact=True)).to_be_disabled()
        assert not writes, writes
        unchanged = page.context.request.get(query).json()
        assert unchanged == rows, (unchanged, rows)
        print(json.dumps({"verified": True, "startAt": rows[0]["startAt"], "endAt": rows[0]["endAt"],
                          "reloadPreservedOccurrence": True, "blockedNonportableTemplate": True,
                          "blocked25HourDraft": True, "rejectedActionWrites": len(writes), "screenshot": str(evidence)}))
    finally:
        browser.close()
