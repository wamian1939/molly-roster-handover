"""Prove localhost QA login cannot replace a 127.0.0.1 session cookie."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        context = browser.new_context()
        context.add_cookies([{"name": "evaluate_molly_session", "value": "normal-host-marker",
                              "domain": "127.0.0.1", "path": "/"}])
        page = context.new_page()
        page.goto("http://localhost:5177/calendar?view=timeGridWeek&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        normal = context.cookies("http://127.0.0.1:5176")
        qa = context.cookies("http://localhost:5177")
        normal_cookie = next(cookie for cookie in normal if cookie["name"] == "evaluate_molly_session")
        qa_cookie = next(cookie for cookie in qa if cookie["name"] == "evaluate_molly_session")
        assert normal_cookie["value"] == "normal-host-marker"
        assert qa_cookie["value"] != "normal-host-marker"
        assert normal_cookie["domain"] != qa_cookie["domain"]
        print(json.dumps({"verified": True, "qaCalendarLoaded": True,
                          "normalHostCookiePreserved": True,
                          "cookieHosts": [normal_cookie["domain"], qa_cookie["domain"]]}))
    finally:
        browser.close()
