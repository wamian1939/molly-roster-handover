"""Search a frozen published Day worklog by current or historical employee name."""

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
workspace = Path(__file__).resolve().parents[1]

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
        expect(sidebar).to_be_visible()
        employee = sidebar.locator(".calendar-scheduled-employee")
        expect(employee).to_have_count(1, timeout=15000)
        expect(employee).to_contain_text("Regular Bob")
        search = sidebar.get_by_placeholder("搜索员工姓名")

        search.fill("Renamed Bob")
        expect(employee).to_have_count(1)
        expect(employee).to_contain_text("Regular Bob")
        assert "Renamed Bob" not in employee.inner_text()
        search.fill("Regular Bob")
        expect(employee).to_have_count(1)
        employee.locator("summary").click()
        expect(employee.locator(".calendar-scheduled-worklog")).to_contain_text("QA Front")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="查看工时侧栏").click()
        sidebar = page.get_by_role("complementary", name="已排班次侧栏")
        sidebar.get_by_placeholder("搜索员工姓名").fill("Renamed Bob")
        expect(sidebar.locator(".calendar-scheduled-employee")).to_have_count(1, timeout=15000)
        check = subprocess.run(["node", "scripts/qa-published-employee-rename-db.mjs", "verify"],
                               cwd=workspace, capture_output=True, text=True, check=True)
        db = json.loads(check.stdout)
        assert db["publicationCount"] == 1 and db["publishedShiftVersion"] == 1
        assert db["publishedAssignmentName"] == "Regular Bob" and db["publicationSnapshotName"] == "Regular Bob"
        assert not writes and not errors, {"writes": writes, "errors": errors}
        print(json.dumps({"result": "PASS", "currentNameSearch": True, "historicalNameSearch": True,
                          "publishedSnapshotFrozen": True, "rosterWrites": len(writes), "pageErrors": len(errors)}))
    finally:
        browser.close()
