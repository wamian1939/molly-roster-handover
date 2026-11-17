"""Check that Settings exposes legacy draft-role usage without changing schedules."""

import json
import os
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
assert job.status_code in (201, 409), job.text

base = os.environ.get("MOLLY_QA_API_BASE", "http://127.0.0.1:4040/api")
frontend = os.environ.get("MOLLY_QA_FRONTEND_BASE", "http://127.0.0.1:5178")
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
usage_response = api.get(base + "/roster/roles/draft-usage", params={"storeId": "browser-store"})
usage_response.raise_for_status()
usage = usage_response.json()
legacy = next(item for item in usage if item["nameZh"] == "验收岗")
assert legacy["shiftCount"] == 2 and legacy["firstDate"] == "2026-10-09", usage
before_shifts = [api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                 for shift_id in ("qa-draft-shift", "qa-draft-grouped-shift")]
before_period = api.get(base + "/roster/periods/qa-draft-period", params={"storeId": "browser-store"}).json()
before_publication = api.get(base + "/roster/periods/qa-published-period/publications", params={"storeId": "browser-store"}).json()
publish = api.post(base + "/roster/periods/qa-draft-period/publish", json={
    "storeId": "browser-store", "version": before_period["version"],
})
assert publish.status_code == 422 and publish.json().get("validation", {}).get("code") == "UNVERIFIED_SHIFT_ROLE", publish.text

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto(frontend + "/settings", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        panel = page.get_by_role("region", name="待核对的历史草稿岗位")
        expect(panel).to_be_visible(timeout=15000)
        expect(panel).to_contain_text("验收岗")
        expect(panel).to_contain_text("2 个草稿班次")
        formal = page.locator('[aria-label="Evaluate 正式岗位清单"]')
        expect(formal).to_contain_text("QA Front")
        expect(formal).not_to_contain_text("验收岗")
        panel.get_by_role("link", name="查看 验收岗 最早的草稿班次").click()
        expect(page).to_have_url(re.compile(r"/calendar\?store=browser-store&view=timeGridWeek&date=2026-10-09"))
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".calendar-surface")).to_contain_text("旧岗位：验收岗")
        page.goto(frontend + "/calendar?store=browser-store&view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        legacy_card = page.locator(".fc-timegrid-event").filter(has_text="旧岗位：验收岗").first
        expect(legacy_card).to_be_visible()
        legacy_card.click()
        if page.get_by_role("heading", name="编辑班次").count() == 0:
            page.get_by_role("button", name=re.compile("Regular Bob")).click()
        editor = page.get_by_role("dialog")
        expect(editor.get_by_role("heading", name="编辑班次")).to_be_visible()
        expect(editor.get_by_text(re.compile("旧岗位已不在 Evaluate 正式清单中"))).to_be_visible()
        expect(editor.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_disabled()
        expect(editor.get_by_role("radio", name="QA Front")).to_be_visible()
        editor.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        assert not mutations, mutations
        after_shifts = [api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                        for shift_id in ("qa-draft-shift", "qa-draft-grouped-shift")]
        after_period = api.get(base + "/roster/periods/qa-draft-period", params={"storeId": "browser-store"}).json()
        after_publication = api.get(base + "/roster/periods/qa-published-period/publications", params={"storeId": "browser-store"}).json()
        assert after_shifts == before_shifts
        assert after_period == before_period
        assert after_publication == before_publication
        print(json.dumps({"verified": True, "legacyDraftShifts": 2, "formalCatalogExcludesLegacy": True,
                          "calendarLinkWorked": True, "editorBlocksUnrepairedRole": True,
                          "publishBlockedUnverifiedRole": True, "rosterMutationRequests": 0,
                          "shiftPeriodAndPublicationUnchanged": True}))
    finally:
        browser.close()
