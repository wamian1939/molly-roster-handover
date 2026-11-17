"""BHS-observed Edit cancel confirmation, with an immediate Add cancel."""

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

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code == 201, job.text

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
before = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
          for shift_id in ("qa-draft-shift", "qa-draft-grouped-shift")}
period_before = api.get(base + "/roster/periods/qa-draft-period", params={"storeId": "browser-store"}).json()
published_before = api.get(base + "/roster/periods/qa-published-period/publications", params={
    "storeId": "browser-store",
}).json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append(request.url)
                if request.method not in ("GET", "OPTIONS") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5178/calendar?view=dayGridMonth&date=2026-10-09",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)

        card = page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event')
        expect(card).to_have_count(1)
        card.click()
        page.get_by_role("dialog").get_by_role("button").filter(has_text="Regular Bob").click()
        editor = page.get_by_role("dialog")
        expect(editor.get_by_role("heading", name="编辑班次")).to_be_visible()
        editor.get_by_role("textbox", name="公开备注").fill("Unsaved edit note")
        editor.get_by_role("button", name="取消").click()
        confirm = page.get_by_role("alertdialog")
        expect(confirm.get_by_role("heading", name="放弃未保存的修改？")).to_be_visible()
        expect(editor.get_by_role("textbox", name="公开备注", include_hidden=True)).to_have_value("Unsaved edit note")
        confirm.get_by_role("button", name="继续编辑").click()
        expect(confirm).to_have_count(0)
        expect(editor.get_by_role("textbox", name="公开备注")).to_have_value("Unsaved edit note")
        page.keyboard.press("Escape")
        confirm = page.get_by_role("alertdialog")
        expect(confirm).to_be_visible()
        confirm.get_by_role("button", name="放弃修改").click()
        expect(page.get_by_role("dialog")).to_have_count(0)

        card.click()
        page.get_by_role("dialog").get_by_role("button").filter(has_text="Regular Bob").click()
        editor = page.get_by_role("dialog")
        editor.get_by_role("textbox", name="公开备注").fill("Unsaved copy note")
        editor.get_by_role("button", name="其他班次操作").click()
        editor.get_by_role("button", name="复制班次").click()
        confirm = page.get_by_role("alertdialog")
        expect(confirm).to_contain_text("已保存的班次内容")
        confirm.get_by_role("button", name="继续编辑").click()
        expect(editor.get_by_role("textbox", name="公开备注")).to_have_value("Unsaved copy note")
        editor.get_by_role("button", name="其他班次操作").click()
        editor.get_by_role("button", name="复制班次").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改并复制").click()
        copy = page.get_by_role("dialog")
        expect(copy.get_by_role("heading", name="复制班次")).to_be_visible()
        expect(copy.get_by_role("textbox", name="公开备注")).to_have_value("")
        copy.get_by_role("button", name="取消").click()
        expect(page.get_by_role("dialog")).to_have_count(0)

        card.click()
        page.get_by_role("dialog").get_by_role("button").filter(has_text="Regular Bob").click()
        editor = page.get_by_role("dialog")
        editor.get_by_role("textbox", name="公开备注").fill("Unsaved repeat note")
        editor.get_by_role("button", name="其他班次操作").click()
        editor.get_by_role("button", name="重复班次").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改并重复").click()
        repeat = page.get_by_role("dialog")
        expect(repeat.get_by_role("heading", name="重复班次")).to_be_visible()
        repeat.get_by_role("button", name="取消").click()
        expect(page.get_by_role("dialog")).to_have_count(0)

        page.get_by_role("button", name="新增班次").click()
        add = page.get_by_role("dialog")
        expect(add.get_by_role("heading", name="新增班次")).to_be_visible()
        add.get_by_role("button", name="取消").click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        expect(page.get_by_role("alertdialog")).to_have_count(0)
        assert mutations == [], mutations
        after = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                 for shift_id in before}
        assert after == before
        assert api.get(base + "/roster/periods/qa-draft-period", params={
            "storeId": "browser-store",
        }).json() == period_before
        assert api.get(base + "/roster/periods/qa-published-period/publications", params={
            "storeId": "browser-store",
        }).json() == published_before
        print(json.dumps({"verified": True, "editCancelConfirmed": True, "escapeConfirmed": True,
                          "dirtyCopyAndRepeatConfirmed": True, "addCancelImmediate": True, "rosterMutations": 0,
                          "shiftAndPublicationSnapshotsUnchanged": True}))
    finally:
        browser.close()
