"""A late settings read for store A must not expose an A draft as store B's form."""

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


def settings(store_id, opening):
    return {"storeId": store_id, "timezone": "Australia/Sydney", "openingTime": opening, "closingTime": "22:00",
            "slotIntervalMinutes": 30, "minimumShiftMinutes": 60, "defaultBreakMinutes": 30, "weekStartsOn": 1,
            "cycleType": "WEEK", "fortnightAnchorDate": None, "weeklyHourWarning": 38, "dailyHourWarning": 10}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        for store_id, opening in [("browser-store", "07:00"), ("browser-other-store", "12:00")]:
            response = page.context.request.put(f"{api}/roster/settings/{store_id}", data=settings(store_id, opening))
            assert response.status == 200, (store_id, response.status, response.text())
        pending = {}
        writes = []
        page.on("request", lambda request: writes.append(request.url) if request.method == "PUT" and "/roster/settings/" in request.url else None)

        def hold_read(route):
            store_id = route.request.url.split("storeId=", 1)[1].split("&", 1)[0]
            response = route.fetch()
            pending[store_id] = (route, response)

        page.route("**/api/roster/settings?storeId=*", hold_read)
        page.goto("http://127.0.0.1:5177/settings", wait_until="domcontentloaded")
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
        save = page.get_by_role("button", name="保存规则")
        expect(save).to_be_disabled()
        assert not writes, writes
        pending["browser-other-store"][0].fulfill(response=pending["browser-other-store"][1])
        expect(page.get_by_label("营业开始")).to_have_value("12:00", timeout=15000)
        pending["browser-store"][0].fulfill(response=pending["browser-store"][1])
        expect(page.get_by_label("营业开始")).to_have_value("12:00")
        page.get_by_label("营业开始").fill("13:00")
        with page.expect_response(lambda response: response.request.method == "PUT" and response.url.endswith("/roster/settings/browser-other-store")) as saved:
            save.click()
        assert saved.value.status == 200, (saved.value.status, saved.value.text())
        assert writes == [f"{api}/roster/settings/browser-other-store"], writes
        page.unroute("**/api/roster/settings?storeId=*", hold_read)
        page.reload(wait_until="domcontentloaded")
        if page.get_by_role("combobox", name="门店").text_content().strip() != "Other Store":
            page.get_by_role("combobox", name="门店").click()
            page.get_by_role("option", name="Other Store").click()
        expect(page.get_by_label("营业开始")).to_have_value("13:00", timeout=15000)
        print(json.dumps({"verified": True, "lateOldReadIgnored": True, "crossStoreWrites": 0, "targetOpening": "13:00"}))
    finally:
        browser.close()
