"""Copy a day in Chromium and prove copied draft snapshots use current Evaluate employees."""

import json
import re
import sys
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
verify_only = "--verify-only" in sys.argv
if not verify_only:
    evaluate_api = requests.Session()
    evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
    job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
        "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
    })
    assert job.status_code == 201, job.text

base = "http://127.0.0.1:4035/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
query = {"storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10"}
source_ids = ("qa-draft-shift", "qa-draft-grouped-shift")
before_source = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                 for shift_id in source_ids}
assert [before_source[shift_id]["assignments"][0]["employeeNameSnapshot"] for shift_id in source_ids] == ["Regular Bob", "Training Alice"]
before_target = api.get(base + "/roster/calendar", params=query).json()
assert len(before_target["shifts"]) == (2 if verify_only else 0), before_target
published_url = base + "/roster/periods/qa-published-period/publications"
before_published = api.get(published_url, params={"storeId": "browser-store"}).json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/calendar?view=dayGridMonth&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        if not verify_only:
            page.get_by_role("button", name="复制一天").click()
            dialog = page.get_by_role("dialog")
            dialog.get_by_label("来源日期").fill("2026-10-09")
            dialog.get_by_label("目标日期").fill("2026-10-10")
            with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day/preview")) as preview_response:
                dialog.get_by_role("button", name="检查冲突").click()
            preview = preview_response.value.json()
            assert preview_response.value.status == 200 and preview["canCopy"] and preview["shiftCount"] == 2, preview
            with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day")) as copy_response:
                dialog.get_by_role("button", name="复制为草稿").click()
            assert copy_response.value.status == 201, copy_response.value.text()
            expect(dialog).to_have_count(0)
        page.goto("http://127.0.0.1:5177/calendar?view=dayGridMonth&date=2026-10-10", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        card = page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-event')
        expect(card).to_have_count(1)
        expect(card).to_contain_text("Current Alice")
        expect(card).to_contain_text("+1")
        card.click()
        chooser = page.get_by_role("dialog")
        expect(chooser.get_by_role("button").filter(has_text="Current Alice")).to_have_count(1)
        expect(chooser.get_by_role("button").filter(has_text="Current Bob")).to_have_count(1)
    finally:
        browser.close()

after_target = api.get(base + "/roster/calendar", params=query).json()
assert len(after_target["shifts"]) == 2, after_target
names = sorted(assignment["employeeNameSnapshot"] for shift in after_target["shifts"] for assignment in shift["assignments"])
assert names == ["Current Alice", "Current Bob"], names
after_source = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                for shift_id in source_ids}
assert after_source == before_source
assert api.get(published_url, params={"storeId": "browser-store"}).json() == before_published
print(json.dumps({"verified": True, "mode": "verify-only" if verify_only else "copy-and-verify", "copiedShifts": 2,
                  "currentNames": names, "sourceUnchanged": True, "publicationUnchanged": True}))
