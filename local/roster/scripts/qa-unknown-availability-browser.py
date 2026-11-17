"""Verify malformed UNKNOWN Availability writes preserve a saved row in disposable QA."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
url = "http://127.0.0.1:4035/api/roster/availability"
date = "2027-01-11"
base = {"storeId": "browser-store", "employeeId": "browser-cindy", "dates": [date]}
unknown = {"date": date, "status": "UNKNOWN", "startAt": None, "endAt": None}
timed = {"date": date, "status": "AVAILABLE",
         "startAt": "2027-01-10T22:00:00.000Z", "endAt": "2027-01-11T06:00:00.000Z"}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.get_by_role("heading", name="员工与可用时间")).to_be_visible(timeout=15000)

        client = page.context.request
        saved = client.put(url, data={**base, "expectedRows": [], "entries": [unknown]})
        assert saved.status == 200, saved.text()
        before = client.get(url, params={"storeId": base["storeId"], "employeeId": base["employeeId"],
                                         "from": date, "to": date})
        assert before.status == 200 and len(before.json()) == 1, before.text()
        row = before.json()[0]
        assert row["status"] == "UNKNOWN" and row["startAt"] is None and row["endAt"] is None, row

        cases = [
            [unknown, timed],
            [unknown, unknown],
            [{**unknown, "startAt": timed["startAt"], "endAt": timed["endAt"]}],
        ]
        for entries in cases:
            rejected = client.put(url, data={**base, "expectedRows": [{"id": row["id"], "version": row["version"]}],
                                             "entries": entries})
            assert rejected.status == 400, rejected.text()
            after = client.get(url, params={"storeId": base["storeId"], "employeeId": base["employeeId"],
                                            "from": date, "to": date})
            assert after.status == 200 and after.json() == before.json(), after.text()

        template_url = "http://127.0.0.1:4035/api/roster/availability-templates"
        templates_before = client.get(template_url, params={"storeId": base["storeId"]})
        assert templates_before.status == 200, templates_before.text()
        legacy_unknown = {"dayOffset": 0, "status": "UNKNOWN", "startTime": None, "endTime": None,
                          "endNextDay": False}
        legacy_timed = {"dayOffset": 0, "status": "AVAILABLE", "startTime": "09:00", "endTime": "17:00",
                        "endNextDay": False}
        for slots in ([legacy_unknown, legacy_timed], [legacy_unknown, legacy_unknown]):
            rejected = client.post(template_url, data={"storeId": base["storeId"], "name": "Rejected template",
                                                       "slots": slots})
            assert rejected.status == 400, rejected.text()
        templates_after = client.get(template_url, params={"storeId": base["storeId"]})
        assert templates_after.status == 200 and templates_after.json() == templates_before.json(), templates_after.text()

        legacy_template = {"id": "synthetic-legacy-template", "storeId": base["storeId"], "name": "Legacy",
                           "slots": [legacy_unknown, legacy_timed], "isActive": True, "displayOrder": 0, "version": 1}
        page.route("**/api/roster/availability-templates?*", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps([legacy_template])))
        page.reload(wait_until="domcontentloaded")
        card = page.locator(".staff-directory-card").filter(has_text="Cindy")
        expect(card).to_be_visible(timeout=15000)
        card.click()
        standard = page.get_by_role("button", name="标准可用")
        expect(standard).to_be_enabled(timeout=15000)
        standard.click()
        slots_before = page.locator(".availability-slot-row").count()
        assert slots_before > 0
        page.get_by_role("button", name="套用：Legacy").click()
        expect(page.get_by_text("模板同一天同时包含未知和其他时段，请先修正模板。")).to_be_visible()
        assert page.locator(".availability-slot-row").count() == slots_before

        print(json.dumps({"verified": True, "rejectedAvailabilityCases": len(cases),
                          "rejectedTemplateCases": 2, "savedRowUnchanged": True, "templatesUnchanged": True,
                          "legacyTemplateDidNotChangeDraft": True, "storeId": base["storeId"],
                          "employeeId": base["employeeId"]}))
    finally:
        browser.close()
