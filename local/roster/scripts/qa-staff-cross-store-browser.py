"""Verify Staff never requests a previous-store employee after an admin changes stores."""

import json
import re
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

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
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        availability_requests = []
        writes = []
        page.on("request", lambda request: availability_requests.append(request.url)
                if request.method == "GET" and "/roster/availability?" in request.url else None)
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()

        expect(page.get_by_role("button", name=re.compile("^HandoverEmployee006"))).to_be_visible(timeout=20000)
        expect(page.get_by_role("heading", name="HandoverEmployee006")).to_be_visible(timeout=20000)
        first_store_requests = [url for url in availability_requests if parse_qs(urlparse(url).query).get("storeId") == ["browser-store"]]
        assert first_store_requests, availability_requests

        page.get_by_role("combobox", name="门店").click()
        page.get_by_role("option", name="Other Store").click()
        expect(page.get_by_role("heading", name="Other Store Employee")).to_be_visible(timeout=20000)
        expect(page.get_by_role("button", name=re.compile("^HandoverEmployee006"))).to_have_count(0)
        expect(page.get_by_role("button", name="保存可用时间")).to_be_enabled(timeout=20000)

        other_store_requests = [parse_qs(urlparse(url).query) for url in availability_requests
                                if parse_qs(urlparse(url).query).get("storeId") == ["browser-other-store"]]
        assert other_store_requests, availability_requests
        assert all(query.get("employeeId") == ["browser-other-employee"] for query in other_store_requests), other_store_requests
        assert not writes, writes
        page.screenshot(path=str(Path(__file__).resolve().parents[1] / "docs/evidence/staff-cross-store-selection-2026-10-20.png"))
        print(json.dumps({"result": "PASS", "firstStoreRequests": len(first_store_requests),
                          "otherStoreRequests": len(other_store_requests), "wrongEmployeeRequests": 0,
                          "rosterWrites": len(writes)}))
    finally:
        browser.close()
