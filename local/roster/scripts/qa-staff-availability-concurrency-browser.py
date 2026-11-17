"""Two independent Staff sessions must not overwrite a newly saved Availability row."""

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
evidence = Path(__file__).resolve().parent.parent / "docs" / "evidence" / "staff-availability-concurrency-2026-10-15.png"
url = "http://127.0.0.1:5177/staff?store=browser-store"
query = "http://127.0.0.1:4035/api/roster/availability?storeId=browser-store&from=2026-10-10&to=2026-10-10&employeeId=browser-HandoverEmployee006"


def focus_staff(page):
    expect(page.get_by_role("heading", name="员工与可用时间")).to_be_visible(timeout=15000)
    page.locator(".staff-directory-card").filter(has_text="HandoverEmployee006").click()
    page.locator('input[type="date"]').fill("2026-10-10")
    day = page.locator(".availability-day-card").nth(5)
    expect(day).to_contain_text("10/10", timeout=15000)
    expect(day.get_by_role("button", name="添加第一个时间段")).to_be_visible()
    return day


def open_staff(context):
    page = context.new_page()
    page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
    page.locator('input[autocomplete="username"]').fill(credential["username"])
    page.locator('input[autocomplete="current-password"]').fill(credential["password"])
    page.locator('button[type="submit"]').click()
    expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
    page.goto(url, wait_until="domcontentloaded")
    return page


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        first_context = browser.new_context(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        second_context = browser.new_context(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        first = open_staff(first_context)
        second = open_staff(second_context)
        existing = first.context.request.get(query).json()
        if existing:
            reset = first.context.request.put("http://127.0.0.1:4035/api/roster/availability", data={
                "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
                "expectedRows": [{"id": row["id"], "version": row["version"]} for row in existing], "entries": [],
            })
            assert reset.status == 200, (reset.status, reset.text())
            first.reload(wait_until="domcontentloaded")
            second.reload(wait_until="domcontentloaded")
        first_day = focus_staff(first)
        second_day = focus_staff(second)
        assert first.context.request.get(query).json() == []
        first_day.get_by_role("button", name="添加第一个时间段").click()
        first_save = first.get_by_role("button", name="保存可用时间", exact=True)
        first_save.click()
        expect(first.get_by_text("可用时间已保存")).to_be_visible(timeout=15000)
        winner = first.context.request.get(query).json()
        assert len(winner) == 1 and winner[0]["startAt"] == "2026-10-09T22:00:00.000Z" and winner[0]["endAt"] == "2026-10-10T06:00:00.000Z", winner

        second_day.get_by_role("button", name="添加第一个时间段").click()
        second_day.get_by_label("2026-10-10 第 1 个时段开始时间", exact=True).fill("10:00")
        second_day.get_by_label("2026-10-10 第 1 个时段结束时间", exact=True).fill("18:00")
        second_save = second.get_by_role("button", name="保存可用时间", exact=True)
        with second.expect_response(lambda response: response.url.endswith("/api/roster/availability") and response.request.method == "PUT") as stale_response:
            second_save.click()
        assert stale_response.value.status == 409, (stale_response.value.status, stale_response.value.text())
        conflict = second.locator('div.bg-amber-50[role="alert"]')
        expect(conflict).to_contain_text("其他管理员修改")
        expect(second_day.get_by_label("2026-10-10 第 1 个时段开始时间", exact=True)).to_have_value("10:00")
        expect(second_save).to_be_disabled()
        unchanged = second.context.request.get(query).json()
        assert unchanged == winner, (unchanged, winner)
        evidence.parent.mkdir(parents=True, exist_ok=True)
        conflict.screenshot(path=str(evidence))
        second.get_by_role("button", name="重新加载可用时间").click()
        expect(second_day.get_by_label("2026-10-10 第 1 个时段开始时间", exact=True)).to_have_value("09:00")
        expect(second_save).to_be_enabled()
        print(json.dumps({"verified": True, "staleStatus": 409, "winnerId": winner[0]["id"],
                          "winnerStartAt": winner[0]["startAt"], "loserDraftRetained": True,
                          "reloadFoundWinner": True, "screenshot": str(evidence)}))
    finally:
        browser.close()
