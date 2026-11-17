"""Save a 23.5-hour Sydney spring-forward Availability interval in Staff."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

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
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        page.get_by_role("button", name=re.compile("^HandoverEmployee006")).click()
        page.locator('input[type="date"]').fill("2027-10-03")
        card = page.locator(".availability-day-card").last
        expect(card.locator("h3")).to_contain_text("10/3", timeout=15000)
        card.get_by_role("button", name="添加第一个时间段").click()
        card.locator('input[type="time"]').nth(0).fill("01:00")
        card.locator('input[type="time"]').nth(1).fill("01:30")
        card.locator('input[type="checkbox"]').check()
        expect(card.locator(".availability-day-error")).to_have_count(0)
        save = page.get_by_role("button", name="保存可用时间")
        expect(save).to_be_enabled()
        with page.expect_response(lambda response: response.url.endswith("/roster/availability")
                                  and response.request.method == "PUT") as written:
            save.click()
        result = written.value
        assert result.status == 200, result.text()
        payload = result.request.post_data_json
        interval = next(row for row in payload["entries"] if row["date"] == "2027-10-03")
        assert (interval["startAt"], interval["endAt"]) == (
            "2027-10-02T15:00:00.000Z", "2027-10-03T14:30:00.000Z"), interval
        page.reload(wait_until="domcontentloaded")
        page.get_by_role("button", name=re.compile("^HandoverEmployee006")).click()
        page.locator('input[type="date"]').fill("2027-10-03")
        card = page.locator(".availability-day-card").last
        expect(card.locator('input[type="time"]').nth(0)).to_have_value("01:00", timeout=15000)
        expect(card.locator('input[type="time"]').nth(1)).to_have_value("01:30")
        expect(card.locator('input[type="checkbox"]')).to_be_checked()
        result = subprocess.run(["npx.cmd", "tsx", "scripts/verify-spring-forward-availability-browser.ts"],
                                cwd=Path(__file__).resolve().parents[1] / "backend", check=True,
                                text=True, capture_output=True)
        print(result.stdout.strip())
    finally:
        browser.close()
