"""Repair a draft Shift whose saved employee moved out of the store."""

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
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        patches = []
        page.on("response", lambda response: patches.append(response.status)
                if response.request.method == "PATCH" and "/roster/shifts/qa-draft-shift" in response.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator(".fc-timegrid-event").filter(has_text="Regular Bob").first.click()
        chooser = page.get_by_role("dialog")
        if chooser.get_by_role("button", name=re.compile("Regular Bob")).count():
            chooser.get_by_role("button", name=re.compile("Regular Bob")).click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("button", name="移除 Regular Bob")).to_be_visible()
        dialog.locator("footer button").last.click()
        expect(dialog.get_by_text("已选员工不在当前门店可排班名单中", exact=False)).to_be_visible()
        assert not patches, patches
        dialog.get_by_role("button", name="移除 Regular Bob").click()
        dialog.get_by_label("员工列表").get_by_role("button", name=re.compile("HandoverEmployee006")).click()
        dialog.locator("footer button").last.click()
        expect(dialog).to_have_count(0)
        assert patches == [200], patches
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")).to_be_visible()
        print(json.dumps({"verified": True, "formerEmployee": "browser-regular", "replacement": "browser-HandoverEmployee006",
                          "patchStatuses": patches, "reloaded": True}))
    finally:
        browser.close()
