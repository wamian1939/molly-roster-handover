"""Verify overnight store-hour preset and failed employee switch in disposable Chromium."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster QA schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate QA schema")
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        availability_writes = []
        blocked_reads = []
        page.on("request", lambda request: availability_writes.append(request.url) if request.method == "PUT" and "/roster/availability" in request.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("link", name="员工与可用时间").click()
        page.get_by_role("button", name=re.compile("^Cindy")).click()
        page.locator('input[type="date"]').fill("2026-10-09")
        cards = page.locator(".availability-day-card")
        expect(cards).to_have_count(7)
        preset = page.get_by_role("button", name="营业时段可用")
        expect(preset).to_be_enabled()
        preset.click()
        for index in range(7):
            card = cards.nth(index)
            expect(card.locator('input[type="time"]').nth(0)).to_have_value("18:00")
            expect(card.locator('input[type="time"]').nth(1)).to_have_value("03:00")
            expect(card.locator('input[type="checkbox"]')).to_be_checked()
        save = page.get_by_role("button", name="保存可用时间")
        expect(save).to_be_enabled()
        save.click()
        expect(cards.nth(4).locator('input[type="time"]').nth(0)).to_have_value("18:00")
        page.reload(wait_until="domcontentloaded")
        page.get_by_role("button", name=re.compile("^Cindy")).click()
        page.locator('input[type="date"]').fill("2026-10-09")
        expect(cards).to_have_count(7)
        expect(cards.nth(4).locator('input[type="time"]').nth(0)).to_have_value("18:00")
        expect(cards.nth(4).locator('input[type="time"]').nth(1)).to_have_value("03:00")
        expect(cards.nth(4).locator('input[type="checkbox"]')).to_be_checked()

        def block_berlin(route):
            if "employeeId=browser-HandoverEmployee006" in route.request.url:
                blocked_reads.append(route.request.url)
                route.fulfill(status=503, content_type="application/json", body='{"message":"Availability unavailable"}')
            else:
                route.continue_()

        page.route("**/api/roster/availability?*", block_berlin)
        prior_writes = len(availability_writes)
        page.get_by_role("button", name=re.compile("^HandoverEmployee006")).click()
        expect(page.locator(".availability-day-card")).to_have_count(0)
        expect(save).to_be_disabled()
        if not blocked_reads:
            raise AssertionError("HandoverEmployee006 Availability request was not blocked")
        if len(availability_writes) != prior_writes:
            raise AssertionError("A failed employee switch sent an Availability mutation")
        page.unroute("**/api/roster/availability?*", block_berlin)
        page.get_by_role("button", name="重试可用时间").click()
        expect(save).to_be_enabled()
        expect(page.locator(".availability-day-card")).to_have_count(7)
        expect(page.locator(".availability-slot-row")).to_have_count(0)
        if len(availability_writes) != prior_writes:
            raise AssertionError("Availability retry sent a mutation")
        print(json.dumps({"verified": True, "preset": "18:00-next-day-03:00", "savedRows": 7,
                          "failedEmployeeSwitchBlocked": True, "retryRecovered": True, "availabilityWritesAfterFailure": 0}))
    except Exception as error:
        print(f"QA failed: {type(error).__name__}: {str(error).splitlines()[0]}")
        raise SystemExit(1)
    finally:
        browser.close()
