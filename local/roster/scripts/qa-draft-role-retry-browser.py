"""A failed draft-role read must retry without discarding unsaved Settings fields."""

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

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
before = api.get(base + "/roster/settings", params={"storeId": "browser-store"}).json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, locale="zh-CN")
        reads = []
        writes = []

        def fail_once(route):
            reads.append(route.request.url)
            if len(reads) == 1:
                route.fulfill(status=503, content_type="application/json", body='{"message":"岗位统计暂不可用"}')
            else:
                route.continue_()

        page.route("**/api/roster/roles/draft-usage?*", fail_once)
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5178/settings", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        alert = page.get_by_role("alert").filter(has_text="待核对草稿岗位暂时无法读取")
        expect(alert).to_be_visible(timeout=15000)
        opening = page.get_by_label("营业开始")
        expect(opening).to_be_enabled()
        opening.fill("07:30")
        alert.get_by_role("button", name="重新读取").click()
        expect(page.get_by_role("region", name="待核对的历史草稿岗位")).to_be_visible(timeout=10000)
        expect(opening).to_have_value("07:30")
        assert len(reads) == 2, reads
        assert not writes, writes
        after = api.get(base + "/roster/settings", params={"storeId": "browser-store"}).json()
        assert after == before
        print(json.dumps({"verified": True, "inventoryReads": 2, "unsavedOpeningTimeRetained": "07:30",
                          "rosterWrites": 0, "persistedSettingsUnchanged": True}))
    finally:
        browser.close()
