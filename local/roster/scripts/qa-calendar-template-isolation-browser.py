"""Calendar core remains usable while the optional template request is stalled or fails."""

import asyncio
import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.async_api import async_playwright, expect


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

api = requests.Session()
base = "http://127.0.0.1:4040/api"
api.post(base + "/auth/login", json=credential).raise_for_status()
before = api.get(base + "/roster/calendar", params={
    "storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-15",
}).json()


async def main():
    held = asyncio.Event()
    release = asyncio.Event()
    reads = []
    writes = []
    fail_initial = {"value": True}

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page(viewport={"width": 1440, "height": 1000}, locale="zh-CN")

            async def hold_templates(route):
                reads.append(route.request.url)
                if fail_initial["value"]:
                    held.set()
                    await release.wait()
                    await route.fulfill(status=503, content_type="application/json", body='{"message":"QA templates unavailable"}')
                else:
                    await route.continue_()

            await page.route("**/api/roster/templates?*", hold_templates)
            page.on("request", lambda request: writes.append((request.method, request.url))
                    if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
            await page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
            await page.locator('input[autocomplete="username"]').fill(credential["username"])
            await page.locator('input[autocomplete="current-password"]').fill(credential["password"])
            await page.locator('button[type="submit"]').click()
            await asyncio.wait_for(held.wait(), timeout=15)
            surface = page.locator(".calendar-surface")
            await expect(surface).to_have_attribute("aria-busy", "false", timeout=15000)
            await expect(page.get_by_role("button", name="新增班次")).to_be_enabled()
            release.set()
            await expect(page.get_by_text("QA templates unavailable", exact=False)).to_be_visible(timeout=10000)
            fail_initial["value"] = False
            await page.get_by_role("button", name="重试模板").click()
            await expect(page.get_by_text("QA templates unavailable", exact=False)).to_have_count(0)
            assert len(reads) >= 2, reads
            reads_before_refresh = len(reads)
            await page.get_by_role("button", name="刷新排班").click()
            await expect(surface).to_have_attribute("aria-busy", "false", timeout=15000)
            await asyncio.wait_for(wait_for_read(reads, reads_before_refresh), timeout=5)
            assert not writes, writes
            after = api.get(base + "/roster/calendar", params={
                "storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-15",
            }).json()
            assert after == before
            print(json.dumps({"verified": True, "calendarLoadedWhileTemplatesPending": True,
                              "templateFailureRetryWorked": True, "refreshReloadedTemplates": True,
                              "rosterWrites": 0,
                              "calendarDataUnchanged": True}))
        finally:
            release.set()
            await browser.close()


async def wait_for_read(reads, old_count):
    while len(reads) <= old_count:
        await asyncio.sleep(0.05)


asyncio.run(main())
