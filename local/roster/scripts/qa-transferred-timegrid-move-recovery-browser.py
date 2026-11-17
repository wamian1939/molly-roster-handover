"""A stale TimeGrid move must revert and refresh after Evaluate transfers an employee."""

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
        workforce_reads = []
        page.on("response", lambda response: workforce_reads.append(response.status)
                if response.request.method == "GET" and "/workforce/stores/browser-store/employees" in response.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        event = page.locator(".fc-timegrid-event").filter(has_text="Regular Bob")
        expect(event).to_have_count(1)
        event.scroll_into_view_if_needed()
        box = event.bounding_box()
        first = page.locator('.fc-timegrid-slot[data-time="10:00:00"]').first.bounding_box()
        second = page.locator('.fc-timegrid-slot[data-time="10:30:00"]').first.bounding_box()
        assert box and first and second
        step = second["y"] - first["y"]
        assert 5 < step < 100, step
        x, y = box["x"] + box["width"] / 2, box["y"] + min(box["height"] / 2, 45)
        reads_before_transfer = len(workforce_reads)
        subprocess.run(["node", "scripts/seed-transferred-timegrid-browser.mjs", "transfer"], cwd=workspace,
                       check=True, capture_output=True, text=True)
        with page.expect_response(lambda response: response.request.method == "PATCH"
                                  and response.url.endswith("/roster/shifts/qa-draft-shift/reposition")) as response_info:
            page.mouse.move(x, y)
            page.mouse.down()
            page.mouse.move(x, y + step, steps=10)
            page.mouse.up()
        response = response_info.value
        assert response.status == 422 and response.json().get("validation", {}).get("code") == "ARCHIVED_EMPLOYEE", response.text()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        assert len(workforce_reads) > reads_before_transfer, workforce_reads
        expect(page.locator(".fc-timegrid-event").filter(has_text="Regular Bob")).to_contain_text("09:00")
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        expect(board).to_contain_text("不在当前在职名单 · 需重新分配")
        expect(board.locator('[data-drop-target="browser-regular:2026-10-10"]')).to_have_count(0)
        print(json.dumps({"verified": True, "response": response.status, "reason": "ARCHIVED_EMPLOYEE",
                          "workforceRefreshed": True, "eventReverted": True, "formerRowVisible": True}))
    finally:
        browser.close()
