"""Check Settings' formal-job status rendering in isolated Chromium without writes."""

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


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        def jobs_route(route):
            response = route.fetch()
            payload = response.json()
            payload["jobs"].extend([
                {"id": "qa-formal-one", "storeId": "browser-store", "code": "qa-formal-one",
                 "name": "QA 同名岗位", "isActive": True, "displayOrder": 900},
                {"id": "qa-formal-two", "storeId": "browser-store", "code": "qa-formal-two",
                 "name": "QA 同名岗位", "isActive": True, "displayOrder": 901},
            ])
            route.fulfill(response=response, json=payload)

        def roles_route(route):
            response = route.fetch()
            payload = response.json()
            payload.append({"id": "qa-scheduling-one", "storeId": "browser-store",
                            "code": "qa-formal-one", "nameZh": "QA 同名岗位",
                            "colorToken": "#2563eb", "requiredSkillCodes": [],
                            "isActive": True, "version": 1, "displayOrder": 900})
            route.fulfill(response=response, json=payload)

        page.route(re.compile(r"/api/workforce/stores/browser-store/jobs(?:\?|$)"), jobs_route)
        page.route(re.compile(r"/api/roster/roles\?"), roles_route)
        page.goto("http://127.0.0.1:5177/settings?store=browser-store", wait_until="domcontentloaded")
        first = page.locator('[aria-label="Evaluate 正式岗位清单"] > div').filter(has_text="qa-formal-one")
        second = page.locator('[aria-label="Evaluate 正式岗位清单"] > div').filter(has_text="qa-formal-two")
        expect(first).to_contain_text("已用于排班", timeout=15000)
        expect(second).to_contain_text("选择关联")
        second.get_by_role("button", name="选择关联").click()
        expect(page.get_by_role("button", name="关联正式岗位")).to_be_enabled()
        assert not writes, writes
        print(json.dumps({"verified": True, "first": first.inner_text(),
                          "second": second.inner_text(), "rosterWrites": len(writes)}, ensure_ascii=False))
    finally:
        browser.close()
