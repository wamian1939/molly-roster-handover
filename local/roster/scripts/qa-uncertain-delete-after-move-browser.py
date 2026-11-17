"""A concurrent date move must not be mistaken for a committed delete after response loss."""

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
        delete_statuses = []
        lookup_statuses = []

        def concurrent_move_then_lose_delete(route):
            subprocess.run(["node", "scripts/move-shift-during-uncertain-delete.mjs", "move"],
                           cwd=workspace, check=True, capture_output=True, text=True)
            response = route.fetch()
            delete_statuses.append(response.status)
            route.abort("failed")

        page.route(re.compile(r"/api/roster/shifts/qa-draft-grouped-shift\?"),
                   lambda route: concurrent_move_then_lose_delete(route)
                   if route.request.method == "DELETE" else route.continue_())
        page.on("response", lambda response: lookup_statuses.append(response.status)
                if response.request.method == "GET" and "/api/roster/shifts/qa-draft-grouped-shift?" in response.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="月视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-event').first.click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_role("button", name="删除班次").click()
        dialog.get_by_role("button", name="确认删除").click()
        expect(page.get_by_text("班次仍存在", exact=True)).to_be_visible(timeout=15000)
        expect(dialog).to_contain_text("班次已被其他人修改")
        expect(dialog.get_by_role("button", name="确认删除")).to_be_disabled()
        assert delete_statuses == [409], delete_statuses
        assert lookup_statuses == [200], lookup_statuses
        dialog.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator('.fc-daygrid-day[data-date="2026-10-10"] .fc-event')).to_have_count(1)
        verification = subprocess.run(["node", "scripts/move-shift-during-uncertain-delete.mjs", "verify"],
                                      cwd=workspace, check=True, capture_output=True, text=True)
        print(json.dumps({"verified": True, "deleteResponseLost": True, "serverDeleteStatus": 409,
                          "shiftLookupStatus": 200, "database": json.loads(verification.stdout)}))
    finally:
        browser.close()
