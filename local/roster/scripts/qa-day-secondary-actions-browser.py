"""Current-source Day editor keeps Copy/Repeat secondary and read-only until commit."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


workspace = Path(__file__).resolve().parents[1]
temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
jobs = evaluate_api.get("http://127.0.0.1:4010/api/store-jobs", params={"storeId": "browser-store"})
jobs.raise_for_status()
if not any(job["name"] == "QA Front" and job["code"] == "qa-front" for job in jobs.json()):
    job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
        "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
    })
    assert job.status_code == 201, job.text

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
query = {"storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10"}
before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=query)
before.raise_for_status()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        writes = []
        errors = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/api/roster/" in request.url else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=timeGridDay&date=2026-10-10",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        surface = page.locator(".calendar-surface")
        expect(surface).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator(".calendar-toolbar").get_by_role("button", name=re.compile("复制|重复"))).to_have_count(0)
        card = surface.locator(".fc-event:not(.fc-event-mirror)").filter(has_text="HandoverEmployee006")
        expect(card).to_have_count(1)

        card.click()
        editor = page.get_by_role("dialog")
        expect(editor.get_by_role("heading", name="编辑班次")).to_be_visible()
        expect(editor.get_by_role("button", name="其他班次操作")).to_be_visible()
        expect(editor.get_by_role("button", name="复制班次")).to_have_count(0)
        expect(editor.get_by_role("button", name="重复班次")).to_have_count(0)
        editor.get_by_role("button", name="其他班次操作").click()
        expect(editor.get_by_role("button", name="复制班次")).to_be_visible()
        expect(editor.get_by_role("button", name="重复班次")).to_be_visible()
        editor.get_by_role("button", name="复制班次").click()
        copy = page.get_by_role("dialog")
        expect(copy.get_by_role("heading", name="复制班次")).to_be_visible()
        copy.get_by_role("button", name="取消").click()
        expect(page.get_by_role("dialog")).to_have_count(0)

        card.click()
        editor = page.get_by_role("dialog")
        editor.get_by_role("button", name="其他班次操作").click()
        editor.get_by_role("button", name="重复班次").click()
        repeat = page.get_by_role("dialog")
        expect(repeat.get_by_role("heading", name="重复班次")).to_be_visible()
        repeat.get_by_role("button", name="取消").click()
        expect(page.get_by_role("dialog")).to_have_count(0)

        after = api.get("http://127.0.0.1:4035/api/roster/calendar", params=query)
        after.raise_for_status()
        assert after.json() == before.json()
        assert not writes, writes
        assert not errors, errors
        verify = subprocess.run(["node", "scripts/verify-bhs-day-card-browser.mjs"], cwd=workspace,
                                check=True, text=True, capture_output=True)
        print(json.dumps({"verified": True, "copyAndRepeatSecondary": True,
                          "topToolbarCopyButtons": 0, "rosterWrites": 0,
                          "calendarUnchanged": True, "database": json.loads(verify.stdout)}))
    finally:
        browser.close()
