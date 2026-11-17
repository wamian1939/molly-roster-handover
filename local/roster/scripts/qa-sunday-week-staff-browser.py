"""Verify Sunday-start Staff availability against disposable Roster and Evaluate schemas."""

import json
import re
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected Roster QA schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected Evaluate QA schema")
credential = evaluate["credentials"]["browser-admin"]
expected_dates = [f"2026-10-{day:02d}" for day in range(25, 32)]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        reads = []
        writes = []

        def capture(request):
            if "/api/roster/availability?" in request.url and request.method == "GET":
                query = parse_qs(urlparse(request.url).query)
                if query.get("employeeId") == ["browser-HandoverEmployee006"]:
                    reads.append((query.get("from", [""])[0], query.get("to", [""])[0]))
            if request.url.endswith("/api/roster/availability") and request.method == "PUT":
                writes.append(request.post_data_json)

        page.on("request", capture)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("link", name="员工与可用时间")).to_be_visible()
        page.get_by_role("link", name="员工与可用时间").click()
        expect(page.get_by_role("heading", name="员工与可用时间")).to_be_visible()
        page.get_by_role("button", name=re.compile("^HandoverEmployee006")).click()
        page.get_by_label("所在周期").fill("2026-10-27")
        cards = page.locator(".availability-day-card")
        expect(cards).to_have_count(7)
        expect(cards.first.locator("h3")).to_contain_text("10/25")
        expect(cards.last.locator("h3")).to_contain_text("10/31")
        if ("2026-10-25", "2026-10-31") not in reads:
            raise AssertionError(f"Staff did not read the Sunday-start week: {reads}")

        page.get_by_role("button", name="营业时段可用").click()
        save = page.get_by_role("button", name="保存可用时间")
        expect(save).to_be_enabled()
        with page.expect_response(lambda response: response.request.method == "PUT"
                                  and response.url.endswith("/api/roster/availability")) as response_info:
            save.click()
        response = response_info.value
        if response.status != 200:
            raise AssertionError(f"Availability save returned HTTP {response.status}")
        if len(writes) != 1 or writes[0]["dates"] != expected_dates:
            raise AssertionError("Availability save did not use the Sunday-start dates")
        if sorted({row["date"] for row in response.json()}) != expected_dates:
            raise AssertionError("Saved Availability response has the wrong dates")

        page.reload(wait_until="domcontentloaded")
        page.get_by_role("button", name=re.compile("^HandoverEmployee006")).click()
        page.get_by_label("所在周期").fill("2026-10-27")
        expect(cards).to_have_count(7)
        expect(cards.first.locator("h3")).to_contain_text("10/25")
        expect(cards.last.locator("h3")).to_contain_text("10/31")
        expect(cards.locator('.availability-slot-row')).to_have_count(7)
        print(json.dumps({"verified": True, "storeWeekStartsOn": 0, "readRange": reads[-1],
                          "savedDates": expected_dates, "reloadedRows": 7}))
    finally:
        browser.close()
