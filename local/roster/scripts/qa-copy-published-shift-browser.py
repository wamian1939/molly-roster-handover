"""Copy a published Shift into a new draft without changing its source or history."""

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
assert job.status_code in (201, 409), job.text

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
availability = api.put(base + "/roster/availability", json={
    "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-23"], "expectedRows": [],
    "entries": [{"date": "2026-10-23", "status": "AVAILABLE",
                 "startAt": "2026-10-22T21:00:00.000Z", "endAt": "2026-10-23T03:00:00.000Z"}],
})
assert availability.status_code in (200, 201), availability.text
source_url = base + "/roster/shifts/qa-published-shift"
source_before = api.get(source_url, params={"storeId": "browser-store"}).json()
publication_url = base + "/roster/periods/qa-published-period/publications"
publication_before = api.get(publication_url, params={"storeId": "browser-store"}).json()
assert len(publication_before) == 1
target_params = {"storeId": "browser-store", "from": "2026-10-23", "to": "2026-10-23"}
target_url = base + "/roster/calendar"
assert api.get(target_url, params=target_params).json()["shifts"] == []

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        shift_writes = []
        page.on("request", lambda request: shift_writes.append((request.method, request.url)) if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5178/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)

        for cancel in (True, False):
            page.locator(".fc-timegrid-event").filter(has_text="Regular Bob").click()
            detail = page.get_by_role("dialog")
            expect(detail.get_by_role("heading", name="班次详情")).to_be_visible()
            detail.get_by_role("button", name="复制班次").click()
            copy = page.get_by_role("dialog")
            expect(copy.get_by_role("heading", name="复制班次")).to_be_visible()
            expect(copy.get_by_label("复制到日期")).to_have_value("2026-10-23")
            expect(copy).to_contain_text("09:00 - 13:00")
            expect(copy.get_by_role("button", name=re.compile(r"^保存班次"))).to_be_enabled(timeout=15000)
            if cancel:
                copy.get_by_role("button", name="取消").click()
                expect(page.get_by_role("dialog")).to_have_count(0)
                assert shift_writes == [], shift_writes
                assert api.get(target_url, params=target_params).json()["shifts"] == []
            else:
                with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/shifts/with-period")) as saved:
                    copy.get_by_role("button", name=re.compile(r"^保存班次")).click()
                assert saved.value.status == 201, (saved.value.status, saved.value.text())
                expect(page.get_by_role("dialog")).to_have_count(0)
                expect(page).to_have_url(re.compile(r"date=2026-10-23"), timeout=15000)
                expect(page.locator(".fc-timegrid-event").filter(has_text="Regular Bob")).to_be_visible(timeout=15000)
                page.reload(wait_until="domcontentloaded")
                expect(page.locator(".fc-timegrid-event").filter(has_text="Regular Bob")).to_be_visible(timeout=15000)

        page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator(".fc-timegrid-event").filter(has_text="Regular Bob").click()
        chooser = page.get_by_role("dialog")
        chooser.get_by_role("button", name=re.compile("Regular Bob")).click()
        edit = page.get_by_role("dialog")
        expect(edit.get_by_role("heading", name="编辑班次")).to_be_visible()
        edit.get_by_role("button", name="其他班次操作").click()
        edit.get_by_role("button", name="复制班次").click()
        draft_copy = page.get_by_role("dialog")
        expect(draft_copy.get_by_label("复制到日期")).to_have_value("2026-10-10")
        draft_copy.get_by_role("button", name="取消").click()
        assert len(shift_writes) == 1, shift_writes
    finally:
        browser.close()

target = api.get(target_url, params=target_params).json()
assert len(target["shifts"]) == 1
assert target["shifts"][0]["id"] != source_before["id"]
assert target["shifts"][0]["roleNameSnapshot"] == "QA Front"
assert target["shifts"][0]["assignments"][0]["employeeId"] == "browser-regular"
assert api.get(source_url, params={"storeId": "browser-store"}).json() == source_before
assert api.get(publication_url, params={"storeId": "browser-store"}).json() == publication_before
print(json.dumps({"publishedCopyCancelledWithoutWrite": True, "savedCopyDate": "2026-10-23", "draftCopyDefaultDate": "2026-10-10", "sourceUnchanged": True, "publicationUnchanged": True}))
