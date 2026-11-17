"""A stale legacy-role batch must roll back, refresh, and permit an explicit retry."""

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
for employee_id in ("browser-regular", "browser-training"):
    availability = api.put(base + "/roster/availability", json={
        "storeId": "browser-store", "employeeId": employee_id, "dates": ["2026-10-09"],
        "expectedRows": [], "entries": [{"date": "2026-10-09", "status": "AVAILABLE",
                                      "startAt": "2026-10-08T21:00:00.000Z", "endAt": "2026-10-09T03:00:00.000Z"}],
    })
    assert availability.status_code in (200, 201), availability.text
roles = api.get(base + "/roster/roles", params={"storeId": "browser-store"}).json()
formal_role = next(item for item in roles if item["code"] == "qa-front")
shift_ids = ("qa-draft-shift", "qa-draft-grouped-shift")
before = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
          for shift_id in shift_ids}
assert {item["roleNameSnapshot"] for item in before.values()} == {"验收岗"}
published_before = api.get(base + "/roster/periods/qa-published-period/publications", params={
    "storeId": "browser-store",
}).json()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        page.goto("http://127.0.0.1:5178/calendar?view=dayGridMonth&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="批量", exact=True).click()
        selected = page.get_by_text(re.compile(r"已选 [0-9]+ 个"))
        legacy_card = page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event').filter(has_text="旧岗位：验收岗")
        expect(legacy_card).to_have_count(1)
        legacy_card.click()
        expect(selected).to_contain_text("已选 2 个")
        page.get_by_role("combobox", name="统一改为岗位").click()
        page.get_by_role("option", name="QA Front").click()

        other = before["qa-draft-shift"]
        changed = api.patch(base + "/roster/shifts/qa-draft-shift", json={
            "storeId": "browser-store", "rosterPeriodId": other["rosterPeriodId"],
            "date": other["date"], "startAt": other["startAt"], "endAt": other["endAt"],
            "breakMinutes": other["breakMinutes"], "shiftRoleId": formal_role["id"],
            "employeeIds": [item["employeeId"] for item in other["assignments"]],
            "publicNote": other["publicNote"] or "", "internalNote": other["internalNote"] or "",
            "version": other["version"],
        })
        assert changed.status_code == 200, changed.text
        with page.expect_response(lambda response: response.url.endswith("/roster/batch/update")) as stale_response:
            page.get_by_role("button", name="批量改岗").click()
        assert stale_response.value.status == 409, stale_response.value.text()
        after_stale = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                       for shift_id in shift_ids}
        assert after_stale["qa-draft-shift"]["version"] == before["qa-draft-shift"]["version"] + 1
        assert after_stale["qa-draft-grouped-shift"]["version"] == before["qa-draft-grouped-shift"]["version"]
        assert after_stale["qa-draft-grouped-shift"]["roleNameSnapshot"] == "验收岗"
        expect(selected).to_contain_text("已选 0 个", timeout=15000)
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        legacy_card = page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event').filter(has_text="旧岗位：验收岗")
        expect(legacy_card).to_have_count(1)
        legacy_card.click()
        expect(selected).to_contain_text("已选 1 个")
        with page.expect_response(lambda response: response.url.endswith("/roster/batch/update")) as retry_response:
            page.get_by_role("button", name="批量改岗").click()
        assert retry_response.value.status == 200, retry_response.value.text()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        after = {shift_id: api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                 for shift_id in shift_ids}
        assert {item["shiftRoleId"] for item in after.values()} == {formal_role["id"]}
        assert after["qa-draft-shift"]["version"] == after_stale["qa-draft-shift"]["version"]
        assert after["qa-draft-grouped-shift"]["version"] == before["qa-draft-grouped-shift"]["version"] + 1
        page.get_by_role("button", name="批量", exact=True).click()
        grouped = page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event').filter(has_text="QA Front")
        expect(grouped).to_have_count(1)
        grouped.click()
        selected = page.get_by_text(re.compile(r"已选 [0-9]+ 个"))
        expect(selected).to_contain_text("已选 2 个")
        competing = after["qa-draft-shift"]
        note_changed = api.patch(base + "/roster/shifts/qa-draft-shift", json={
            "storeId": "browser-store", "rosterPeriodId": competing["rosterPeriodId"],
            "date": competing["date"], "startAt": competing["startAt"], "endAt": competing["endAt"],
            "breakMinutes": competing["breakMinutes"], "shiftRoleId": formal_role["id"],
            "employeeIds": [item["employeeId"] for item in competing["assignments"]],
            "publicNote": "Concurrent note", "internalNote": competing["internalNote"] or "",
            "version": competing["version"],
        })
        assert note_changed.status_code == 200, note_changed.text
        page.get_by_role("button", name="批量删除").click()
        with page.expect_response(lambda response: response.url.endswith("/roster/batch/delete")) as stale_delete_response:
            page.get_by_role("button", name=re.compile(r"确认删除 2 个")).click()
        assert stale_delete_response.value.status == 409, stale_delete_response.value.text()
        expect(selected).to_contain_text("已选 0 个", timeout=15000)
        expect(page.get_by_role("button", name="批量删除")).to_be_disabled()
        for shift_id in shift_ids:
            kept = api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"})
            assert kept.status_code == 200, kept.text
        assert api.get(base + "/roster/periods/qa-published-period/publications", params={
            "storeId": "browser-store",
        }).json() == published_before
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-daygrid-event').click()
        expect(selected).to_contain_text("已选 2 个")
        page.get_by_role("combobox", name="统一改为岗位").click()
        page.get_by_role("option", name="QA Front").click()
        expect(page.get_by_role("button", name="批量改岗")).to_be_enabled()
        retired = evaluate_api.patch("http://127.0.0.1:4010/api/store-jobs/" + job.json()["id"],
                                     json={"isActive": False})
        assert retired.status_code == 200, retired.text
        with page.expect_response(lambda response: response.url.endswith("/roster/batch/update")) as retired_response:
            page.get_by_role("button", name="批量改岗").click()
        assert retired_response.value.status == 422, retired_response.value.text()
        expect(page.get_by_role("button", name="批量改岗")).to_be_disabled(timeout=15000)
        page.get_by_role("button", name="刷新排班").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.get_by_role("button", name="批量改岗")).to_be_disabled()
        assert api.get(base + "/roster/periods/qa-published-period/publications", params={
            "storeId": "browser-store",
        }).json() == published_before
        print(json.dumps({"verified": True, "staleBatchStatus": stale_response.value.status,
                          "partialWritesOnStale": 0, "selectionClearedAndRefreshed": True,
                          "retryStatus": retry_response.value.status,
                          "staleDeleteStatus": stale_delete_response.value.status,
                          "partialDeletesOnStale": 0, "retiredRoleStatus": retired_response.value.status,
                          "retiredRoleBatchDisabled": True,
                          "publishedHistoryUnchanged": True}))
    finally:
        browser.close()
