"""A Day card must not open stale details while its Calendar refresh is pending."""

import asyncio
import json
import re
import tempfile
from pathlib import Path

from playwright.async_api import async_playwright, expect


async def main():
    temp = Path(tempfile.gettempdir())
    roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
    evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
    assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
    assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
    credential = evaluate["credentials"]["browser-admin"]
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
            errors = []
            writes = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on("request", lambda request: writes.append(request.url) if
                    request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/" in request.url else None)
            await page.goto("http://127.0.0.1:5177/")
            await page.locator('input[autocomplete="username"]').fill(credential["username"])
            await page.locator('input[autocomplete="current-password"]').fill(credential["password"])
            await page.get_by_role("button", name="进入排班系统").click()
            await expect(page.get_by_role("heading", name="排班日历")).to_be_visible(timeout=15000)
            await page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09")
            surface = page.locator(".calendar-surface")
            await expect(surface).to_have_attribute("aria-busy", "false", timeout=15000)
            card = page.locator(".fc-timegrid-event").first
            await expect(card).to_be_visible()
            started = asyncio.Event()
            resume = asyncio.Event()

            async def hold_calendar(route):
                started.set()
                await resume.wait()
                await route.continue_()

            await page.route("**/api/roster/calendar?*", hold_calendar)
            await page.locator(".calendar-more-actions > summary").click()
            await page.get_by_role("button", name="刷新排班").click()
            try:
                await asyncio.wait_for(started.wait(), timeout=10)
                await expect(surface).to_have_attribute("aria-busy", "true", timeout=5000)
                await card.click()
                opened_during_refresh = await page.get_by_role("dialog").count()
                await card.focus()
                await page.keyboard.press("Enter")
                opened_after_keyboard = await page.get_by_role("dialog").count()
            finally:
                resume.set()
            await expect(surface).to_have_attribute("aria-busy", "false", timeout=15000)
            assert opened_during_refresh == 0, "A stale Day card opened while refresh was pending"
            assert opened_after_keyboard == 0, "Keyboard activation opened a stale Day card while refresh was pending"
            await page.locator(".fc-timegrid-event").first.click()
            await expect(page.get_by_role("dialog")).to_be_visible()
            assert not errors and not writes, {"errors": errors, "writes": writes}
            print(json.dumps({"verified": True, "blockedStaleClick": True,
                              "blockedStaleKeyboard": True, "clickAfterRefresh": True,
                              "rosterWrites": 0, "pageErrors": 0}))
        finally:
            await browser.close()


asyncio.run(main())
