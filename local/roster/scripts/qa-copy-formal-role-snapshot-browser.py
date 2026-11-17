"""Check that a copied Shift uses today's Evaluate formal job name without rewriting its source."""

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

request = {"storeId": "browser-store", "sourceDate": "2026-10-09", "targetDate": "2026-10-10"}
target_params = {"storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10"}
target_before = session.get(base + "/roster/calendar", params=target_params).json()["shifts"]
if not target_before:
    preview_response = session.post(base + "/roster/batch/copy-day/preview", json=request)
    preview_response.raise_for_status()
    preview = preview_response.json()
    assert preview["canCopy"] and preview["readyShifts"] == 2, preview
    commit_response = session.post(base + "/roster/batch/copy-day", json={
        **request,
        "expectedSourcePeriodVersion": preview["sourcePeriodVersion"],
        "expectedTargetPeriodVersion": preview["targetPeriodVersion"],
    })
    commit_response.raise_for_status()
    assert commit_response.json()["created"] == 2
else:
    assert len(target_before) == 2, "Unexpected partial target copy"

source_after = session.get(base + "/roster/calendar", params=source_params).json()["shifts"]
target = session.get(base + "/roster/calendar", params=target_params).json()["shifts"]
assert source_after == source_before, "Source Shift snapshots or versions changed"
assert len(target) == 2
assert {shift["roleNameSnapshot"] for shift in target} == {"Official QA Front"}
assert {shift["shiftRoleId"] for shift in target} == {shift["shiftRoleId"] for shift in source_before}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        page.goto("http://127.0.0.1:5178/calendar?store=browser-store&view=timeGridDay&date=2026-10-10", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".fc-timegrid-event").first).to_be_visible(timeout=15000)
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        assert any("Official QA Front" in value for value in page.locator(".fc-timegrid-event").all_text_contents())
        page.goto("http://127.0.0.1:5178/calendar?store=browser-store&view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".fc-timegrid-event").first).to_be_visible(timeout=15000)
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        assert any("Official QA Front" in value for value in page.locator(".fc-timegrid-event").all_text_contents())
        print(json.dumps({"created": 2, "targetRoleSnapshot": "Official QA Front",
                          "sourceRoleSnapshot": "QA Front", "browserCurrentFormalNameVerified": True}))
    finally:
        browser.close()
