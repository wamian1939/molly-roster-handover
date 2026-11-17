"""Check current Evaluate name against a frozen published assignment in Week rows."""

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

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        url = "http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridWeek&date=2026-10-16"
        page.goto(url, wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        expect(board).to_be_visible()
        expect(board.get_by_role("button", name="在时间轴查看 Renamed Bob")).to_be_visible()
        card = board.locator('[data-drop-target="browser-regular:2026-10-16"] [role="button"]')
        expect(card).to_be_visible()
        expect(card).to_have_attribute("aria-label", re.compile(r"^Regular Bob 2026-10-16 QA Front 09:00"))
        expect(card).to_contain_text("发布时：Regular Bob")
        assert "Renamed Bob" not in card.inner_text()
        board.screenshot(path=str(Path(__file__).resolve().parents[1] / "docs/evidence/calendar-published-employee-rename-2026-10-17.png"))
        board.get_by_placeholder("员工姓名").fill("Regular Bob")
        expect(card).to_be_visible()
        expect(board.get_by_role("button", name="在时间轴查看 Renamed Bob")).to_be_visible()
        board.screenshot(path=str(Path(__file__).resolve().parents[1] / "docs/evidence/calendar-published-name-search-2026-10-17.png"))
        board.get_by_placeholder("员工姓名").fill("")
        card.click()
        detail = page.get_by_role("dialog")
        expect(detail).to_contain_text("Regular Bob")
        assert "Renamed Bob" not in detail.inner_text()
        detail.get_by_role("button", name="关闭班次详情").click()
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行").click()
        expect(board).to_be_visible(timeout=15000)
        expect(card).to_contain_text("发布时：Regular Bob")
        assert writes == [], writes
        print(json.dumps({"verified": True, "currentRowName": "Renamed Bob", "publishedCardName": "Regular Bob",
                          "historicalNameSearch": True,
                          "publishedDetailName": "Regular Bob", "survivedReload": True, "rosterWrites": 0}))
    finally:
        browser.close()
