"""Keep a previous employee's successful response pending while switching staff."""

import asyncio
import json
import re
import tempfile
from pathlib import Path

from playwright.async_api import async_playwright, expect

temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster QA schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate QA schema")
credential = evaluate["credentials"]["browser-admin"]


async def run():
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
            await page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
            await page.locator('input[autocomplete="username"]').fill(credential["username"])
            await page.locator('input[autocomplete="current-password"]').fill(credential["password"])
            await page.get_by_role("button", name="进入排班系统").click()
            await expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
            await page.get_by_role("link", name="员工与可用时间").click()
            await page.get_by_role("button", name=re.compile("^Cindy")).click()
            await page.locator('input[type="date"]').fill("2026-10-09")
            await expect(page.locator(".availability-slot-row")).to_have_count(7)

            save_seen = asyncio.Event()
            release_save = asyncio.Event()

            async def hold_success(route):
                if route.request.method != "PUT":
                    await route.continue_()
                    return
                upstream = await route.fetch()
                if upstream.status != 200:
                    raise AssertionError(f"Availability save returned {upstream.status}")
                save_seen.set()
                await release_save.wait()
                await route.fulfill(response=upstream)

            await page.route("**/api/roster/availability", hold_success)
            save = page.get_by_role("button", name="保存可用时间")
            await save.click()
            await asyncio.wait_for(save_seen.wait(), timeout=15)
            await page.get_by_role("button", name=re.compile("^HandoverEmployee006")).click()
            await expect(page.locator(".availability-day-card")).to_have_count(7)
            await expect(page.locator(".availability-slot-row")).to_have_count(0)
            release_save.set()
            await expect(save).to_be_enabled()
            await expect(page.locator(".availability-slot-row")).to_have_count(0)
            await page.reload(wait_until="domcontentloaded")
            await page.get_by_role("button", name=re.compile("^HandoverEmployee006")).click()
            await page.locator('input[type="date"]').fill("2026-10-09")
            await expect(page.locator(".availability-day-card")).to_have_count(7)
            await expect(page.locator(".availability-slot-row")).to_have_count(0)
            print(json.dumps({"verified": True, "previousEmployeeSaveCompleted": True,
                              "newEmployeeDraftStayedEmpty": True, "newEmployeeReloadStayedEmpty": True}))
        finally:
            await browser.close()


try:
    asyncio.run(run())
except Exception as error:
    print(f"QA failed: {type(error).__name__}: {str(error).splitlines()[0]}")
    raise SystemExit(1)
