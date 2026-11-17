"""Commit a name-first joined Time Slot Script in disposable browser fixtures."""

import json
import re
import subprocess
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
browser_credential = evaluate["credentials"]["browser-evaluator-a"]
api = requests.Session()
response = api.post("http://127.0.0.1:4035/api/auth/login", json=credential)
response.raise_for_status()
configuration = api.get("http://127.0.0.1:4035/api/roster/availability-script/shortcuts",
                        params={"storeId": "browser-store"})
configuration.raise_for_status()
assert configuration.json()["configuration"] is None
saved = api.put("http://127.0.0.1:4035/api/roster/availability-script/shortcuts", json={
    "storeId": "browser-store", "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}]})
assert saved.status_code == 200, saved.text
evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
jobs = evaluate_api.get("http://127.0.0.1:4010/api/store-jobs", params={"storeId": "browser-store"})
jobs.raise_for_status()
if not any(job.get("code") == "qa-front" for job in jobs.json()):
    created = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
        "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
    })
    assert created.status_code == 201, created.text
target_query = {"storeId": "browser-store", "from": "2026-10-26", "to": "2026-10-26"}
published_query = {"storeId": "browser-store", "from": "2026-10-16", "to": "2026-10-16"}
assert api.get("http://127.0.0.1:4035/api/roster/calendar", params=target_query).json()["shifts"] == []
published_before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query).json()


def verify(stage=None):
    command = ["npx.cmd", "tsx", "scripts/verify-script-joined-commit-browser.ts"]
    if stage:
        command.append(stage)
    result = subprocess.run(command,
                            cwd=Path(__file__).resolve().parents[1] / "backend", check=True,
                            capture_output=True, text=True)
    return json.loads(result.stdout)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        errors = []
        commits = []
        shift_writes = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: commits.append(request.url) if request.method == "POST"
                and request.url.endswith("/roster/availability-script/commit") else None)
        page.on("request", lambda request: shift_writes.append((request.method, request.url))
                if request.method in ("POST", "PUT", "PATCH", "DELETE")
                and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(browser_credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(browser_credential["password"])
        page.locator('button[type="submit"]').click()

        def preview(script, expected):
            opener = page.get_by_role("button", name="Edit Preset Time Slot Script")
            expect(opener).to_be_enabled(timeout=20000)
            opener.click()
            dialog = page.get_by_role("dialog")
            dialog.get_by_label("我已核对本门店快捷码与时间").check()
            dialog.get_by_label("Script", exact=True).fill(script)
            dialog.get_by_role("button", name="转换脚本预览").click()
            expect(dialog.get_by_text(expected)).to_be_visible(timeout=15000)
            return dialog

        dialog = preview("Berlin1AA2AA34567AA", "新增 7 · 不变 0 · 冲突 0")
        with page.expect_response(lambda response: response.url.endswith("/roster/availability-script/commit")) as commit:
            dialog.get_by_role("button", name="确认追加 7 条").click()
        assert commit.value.status == 200, commit.value.text()
        expect(dialog).to_have_count(0, timeout=15000)
        after_commit = verify()
        assert after_commit["availabilityRows"] == 7 and after_commit["importAudits"] == 1

        for equivalent in ("HandoverEmployee006\t1234567AA", "HandoverEmployee006\t1AA2AA34567AA", "HandoverEmployee006\t1AA 2AA 34567AA",
                           "HandoverEmployee006 1234567AA", "HandoverEmployee006 1AA2AA34567AA", "HandoverEmployee006 1AA 2AA 34567AA",
                           "Berlin1234567AA"):
            dialog = preview(equivalent, "新增 0 · 不变 7 · 冲突 0")
            expect(dialog.get_by_role("button", name="确认追加 0 条")).to_be_disabled()
            dialog.get_by_role("button", name="取消").click()
        page.reload()
        expect(page.get_by_role("button", name="Edit Preset Time Slot Script")).to_be_enabled(timeout=20000)
        after_reload = verify()
        assert after_reload == after_commit
        assert len(commits) == 1, commits
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-26",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        start = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]')
        finish = page.locator('.fc-timegrid-slot-lane[data-time="11:00:00"]')
        start.scroll_into_view_if_needed()
        first, last = start.bounding_box(), finish.bounding_box()
        column = page.locator('.fc-timegrid-col[data-date="2026-10-26"]').bounding_box()
        assert first and last and column
        x = column["x"] + column["width"] * 0.55
        page.mouse.move(x, first["y"] + 4)
        page.mouse.down()
        page.mouse.move(x, last["y"] + last["height"] - 3, steps=14)
        page.mouse.up()
        shift_dialog = page.get_by_role("dialog")
        expect(shift_dialog).to_be_visible()
        fields = shift_dialog.locator('input[type="time"]')
        assert [fields.nth(index).input_value() for index in range(2)] == ["10:00", "11:30"]
        job = shift_dialog.get_by_role("radio", name="QA Front")
        job.locator("..").click()
        HandoverEmployee006 = shift_dialog.get_by_role("button", name=re.compile(r"^HandoverEmployee006\b"))
        expect(HandoverEmployee006).to_be_enabled()
        HandoverEmployee006.click()
        shift_dialog.get_by_role("button", name="保存班次").click()
        expect(shift_dialog).to_have_count(0, timeout=15000)
        expect(page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")).to_be_visible()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006").click()
        edited = page.get_by_role("dialog")
        expect(edited).to_be_visible()
        expect(edited.get_by_role("textbox", name="开始时间")).to_have_value("10:00")
        expect(edited.get_by_role("textbox", name="结束时间")).to_have_value("11:30")
        edited.get_by_role("button", name="取消").click()
        assert len(shift_writes) == 1 and shift_writes[0][0] == "POST", shift_writes
        day_result = verify("after-day")
        assert api.get("http://127.0.0.1:4035/api/roster/calendar", params=published_query).json() == published_before
        assert not errors, errors
        print(json.dumps({"result": "PASS", "role": "STORE_EVALUATOR", "commits": len(commits), "database": after_reload,
                          "equivalentPreviews": 7, "dayShift": day_result["dayShift"],
                          "shiftWrites": len(shift_writes), "publishedUnchanged": True,
                          "pageErrors": len(errors)}))
    finally:
        browser.close()
