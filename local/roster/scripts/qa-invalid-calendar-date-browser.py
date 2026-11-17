"""Check authenticated Calendar and Copy Day APIs reject nonexistent dates."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        base = "http://127.0.0.1:4035/api"
        read = page.request.get(f"{base}/roster/calendar", params={
            "storeId": "browser-store", "from": "2026-02-30", "to": "2026-03-06"})
        preview = page.request.post(f"{base}/roster/batch/copy-day/preview", data={
            "storeId": "browser-store", "sourceDate": "2026-10-09", "targetDate": "2026-11-31"})
        commit = page.request.post(f"{base}/roster/batch/copy-day", data={
            "storeId": "browser-store", "sourceDate": "2026-10-09", "targetDate": "2026-11-31",
            "expectedSourcePeriodVersion": 1, "expectedTargetPeriodVersion": None})
        statuses = [read.status, preview.status, commit.status]
        if statuses != [400, 400, 400]:
            raise AssertionError(f"Nonexistent dates were accepted: {statuses}")
        print(json.dumps({"verified": True, "calendarRead": statuses[0],
                          "copyPreview": statuses[1], "copyCommit": statuses[2]}))
    finally:
        browser.close()
