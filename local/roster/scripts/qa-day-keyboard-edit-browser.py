"""A saved Day card must be reachable and editable with a keyboard."""

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
        errors = []
        writes = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: writes.append(request.url) if
                request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        card = page.locator(".fc-timegrid-event").first
        expect(card).to_be_visible()
        meta = card.evaluate("e => ({ tag: e.tagName, role: e.getAttribute('role'), tabIndex: e.tabIndex })")
        assert meta["tabIndex"] >= 0, f"Saved Day card is not keyboard reachable: {meta}"
        card.focus()
        page.keyboard.press("Enter")
        expect(page.get_by_role("dialog")).to_be_visible(timeout=5000)
        page.keyboard.press("Escape")
        expect(page.get_by_role("dialog")).to_have_count(0)
        actions = page.locator(".calendar-more-actions > summary")
        actions.focus()
        page.keyboard.press("Enter")
        add = page.get_by_role("button", name="新增班次")
        expect(add).to_be_visible()
        add.focus()
        page.keyboard.press("Enter")
        draft_dialog = page.get_by_role("dialog")
        expect(draft_dialog.get_by_role("heading", name="新增班次")).to_be_visible()
        draft_dialog.get_by_role("button", name="取消").click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        assert not errors and not writes, {"errors": errors, "writes": writes}
        print(json.dumps({"verified": True, "event": meta, "keyboardEdit": True,
                          "escapeClose": True, "keyboardCreateAlternative": True,
                          "rosterWrites": 0, "pageErrors": 0}))
    finally:
        browser.close()
