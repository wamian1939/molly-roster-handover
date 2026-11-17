"""Publish from Chromium and verify the frozen formal job name on a disposable roster."""

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
session = requests.Session()
session.post(base + "/auth/login", json=credential).raise_for_status()
source_params = {"storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-09"}
source_before = session.get(base + "/roster/calendar", params=source_params).json()["shifts"]
assert len(source_before) == 2
assert {shift["roleNameSnapshot"] for shift in source_before} == {"QA Front"}
publications_url = base + "/roster/periods/qa-draft-period/publications"
assert not session.get(publications_url, params={"storeId": "browser-store"}).json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        page.goto("http://127.0.0.1:5178/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5178/calendar?store=browser-store&view=dayGridMonth&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        publish_button = page.get_by_role("button", name="发布本周期")
        expect(publish_button).to_be_visible()
        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith("/qa-draft-period/publish")) as publishing:
            publish_button.click()
        assert publishing.value.status == 200, publishing.value.text()
        expect(page.get_by_role("button", name="重新打开草稿")).to_be_visible(timeout=15000)
    finally:
        browser.close()

publications = session.get(publications_url, params={"storeId": "browser-store"}).json()
assert len(publications) == 1
detail = session.get(base + "/roster/publications/" + publications[0]["id"],
                     params={"storeId": "browser-store", "audience": "manager"}).json()
snapshot = detail["snapshot"]
assert {shift["roleNameSnapshot"] for shift in snapshot["shifts"]} == {"Official QA Front"}
source_after = session.get(base + "/roster/calendar", params=source_params).json()["shifts"]
assert source_after == source_before
print(json.dumps({"browserPublishStatus": 200, "publicationRoleSnapshot": "Official QA Front",
                  "sourceRoleSnapshot": "QA Front", "publicationCount": 1}))
