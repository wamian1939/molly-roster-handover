"""Verify Export can still open the old publication after Month Reopen."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
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
        page.get_by_role("link", name="导出").click()
        expect(page.get_by_role("heading", name="导出排班")).to_be_visible(timeout=15000)
        page.get_by_role("combobox", name="排班周期").click()
        page.get_by_role("option", name=re.compile(r"2026-10-12 至 2026-10-18.*草稿")).click()
        expect(page.get_by_text("发布 #1", exact=False).first).to_be_visible(timeout=15000)
        page.get_by_role("button", name="查看").click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_text("只读发布版本 #1")).to_be_visible(timeout=15000)
        expect(dialog.get_by_text("Regular Bob")).to_be_visible(timeout=15000)
        print(json.dumps({"verified": True, "currentPeriodStatus": "DRAFT", "historicalRevision": 1,
                          "publishedEmployeeSnapshotVisible": True}))
    finally:
        browser.close()
