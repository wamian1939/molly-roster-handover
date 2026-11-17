"""A delayed old-store Templates read must not authorize a cross-store edit."""

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
api = "http://127.0.0.1:4035/api"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        created = {}
        for store_id, name in [("browser-store", "QA A Early"), ("browser-other-store", "QA B Mid")]:
            response = page.context.request.post(f"{api}/roster/templates", data={
                "storeId": store_id, "name": name, "startTime": "09:00", "endTime": "17:00",
                "breakMinutes": 30, "shiftRoleId": None,
            })
            assert response.status == 201, (store_id, response.status, response.text())
            created[store_id] = response.json()

        pending = {}
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url, request.post_data))
                if request.method in ("POST", "PATCH") and "/roster/templates" in request.url else None)

        def hold_read(route):
            store_id = route.request.url.split("storeId=", 1)[1].split("&", 1)[0]
            pending[store_id] = (route, route.fetch())

        page.route("**/api/roster/templates?storeId=*", hold_read)
        page.goto("http://127.0.0.1:5177/templates", wait_until="domcontentloaded")
        for _ in range(100):
            if "browser-store" in pending:
                break
            page.wait_for_timeout(50)
        assert "browser-store" in pending, pending
        page.get_by_role("combobox", name="门店").click()
        page.get_by_role("option", name="Other Store").click()
        for _ in range(100):
            if "browser-other-store" in pending:
                break
            page.wait_for_timeout(50)
        assert "browser-other-store" in pending, pending
        assert all(button.is_disabled() for button in page.get_by_role("button", name="创建模板").all())
        assert not writes, writes
        pending["browser-other-store"][0].fulfill(response=pending["browser-other-store"][1])
        expect(page.get_by_text("QA B Mid")).to_be_visible(timeout=15000)
        pending["browser-store"][0].fulfill(response=pending["browser-store"][1])
        expect(page.get_by_text("QA B Mid")).to_be_visible()
        assert page.get_by_text("QA A Early").count() == 0
        page.unroute("**/api/roster/templates?storeId=*", hold_read)
        page.get_by_role("button", name="编辑").click()
        page.get_by_placeholder("例如：早班").fill("QA B Changed")
        with page.expect_response(lambda response: response.request.method == "PATCH"
                                  and response.url.endswith(f"/roster/templates/{created['browser-other-store']['id']}")) as saved:
            page.get_by_role("button", name="保存修改").click()
        assert saved.value.status == 200, (saved.value.status, saved.value.text())
        expect(page.get_by_text("QA B Changed")).to_be_visible(timeout=15000)
        assert len(writes) == 1 and writes[0][0] == "PATCH"
        assert json.loads(writes[0][2])["storeId"] == "browser-other-store", writes
        page.reload(wait_until="domcontentloaded")
        if page.get_by_role("combobox", name="门店").text_content().strip() != "Other Store":
            page.get_by_role("combobox", name="门店").click()
            page.get_by_role("option", name="Other Store").click()
        expect(page.get_by_text("QA B Changed")).to_be_visible(timeout=15000)
        print(json.dumps({"verified": True, "oldReadIgnored": True, "writes": len(writes), "targetName": "QA B Changed"}))
    finally:
        browser.close()
