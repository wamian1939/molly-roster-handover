"""A stalled auxiliary draft-role read must not block primary store settings."""

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

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
before = api.get(base + "/roster/settings", params={"storeId": "browser-store"}).json()


async def main():
    held = asyncio.Event()
    release = asyncio.Event()
    reads = []
    writes = []

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page(viewport={"width": 1440, "height": 1000}, locale="zh-CN")

            async def hold_inventory(route):
                reads.append(route.request.url)
                held.set()
                await release.wait()
                await route.continue_()

            await page.route("**/api/roster/roles/draft-usage?*", hold_inventory)
            page.on("request", lambda request: writes.append((request.method, request.url))
                    if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
            await page.goto("http://127.0.0.1:5178/settings", wait_until="domcontentloaded")
            await page.locator('input[autocomplete="username"]').fill(credential["username"])
            await page.locator('input[autocomplete="current-password"]').fill(credential["password"])
            await page.locator('button[type="submit"]').click()
            await asyncio.wait_for(held.wait(), timeout=15)
            opening = page.get_by_label("营业开始")
            await expect(page.get_by_role("button", name="保存规则")).to_be_enabled(timeout=10000)
            await expect(page.get_by_role("status").filter(has_text="正在重新读取待核对草稿岗位")).to_be_visible()
            await opening.fill("07:30")
            release.set()
            await expect(page.get_by_role("region", name="待核对的历史草稿岗位")).to_be_visible(timeout=10000)
            await expect(opening).to_have_value("07:30")
            assert len(reads) == 1, reads
            assert not writes, writes
            after = api.get(base + "/roster/settings", params={"storeId": "browser-store"}).json()
            assert after == before
            print(json.dumps({"verified": True, "inventoryHeldWhileSettingsEditable": True,
                              "unsavedOpeningTimeRetained": "07:30", "rosterWrites": 0,
                              "persistedSettingsUnchanged": True}))
        finally:
            release.set()
            await browser.close()


asyncio.run(main())
