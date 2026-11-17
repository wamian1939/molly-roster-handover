"""Verify lost Reopen and Publish responses against authoritative period status."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

workspace = Path(__file__).resolve().parent.parent
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
        writes = []
        period_reads = []

        def lose_success_response(route):
            response = route.fetch()
            writes.append((route.request.url.rsplit("/", 1)[-1], response.status))
            if response.status == 200:
                route.abort("failed")
            else:
                route.fulfill(response=response)

        page.route(re.compile(r"/api/roster/periods/qa-published-period/(?:reopen|publish)$"), lose_success_response)
        page.on("response", lambda response: period_reads.append(response.status)
                if response.request.method == "GET" and "/api/roster/periods/qa-published-period?" in response.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="重新打开草稿").click()
        expect(page.get_by_text("当前排班已重新打开", exact=True)).to_be_visible(timeout=15000)
        expect(page.get_by_role("button", name="发布本周期")).to_be_visible(timeout=15000)
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("button", name="发布本周期")).to_be_visible(timeout=15000)

        availability = page.request.put("http://127.0.0.1:4035/api/roster/availability", data={
            "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-16"],
            "expectedRows": [], "entries": [{"date": "2026-10-16", "status": "AVAILABLE",
                "startAt": "2026-10-15T22:00:00.000Z", "endAt": "2026-10-16T02:00:00.000Z"}],
        })
        assert availability.status == 200, (availability.status, availability.text())
        page.get_by_role("button", name="发布本周期").click()
        expect(page.get_by_text("当前排班已发布", exact=True)).to_be_visible(timeout=15000)
        expect(page.get_by_role("button", name="重新打开草稿")).to_be_visible(timeout=15000)
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("button", name="重新打开草稿")).to_be_visible(timeout=15000)
        assert writes == [("reopen", 200), ("publish", 200)], writes
        assert period_reads == [200, 200], period_reads
        verified = subprocess.run(["node", "scripts/verify-uncertain-publication-browser.mjs"],
                                  cwd=workspace, check=True, capture_output=True, text=True)
        print(json.dumps({"verified": True, "lostResponses": writes, "authoritativeReads": period_reads,
                          "database": json.loads(verified.stdout)}))
    finally:
        browser.close()
