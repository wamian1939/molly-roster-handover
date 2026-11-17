"""Exercise scoped script import as a generated store evaluator in disposable databases."""

import json
import re
import subprocess
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
admin = evaluate["credentials"]["browser-admin"]
evaluator = evaluate["credentials"]["browser-evaluator-a"]
base = "http://127.0.0.1:4035/api"
backend = Path(__file__).resolve().parents[1] / "backend"
today = datetime.now(ZoneInfo("Australia/Sydney")).date()
next_monday = (today + timedelta(days=7 - today.weekday())).isoformat()


def verify(stage):
    completed = subprocess.run(["npx.cmd", "tsx", "scripts/verify-multi-employee-script-browser.ts", stage],
                               cwd=backend, check=True, text=True, capture_output=True)
    return json.loads(completed.stdout)


admin_api = requests.Session()
admin_api.post(base + "/auth/login", json=admin).raise_for_status()
configuration = admin_api.get(base + "/roster/availability-script/shortcuts", params={"storeId": "browser-store"})
configuration.raise_for_status()
assert configuration.json()["configuration"] is None
saved = admin_api.put(base + "/roster/availability-script/shortcuts", json={"storeId": "browser-store",
    "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}]})
assert saved.status_code == 200, saved.text
assert verify("before")["availabilityRows"] == 0

evaluator_api = requests.Session()
evaluator_api.post(base + "/auth/login", json=evaluator).raise_for_status()
assert evaluator_api.get(base + "/roster/availability-script/shortcuts",
                         params={"storeId": "browser-other-store"}).status_code == 403
assert evaluator_api.post(base + "/roster/availability-script/preview", json={
    "storeId": "browser-other-store", "week": "NEXT", "script": "HandoverEmployee006\t1AA",
}).status_code == 403

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/availability-script/" in request.url else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(evaluator["username"])
        page.locator('input[autocomplete="current-password"]').fill(evaluator["password"])
        page.locator('button[type="submit"]').click()

        def preview():
            trigger = page.get_by_role("button", name="Edit Preset Time Slot Script")
            expect(trigger).to_be_enabled(timeout=15000)
            trigger.click()
            dialog = page.get_by_role("dialog")
            dialog.get_by_label("我已核对本门店快捷码与时间").check()
            dialog.get_by_label("Script", exact=True).fill("HandoverEmployee006\t1AA\nCindy\t2AA")
            dialog.get_by_role("button", name="转换脚本预览").click()
            expect(dialog.get_by_text("新增 2 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
            return dialog

        dialog = preview()
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        assert verify("before")["importAudits"] == 0

        dialog = preview()
        with page.expect_response(lambda response: response.url.endswith("/roster/availability-script/commit")) as commit:
            dialog.get_by_role("button", name="确认追加 2 条").click()
        assert commit.value.status == 200, commit.value.text()
        expect(dialog).to_have_count(0, timeout=15000)
        assert [method for method, url in writes if url.endswith("/preview")] == ["POST", "POST"], writes
        assert [method for method, url in writes if url.endswith("/commit")] == ["POST"], writes
        result = verify("after")

        page.goto(f"http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date={next_monday}",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        expect(board.get_by_label(f"HandoverEmployee006 {next_monday} 可用时间")).to_contain_text("可用 10:00–22:00")
        print(json.dumps({"verified": True, "role": "STORE_EVALUATOR", "otherStoreStatuses": [403, 403],
                          "previewCancelWrites": 0, "commits": 1, "availabilityRows": result["availabilityRows"],
                          "importAudits": result["importAudits"], "canonicalEmployeeIds": result["canonicalEmployeeIds"],
                          "calendarAvailabilityVisible": True}))
    finally:
        browser.close()
