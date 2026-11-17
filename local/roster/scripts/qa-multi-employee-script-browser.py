"""Exercise bulk script preview/cancel, commit, and mixed-validity rejection."""

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
credential = evaluate["credentials"]["browser-admin"]
backend = Path(__file__).resolve().parents[1] / "backend"
today = datetime.now(ZoneInfo("Australia/Sydney")).date()
next_monday = (today + timedelta(days=7 - today.weekday())).isoformat()


def verify(stage: str):
    completed = subprocess.run(["npx.cmd", "tsx", "scripts/verify-multi-employee-script-browser.ts", stage],
                           cwd=backend, check=True, text=True, capture_output=True)
    return json.loads(completed.stdout)


api = requests.Session()
base = "http://127.0.0.1:4035/api"
api.post(base + "/auth/login", json=credential).raise_for_status()
configuration = api.get(base + "/roster/availability-script/shortcuts", params={"storeId": "browser-store"})
configuration.raise_for_status()
assert configuration.json()["configuration"] is None
saved = api.put(base + "/roster/availability-script/shortcuts", json={"storeId": "browser-store",
    "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}]})
assert saved.status_code == 200, saved.text
assert verify("before")["availabilityRows"] == 0

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        writes = []
        shift_writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/availability-script/" in request.url else None)
        page.on("request", lambda request: shift_writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()

        def open_dialog():
            button = page.get_by_role("button", name="Edit Preset Time Slot Script")
            expect(button).to_be_enabled(timeout=15000)
            button.click()
            dialog = page.get_by_role("dialog")
            expect(dialog).to_be_visible()
            dialog.get_by_label("我已核对本门店快捷码与时间").check()
            return dialog

        def preview(dialog, script):
            dialog.get_by_label("Script", exact=True).fill(script)
            dialog.get_by_role("button", name="转换脚本预览").click()

        dialog = open_dialog()
        preview(dialog, "HandoverEmployee006\t1AA\nCindy\t2AA")
        expect(dialog.get_by_text("新增 2 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        assert verify("before")["importAudits"] == 0

        dialog = open_dialog()
        preview(dialog, "HandoverEmployee006\t1AA\nCindy\t2AA")
        expect(dialog.get_by_text("新增 2 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="确认追加 2 条").click()
        expect(dialog).to_have_count(0, timeout=15000)
        committed = verify("after")
        page.reload()

        dialog = open_dialog()
        preview(dialog, "HandoverEmployee006\t3AA\nCindy\t4ZZ")
        expect(dialog.get_by_text("未定义快捷码：ZZ")).to_be_visible(timeout=15000)
        expect(dialog.get_by_text("新增 1 · 不变 0 · 冲突 0")).to_be_visible()
        expect(dialog.get_by_role("button", name="确认追加 1 条")).to_be_disabled()
        dialog.get_by_role("button", name="取消").click()
        assert verify("after")["importAudits"] == 1

        page.goto(f"http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date={next_monday}",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        expect(board.get_by_label(f"HandoverEmployee006 {next_monday} 可用时间")).to_contain_text("可用 10:00–22:00")

        page.goto(f"http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date={next_monday}",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]').click(position={"x": 200, "y": 4})
        dialog = page.get_by_role("dialog")
        HandoverEmployee006 = dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006 "))
        expect(HandoverEmployee006).to_be_enabled(timeout=15000)
        dialog.get_by_role("button", name="取消").click()
        page.locator('.fc-timegrid-slot-lane[data-time="09:00:00"]').click(position={"x": 200, "y": 4})
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006 "))).to_be_disabled(timeout=15000)
        dialog.get_by_role("button", name="取消").click()
        assert not shift_writes, shift_writes
        assert verify("after")["importAudits"] == 1

        stale_payload = {"storeId": "browser-store", "week": "NEXT", "script": "Cindy\t3AA"}
        revision_before = api.get(base + "/workforce/stores/browser-store/employees")
        revision_before.raise_for_status()
        pending = api.post(base + "/roster/availability-script/preview", json=stale_payload)
        pending.raise_for_status()
        assert pending.json()["canCommit"] and pending.json()["summary"]["create"] == 1, pending.text
        evaluate_api = requests.Session()
        evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
        renamed = evaluate_api.put("http://127.0.0.1:4010/api/employees/browser-HandoverEmployee006",
                                   json={"displayName": "HandoverEmployee006 Revised"})
        assert renamed.status_code == 200, (renamed.status_code, renamed.text)
        revision_after = api.get(base + "/workforce/stores/browser-store/employees")
        revision_after.raise_for_status()
        assert revision_before.json()["workforceRevision"] != revision_after.json()["workforceRevision"]
        stale_commit = api.post(base + "/roster/availability-script/commit",
                                json={**stale_payload, "previewHash": pending.json()["previewHash"],
                                      "expectedSlotStatusHash": pending.json()["slotStatusHash"],
                                      "expectedCreateCount": pending.json()["summary"]["create"],
                                      "expectedUnchangedCount": pending.json()["summary"]["unchanged"]})
        assert stale_commit.status_code == 409, (stale_commit.status_code, stale_commit.text)
        assert verify("after")["importAudits"] == 1

        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        dialog = open_dialog()
        preview(dialog, "Cindy\t3AA")
        expect(dialog.get_by_text("新增 1 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        changed_shortcuts = api.put(base + "/roster/availability-script/shortcuts",
                                    json={"storeId": "browser-store", "version": saved.json()["version"],
                                          "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"},
                                                        {"code": "BB", "startTime": "09:00", "endTime": "12:00"}]})
        assert changed_shortcuts.status_code == 200, (changed_shortcuts.status_code, changed_shortcuts.text)
        dialog.get_by_role("button", name="确认追加 1 条").click()
        expect(dialog.get_by_text("脚本、员工、目标周或门店配置已变化，请重新预览")).to_be_visible(timeout=15000)
        expect(dialog.get_by_role("button", name="确认追加 0 条")).to_be_disabled()
        assert verify("after-shortcuts-change")["importAudits"] == 1
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("门店快捷码已变化，请核对当前时间并重新预览")).to_be_visible(timeout=15000)
        expect(dialog.get_by_label("我已核对本门店快捷码与时间")).not_to_be_checked()
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 1 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="取消").click()
        assert verify("after-shortcuts-change")["importAudits"] == 1

        dialog = open_dialog()
        preview(dialog, "Cindy\t3AA")
        expect(dialog.get_by_text("新增 1 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        concurrent_preview = api.post(base + "/roster/availability-script/preview", json=stale_payload)
        concurrent_preview.raise_for_status()
        assert concurrent_preview.json()["canCommit"] and concurrent_preview.json()["summary"]["create"] == 1
        slot = concurrent_preview.json()["slots"][0]
        manual = api.put(base + "/roster/availability", json={"storeId": "browser-store",
            "employeeId": slot["employeeId"], "dates": [slot["date"]], "expectedRows": [],
            "entries": [{"date": slot["date"], "status": "AVAILABLE",
                         "startAt": slot["startAt"], "endAt": slot["endAt"]}]})
        assert manual.status_code == 200, (manual.status_code, manual.text)
        dialog.get_by_role("button", name="确认追加 1 条").click()
        expect(dialog.get_by_text("预览后的可用时间记录已变化，请重新预览")).to_be_visible(timeout=15000)
        expect(dialog.get_by_label("Script", exact=True)).to_have_value("Cindy\t3AA")
        expect(dialog.get_by_role("button", name="确认追加 0 条")).to_be_disabled()
        dialog.get_by_role("button", name="取消").click()
        assert len(manual.json()) == 1
        restored = api.put(base + "/roster/availability", json={"storeId": "browser-store",
            "employeeId": slot["employeeId"], "dates": [slot["date"]],
            "expectedRows": [{"id": manual.json()[0]["id"], "version": manual.json()[0]["version"]}],
            "entries": []})
        assert restored.status_code == 200, (restored.status_code, restored.text)
        assert verify("after-shortcuts-change")["importAudits"] == 1

        assert len([url for method, url in writes if method == "POST" and url.endswith("/preview")]) == 6, writes
        assert len([url for method, url in writes if method == "POST" and url.endswith("/commit")]) == 3, writes
        print(json.dumps({"verified": True, "cancelNoWrite": True, "created": 2,
                          "partialErrorBlocked": True, "weekAvailabilityBadge": True,
                          "staleWorkforceRevisionRejected": True,
                          "staleShortcutVersionRejected": True, "shortcutReconfirmation": True,
                          "changedPreviewCountRejected": True,
                          "dayPickerInsideOutside": True, "shiftWrites": len(shift_writes), "database": committed,
                          "browserScriptRequests": len(writes)}, ensure_ascii=False))
    finally:
        browser.close()
