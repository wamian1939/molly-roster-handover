"""Verify a fresh Evaluate employee departure can be repaired without closing Edit."""

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
        patches = []
        page.on("response", lambda response: patches.append(response.status)
                if response.request.method == "PATCH" and "/roster/shifts/qa-draft-shift" in response.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        available = page.context.request.put("http://127.0.0.1:4035/api/roster/availability", data={
            "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-09"],
            "expectedRows": [], "entries": [{"date": "2026-10-09", "status": "AVAILABLE",
                                          "startAt": "2026-10-08T21:00:00.000Z", "endAt": "2026-10-09T03:00:00.000Z"}],
        })
        if available.status not in (200, 201):
            raise AssertionError(f"Cannot prepare disposable Availability: {available.status} {available.text()}")
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.locator(".fc-timegrid-event").filter(has_text="Regular Bob").first.click()
        chooser = page.get_by_role("dialog")
        if chooser.get_by_role("button", name=re.compile("Regular Bob")).count():
            chooser.get_by_role("button", name=re.compile("Regular Bob")).click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_label("员工列表").get_by_role("button", name=re.compile("Regular Bob"))).to_be_visible()
        expect(dialog.get_by_role("button", name="移除 Regular Bob")).to_have_count(0)
        note = dialog.get_by_role("textbox", name="公开备注")
        note.fill("Keep note after transfer")

        subprocess.run(["node", "scripts/seed-former-employee-browser.mjs"], cwd=workspace, check=True, capture_output=True, text=True)
        dialog.locator("footer button").last.click()
        expect(dialog.get_by_role("button", name="移除 Regular Bob")).to_be_visible(timeout=15000)
        expect(note).to_have_value("Keep note after transfer")
        assert patches == [400], patches
        dialog.get_by_role("button", name="移除 Regular Bob").click()
        dialog.get_by_label("员工列表").get_by_role("button", name=re.compile("HandoverEmployee006")).click()
        dialog.locator("footer button").last.click()
        expect(dialog).to_have_count(0)
        assert patches == [400, 200], patches
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".fc-timegrid-event").filter(has_text="HandoverEmployee006")).to_be_visible()
        print(json.dumps({"verified": True, "patchStatuses": patches, "inputRetained": True,
                          "replacement": "browser-HandoverEmployee006", "reloaded": True}))
    finally:
        browser.close()
