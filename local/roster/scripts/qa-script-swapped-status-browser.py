"""A stale script review must reject a swapped per-day CREATE/UNCHANGED state."""

import json
import re
import subprocess
import tempfile
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
backend = Path(__file__).resolve().parents[1] / "backend"
today = datetime.now(ZoneInfo("Australia/Sydney")).date()
monday = today + timedelta(days=7 - today.weekday())
tuesday = monday + timedelta(days=1)


def clock(date, hour):
    return datetime.combine(date, time(hour), ZoneInfo("Australia/Sydney")).astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def verify(stage):
    result = subprocess.run(["npx.cmd", "tsx", "scripts/verify-script-swapped-status-browser.ts", stage],
                            cwd=backend, check=True, text=True, capture_output=True)
    return json.loads(result.stdout)


api = requests.Session()
base = "http://127.0.0.1:4035/api"
api.post(base + "/auth/login", json=credential).raise_for_status()
saved = api.put(base + "/roster/availability-script/shortcuts", json={"storeId": "browser-store",
    "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}]})
assert saved.status_code == 200, saved.text


def replace(date, expected_rows, entries):
    response = api.put(base + "/roster/availability", json={"storeId": "browser-store",
        "employeeId": "browser-HandoverEmployee006", "dates": [date.isoformat()], "expectedRows": expected_rows,
        "entries": entries})
    assert response.status_code == 200, response.text
    return response.json()


def available(date):
    return {"date": date.isoformat(), "status": "AVAILABLE", "startAt": clock(date, 10),
            "endAt": clock(date, 22)}


tuesday_rows = replace(tuesday, [], [available(tuesday)])
assert len(tuesday_rows) == 1, tuesday_rows

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        opener = page.get_by_role("button", name="Edit Preset Time Slot Script")
        expect(opener).to_be_enabled(timeout=15000)
        opener.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_label("Script", exact=True).fill("HandoverEmployee006\t1AA 2AA")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 1 · 不变 1 · 冲突 0")).to_be_visible(timeout=15000)
        assert dialog.get_by_role("button", name="确认追加 1 条").is_enabled()

        replace(monday, [], [available(monday)])
        replace(tuesday, [{"id": tuesday_rows[0]["id"], "version": tuesday_rows[0]["version"]}], [])
        with page.expect_response(lambda response: response.url.endswith("/roster/availability-script/commit")) as stale:
            dialog.get_by_role("button", name="确认追加 1 条").click()
        assert stale.value.status == 409, (stale.value.status, stale.value.text())
        expect(dialog.get_by_text("预览的具体新增与不变时段已变化，请重新预览")).to_be_visible(timeout=15000)
        expect(dialog.get_by_role("button", name="确认追加 0 条")).to_be_disabled()
        stale_state = verify("stale")

        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 1 · 不变 1 · 冲突 0")).to_be_visible(timeout=15000)
        with page.expect_response(lambda response: response.url.endswith("/roster/availability-script/commit")) as accepted:
            dialog.get_by_role("button", name="确认追加 1 条").click()
        assert accepted.value.status == 200, (accepted.value.status, accepted.value.text())
        expect(dialog).to_have_count(0, timeout=15000)
        after = verify("after")
        page.goto(f"http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date={monday.isoformat()}",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        expect(board.get_by_label(f"HandoverEmployee006 {monday.isoformat()} 可用时间")).to_contain_text("可用 10:00–22:00")
        expect(board.get_by_label(f"HandoverEmployee006 {tuesday.isoformat()} 可用时间")).to_contain_text("可用 10:00–22:00")
        print(json.dumps({"verified": True, "staleStatus": 409, "staleState": stale_state,
                          "acceptedStatus": 200, "after": after, "calendarVisible": True}))
    finally:
        browser.close()
