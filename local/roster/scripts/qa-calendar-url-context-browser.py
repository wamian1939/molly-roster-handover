"""Verify Calendar URL context survives refresh without cross-store data leakage."""

import json
import re
import tempfile
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Expected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Expected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]


def query(page):
    return {key: values[0] for key, values in parse_qs(urlparse(page.url).query).items()}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        runtime_errors = []
        server_errors = []
        page.on("pageerror", lambda error: runtime_errors.append(str(error)))
        page.on("response", lambda response: server_errors.append(f"{response.status} {response.url}")
                if response.status >= 500 and "/api/" in response.url else None)
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        writes = []
        calendar_reads = []
        page.on("request", lambda request: writes.append(request.url) if request.method in ("POST", "PUT", "PATCH", "DELETE") and "/roster/" in request.url else None)
        page.on("request", lambda request: calendar_reads.append(request.url) if "/roster/calendar?" in request.url else None)

        page.locator(".calendar-view-option").first.click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        draft_card = page.locator('.fc-daygrid-day[data-date="2026-10-09"] .fc-event').first
        expect(draft_card).to_be_visible()
        source_box = draft_card.bounding_box()
        target_box = page.locator('.fc-daygrid-day[data-date="2026-10-10"]').bounding_box()
        if not source_box or not target_box:
            raise AssertionError("Month draft drag coordinates unavailable")
        page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + target_box["height"] / 2, steps=12)
        page.mouse.up()
        expect(page.get_by_role("dialog")).to_have_count(0)
        expect(draft_card).to_be_visible()
        if writes:
            raise AssertionError(f"Saved Month card drag wrote a Shift: {writes}")
        page.get_by_role("button", name="\u4e0b\u4e00\u9875").click()
        expect(page.locator('.fc-daygrid-day[data-date="2026-11-09"]')).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        if query(page).get("view") != "dayGridMonth" or query(page).get("date") != "2026-11-01" or query(page).get("store") != "browser-store":
            raise AssertionError(f"Month navigation context not written: {page.url}")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator('.fc-daygrid-day[data-date="2026-11-09"]')).to_be_visible(timeout=15000)
        expect(page.locator(".calendar-view-option").first).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator('.fc-daygrid-day[data-date="2026-11-09"] .fc-daygrid-day-number').click()
        expect(page.locator(".fc-timegrid")).to_be_visible()
        if query(page).get("view") != "timeGridDay" or query(page).get("date") != "2026-11-09":
            raise AssertionError(f"Day focus was not written: {page.url}")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-view-option").last).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        if query(page).get("date") != "2026-11-09":
            raise AssertionError(f"Day focus was lost on reload: {page.url}")
        page.locator(".calendar-view-option").nth(1).click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        if query(page).get("view") != "timeGridWeek" or query(page).get("date") != "2026-11-09":
            raise AssertionError(f"Week focus was not written: {page.url}")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-view-option").nth(1)).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        page.locator(".calendar-view-option").first.click()
        expect(page.locator('.fc-daygrid-day[data-date="2026-11-09"]')).to_be_visible()

        page.get_by_role("combobox", name="\u95e8\u5e97").click()
        page.get_by_role("option", name="Other Store").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        if query(page).get("store") != "browser-other-store":
            raise AssertionError(f"Other Store context not written: {page.url}")
        if page.locator('.fc-daygrid-event').filter(has_text="Regular Bob").count():
            raise AssertionError("Previous store Shift leaked into Other Store")
        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("combobox", name="\u95e8\u5e97")).to_have_text("Other Store", timeout=15000)
        expect(page.locator('.fc-daygrid-day[data-date="2026-11-09"]')).to_be_visible()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        if query(page).get("store") != "browser-other-store":
            raise AssertionError(f"Other Store was lost on reload: {page.url}")

        page.goto("http://127.0.0.1:5177/calendar?store=not-a-real-store&view=invalid&date=2026-02-30", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false")
        after_invalid = query(page)
        if after_invalid.get("store") not in ("browser-store", "browser-other-store") or after_invalid.get("view") != "timeGridWeek" or after_invalid.get("date") == "2026-02-30":
            raise AssertionError(f"Invalid URL context was not normalized: {page.url}")
        if any("storeId=not-a-real-store" in url for url in calendar_reads):
            raise AssertionError("Invalid store received a Calendar API read")
        if writes:
            raise AssertionError(f"Calendar navigation issued roster mutations: {writes}")
        evaluator = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        evaluator.on("pageerror", lambda error: runtime_errors.append(str(error)))
        evaluator.on("response", lambda response: server_errors.append(f"{response.status} {response.url}")
                if response.status >= 500 and "/api/" in response.url else None)
        other_credential = evaluate["credentials"]["browser-evaluator-other"]
        evaluator.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        evaluator.locator('input[autocomplete="username"]').fill(other_credential["username"])
        evaluator.locator('input[autocomplete="current-password"]').fill(other_credential["password"])
        evaluator.locator('button[type="submit"]').click()
        expect(evaluator.locator(".calendar-surface")).to_be_visible(timeout=15000)
        evaluator_reads = []
        evaluator.on("request", lambda request: evaluator_reads.append(request.url) if "/roster/calendar?" in request.url else None)
        evaluator.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-11-01", wait_until="domcontentloaded")
        expect(evaluator.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        if query(evaluator).get("store") != "browser-other-store" or any("storeId=browser-store" in url for url in evaluator_reads):
            raise AssertionError(f"Unauthorized Calendar store was read: {evaluator.url} {evaluator_reads}")
        if runtime_errors or server_errors:
            raise AssertionError(f"Calendar runtime/API errors: {runtime_errors} {server_errors}")
        print(json.dumps({"verified": True, "monthReload": True, "weekReload": True, "dayReload": True, "otherStoreReload": True,
                          "invalidQueryRejected": True, "evaluatorStoreScope": True, "mutationRequests": len(writes),
                          "calendarReads": len(calendar_reads), "savedMonthDragWrites": 0,
                          "runtimeErrors": 0, "api5xx": 0}))
    finally:
        browser.close()
