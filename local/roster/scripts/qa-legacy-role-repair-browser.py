"""Repair one disposable legacy draft by selecting a current Evaluate formal job."""

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
availability_rows = api.get(base + "/roster/availability", params={
    "storeId": "browser-store", "employeeId": "browser-regular", "from": "2026-10-09", "to": "2026-10-09",
}).json()
if not availability_rows:
    availability = api.put(base + "/roster/availability", json={
        "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-09"],
        "expectedRows": [], "entries": [{"date": "2026-10-09", "status": "AVAILABLE",
                                      "startAt": "2026-10-08T21:00:00.000Z", "endAt": "2026-10-09T03:00:00.000Z"}],
    })
    assert availability.status_code in (200, 201), availability.text
shift_url = base + "/roster/shifts/qa-draft-shift"
before = api.get(shift_url, params={"storeId": "browser-store"}).json()
assert before["roleNameSnapshot"] == "验收岗"
published_before = api.get(base + "/roster/periods/qa-published-period/publications", params={
    "storeId": "browser-store",
}).json()
roles = api.get(base + "/roster/roles", params={"storeId": "browser-store"}).json()
formal_role = next(item for item in roles if item["code"] == "qa-front")


def open_legacy_editor(page):
    legacy = page.locator(".fc-timegrid-event").filter(has_text="旧岗位：验收岗")
    expect(legacy).to_be_visible(timeout=15000)
    legacy.click()
    if page.get_by_role("heading", name="编辑班次").count() == 0:
        page.get_by_role("button", name=re.compile("Regular Bob")).click()
    dialog = page.get_by_role("dialog")
    expect(dialog.get_by_role("heading", name="编辑班次")).to_be_visible()
    return dialog


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        page.goto(frontend + "/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.goto(frontend + "/settings", wait_until="domcontentloaded")
        formal = page.locator('[aria-label="Evaluate 正式岗位清单"]')
        expect(formal).to_contain_text("QA Front", timeout=15000)
        expect(formal).not_to_contain_text("验收岗")
        expect(page.get_by_role("region", name="待核对的历史草稿岗位")).to_contain_text("验收岗")
        page.goto(frontend + "/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)

        dialog = open_legacy_editor(page)
        expect(dialog.get_by_text(re.compile("旧岗位已不在 Evaluate 正式清单中"))).to_be_visible()
        save = dialog.get_by_role("button", name=re.compile(r"^保存班次"))
        expect(save).to_be_disabled()
        dialog.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        expect(dialog).to_have_count(0)
        assert api.get(shift_url, params={"storeId": "browser-store"}).json()["version"] == before["version"]

        dialog = open_legacy_editor(page)
        save = dialog.get_by_role("button", name=re.compile(r"^保存班次"))
        dialog.locator("label.role-chip").filter(has_text="QA Front").click()
        expect(dialog.get_by_role("radio", name="QA Front")).to_be_checked()
        expect(save).to_be_enabled()
        with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/roster/shifts/qa-draft-shift")) as saved_response:
            save.click()
        assert saved_response.value.status == 200, saved_response.value.text()
        expect(dialog).to_have_count(0)
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="旧岗位：验收岗")).to_have_count(0)
        after = api.get(shift_url, params={"storeId": "browser-store"}).json()
        assert after["shiftRoleId"] == formal_role["id"]
        assert after["version"] == before["version"] + 1
        assert after["roleNameSnapshot"] == "QA Front"
        assert after["startAt"] == before["startAt"] and after["endAt"] == before["endAt"]
        assert [item["employeeId"] for item in after["assignments"]] == [item["employeeId"] for item in before["assignments"]]
        published_after = api.get(base + "/roster/periods/qa-published-period/publications", params={
            "storeId": "browser-store",
        }).json()
        assert published_after == published_before
        training_availability = api.put(base + "/roster/availability", json={
            "storeId": "browser-store", "employeeId": "browser-training", "dates": ["2026-10-09"],
            "expectedRows": [], "entries": [{"date": "2026-10-09", "status": "AVAILABLE",
                                          "startAt": "2026-10-08T21:00:00.000Z", "endAt": "2026-10-09T03:00:00.000Z"}],
        })
        assert training_availability.status_code in (200, 201), training_availability.text
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/roster/periods/qa-draft-period/publish")) as publish_response:
            page.get_by_role("button", name="发布本周期").click()
        assert publish_response.value.status == 200, publish_response.value.text()
        source_period = api.get(base + "/roster/periods/qa-draft-period", params={"storeId": "browser-store"}).json()
        assert source_period["status"] == "PUBLISHED"
        source_publications = api.get(base + "/roster/periods/qa-draft-period/publications", params={
            "storeId": "browser-store",
        }).json()
        assert len(source_publications) == 1
        publication = api.get(base + "/roster/publications/" + source_publications[0]["id"], params={
            "storeId": "browser-store", "audience": "manager",
        }).json()["snapshot"]
        assert {item["roleNameSnapshot"] for item in publication["shifts"]} == {"QA Front"}
        assert api.get(base + "/roster/periods/qa-published-period/publications", params={
            "storeId": "browser-store",
        }).json() == published_before
        print(json.dumps({"verified": True, "legacyRoleHiddenInSettings": True,
                          "saveDisabledUntilFormalRole": True, "cancelMadeNoWrite": True,
                          "repairStatus": saved_response.value.status, "versionAdvanced": True,
                          "timeAndEmployeePreserved": True, "publishStatus": publish_response.value.status,
                          "publishedHistoryUnchanged": True}))
    finally:
        browser.close()
