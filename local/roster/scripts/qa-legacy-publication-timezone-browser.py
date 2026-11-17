"""Verify legacy publication display and exports against disposable paired schemas."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate schema")
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
        page.locator('a[href="/export"]').first.click()
        expect(page.locator('a[href*="publicationId="]').first).to_be_visible(timeout=15000)
        publication_id = re.search(r"publicationId=([^&]+)", page.locator('a[href*="publicationId="]').first.get_attribute("href")).group(1)
        page.locator('article:has(a[href*="publicationId="]) button').first.click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("status")).to_contain_text("UTC")
        expect(dialog.get_by_text(re.compile(r"2026-10-15.*22:00.*02:00.*UTC"))).to_be_visible()
        screenshot = Path("docs/evidence/legacy-publication-utc-2026-10-16.png")
        page.screenshot(path=str(screenshot), full_page=True)
        csv = page.request.get(f"http://127.0.0.1:4035/api/roster/export.csv?storeId=browser-store&publicationId={publication_id}&audience=employee")
        printed = page.request.get(f"http://127.0.0.1:4035/api/roster/print?storeId=browser-store&publicationId={publication_id}&audience=employee")
        assert csv.status == printed.status == 200
        assert '"2026-10-15","22:00","02:00 (2026-10-16' in csv.text()
        assert "UTC; original store timezone unknown" in csv.text()
        assert "original store timezone unknown" in printed.text()
        assert "2026-10-15" in printed.text() and "22:00" in printed.text()
        print(json.dumps({"verified": True, "dialogUtc": True, "csvUtc": True, "printUtc": True, "screenshot": str(screenshot)}))
    finally:
        browser.close()
