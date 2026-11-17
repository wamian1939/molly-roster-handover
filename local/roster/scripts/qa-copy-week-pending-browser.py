"""A submitted Copy Week cannot be dismissed while the server response is pending."""

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

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code in (201, 409), job.text

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
availability = api.put(base + "/roster/availability", json={
    "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-23"],
    "expectedRows": [], "entries": [{"date": "2026-10-23", "status": "AVAILABLE",
                                  "startAt": "2026-10-22T21:00:00.000Z", "endAt": "2026-10-23T03:00:00.000Z"}],
})
assert availability.status_code in (200, 201), availability.text


async def main():
    request_started = asyncio.Event()
    release_response = asyncio.Event()
    commit_statuses = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        try:
            page = await browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")

            async def hold_copy(route):
                request_started.set()
                await release_response.wait()
                response = await route.fetch()
                commit_statuses.append(response.status)
                await route.fulfill(response=response)

            await page.route("**/api/roster/batch/copy", hold_copy)
            await page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-16", wait_until="domcontentloaded")
            await page.locator('input[autocomplete="username"]').fill(credential["username"])
            await page.locator('input[autocomplete="current-password"]').fill(credential["password"])
            await page.locator('button[type="submit"]').click()
            await expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            await page.get_by_role("button", name="复制到下一周期").click()
            dialog = page.get_by_role("dialog")
            await expect(dialog.get_by_text("所有班次均可复制")).to_be_visible(timeout=15000)
            await dialog.get_by_role("button", name="复制为草稿").click()
            await asyncio.wait_for(request_started.wait(), timeout=15)
            await expect(dialog.get_by_role("button", name="取消")).to_be_disabled()
            await expect(dialog.get_by_role("button", name="复制中…")).to_be_disabled()
            await page.keyboard.press("Escape")
            await expect(dialog).to_be_visible()
            release_response.set()
            await expect(dialog).to_have_count(0, timeout=15000)
            await page.reload(wait_until="domcontentloaded")
            await expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
            target = api.get(base + "/roster/calendar", params={
                "storeId": "browser-store", "from": "2026-10-23", "to": "2026-10-23",
            })
            target.raise_for_status()
            assert len(target.json()["shifts"]) == 1
            assert commit_statuses == [201], commit_statuses
            print(json.dumps({"verified": True, "pendingCancelDisabled": True,
                              "pendingEscapeDidNotDismiss": True, "commitStatuses": commit_statuses,
                              "targetShiftsAfterReload": 1}))
        finally:
            release_response.set()
            await browser.close()


asyncio.run(main())
