"""A transfer during an open Week board must reject a stale drag and refresh workforce."""

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
        responses = []
        workforce_reads = []
        page.on("response", lambda response: responses.append((response.status, response.json().get("validation", {}).get("code")))
                if response.request.method == "PATCH" and response.url.endswith("/roster/shifts/qa-draft-shift/reposition") else None)
        page.on("response", lambda response: workforce_reads.append(response.status)
                if response.request.method == "GET" and "/workforce/stores/browser-store/employees" in response.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        source = board.get_by_role("button", name=re.compile(r"Regular Bob 2026-10-09 QA Front"))
        target = board.locator('[data-drop-target="browser-regular:2026-10-10"]')
        source.scroll_into_view_if_needed()
        target.scroll_into_view_if_needed()
        source_box = source.bounding_box()
        target_box = target.bounding_box()
        assert source_box and target_box
        reads_before_transfer = len(workforce_reads)
        subprocess.run(["node", "scripts/seed-former-employee-browser.mjs"], cwd=workspace, check=True, capture_output=True, text=True)
        page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + target_box["height"] / 2, steps=12)
        with page.expect_response(lambda response: response.request.method == "PATCH" and response.url.endswith("/roster/shifts/qa-draft-shift/reposition")):
            page.mouse.up()
        expect(board).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(board).to_contain_text("不在当前在职名单 · 需重新分配")
        expect(board.locator('[data-drop-target="browser-regular:2026-10-10"]')).to_have_count(0)
        expect(board.get_by_role("button", name=re.compile(r"Regular Bob 2026-10-09 QA Front"))).to_be_visible()
        assert responses == [(422, "ARCHIVED_EMPLOYEE")], responses
        assert len(workforce_reads) > reads_before_transfer, workforce_reads
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行").click()
        expect(page.get_by_role("region", name="员工行排班")).to_contain_text("不在当前在职名单 · 需重新分配")
        print(json.dumps({"verified": True, "reposition": responses, "workforceRefreshed": True,
                          "formerRowVisible": True, "reloaded": True}))
    finally:
        browser.close()
