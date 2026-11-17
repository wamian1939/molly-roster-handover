"""Exercise the Day employee-hour card and its explicit Worklog disclosure."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
evidence = Path(__file__).resolve().parents[1] / "docs" / "evidence"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        errors = []
        page.on("request", lambda request: writes.append(request.url) if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-16",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="查看工时侧栏").click()
        sidebar = page.get_by_role("complementary", name="已排班次侧栏")
        card = sidebar.locator(".calendar-scheduled-employee")
        expect(card).to_have_count(1, timeout=15000)
        expect(card.locator(".calendar-scheduled-employee-identity")).to_contain_text("Regular Bob")
        expect(card.locator(".calendar-scheduled-employee-total")).to_contain_text("4h")
        expect(card.locator(".calendar-scheduled-employee-total")).to_contain_text("工作日 4h")
        toggle = card.locator(".calendar-scheduled-worklog-toggle")
        expect(toggle).to_be_visible()
        expect(card.locator(".calendar-scheduled-worklog")).to_be_hidden()
        toggle.click()
        expect(card).to_have_attribute("open", "")
        expect(card.locator(".calendar-scheduled-worklog")).to_contain_text("QA Front")
        page.screenshot(path=str(evidence / "molly-day-worklog-card-desktop-2026-10-21.png"))
        card.locator("summary").focus()
        card.locator("summary").press("Enter")
        expect(card.locator(".calendar-scheduled-worklog")).to_be_hidden()

        page.set_viewport_size({"width": 640, "height": 800})
        expect(toggle).to_be_visible()
        toggle.click()
        expect(card).to_have_attribute("open", "")
        expect(card.locator(".calendar-scheduled-worklog")).to_be_visible()
        expect(card.locator(".calendar-scheduled-worklog")).to_contain_text("QA Front")
        sidebar_box = sidebar.bounding_box()
        worklog_box = card.locator(".calendar-scheduled-worklog").bounding_box()
        assert sidebar_box and worklog_box and worklog_box["y"] + worklog_box["height"] <= sidebar_box["y"] + sidebar_box["height"], (
            sidebar_box, worklog_box)
        page.screenshot(path=str(evidence / "molly-day-worklog-card-narrow-2026-10-21.png"))
        assert not writes and not errors, {"writes": writes, "errors": errors}
        print(json.dumps({"result": "PASS", "employeeCards": 1, "desktopAndNarrowWorklog": True,
                          "rosterWrites": len(writes), "pageErrors": len(errors)}))
    finally:
        browser.close()
