"""Verify saved employee-row cards do not move, while row creation and click Edit work."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
existing_jobs = evaluate_api.get("http://127.0.0.1:4010/api/store-jobs", params={"storeId": "browser-store"})
existing_jobs.raise_for_status()
if not any(job.get("code") == "qa-front" for job in existing_jobs.json()):
    job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
        "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
    })
    assert job.status_code == 201, job.text
base = "http://127.0.0.1:4035/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
shift_url = base + "/roster/shifts/qa-draft-shift"
before = api.get(shift_url, params={"storeId": "browser-store"}).json()
period_before = api.get(base + "/roster/periods/qa-draft-period", params={"storeId": "browser-store"}).json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridWeek&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        expect(board).to_be_visible()
        page.evaluate("""() => {
          window.__savedLaneNativeDrags = 0;
          document.addEventListener('dragstart', event => {
            if (event.target instanceof Element && event.target.closest('[data-drop-target] [role="button"]')) {
              window.__savedLaneNativeDrags += 1;
            }
          }, true);
        }""")
        saved = board.locator('[data-drop-target="browser-regular:2026-10-09"] [role="button"][aria-label*="Regular Bob"]')
        expect(saved).to_be_visible()
        target = board.locator('[data-drop-target="browser-HandoverEmployee006:2026-10-10"]')
        expect(target).to_be_visible()
        saved.scroll_into_view_if_needed()
        source_box = saved.bounding_box()
        target_box = target.bounding_box()
        assert source_box and target_box
        page.mouse.move(source_box["x"] + source_box["width"] / 2, source_box["y"] + source_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(target_box["x"] + target_box["width"] / 2, target_box["y"] + 20, steps=12)
        page.mouse.up()
        expect(saved).to_be_visible()
        saved_after = saved.bounding_box()
        assert saved_after and abs(saved_after["x"] - source_box["x"]) < 1 and abs(saved_after["y"] - source_box["y"]) < 1, (source_box, saved_after)
        assert page.evaluate("window.__savedLaneNativeDrags") == 0, "Saved employee-row card started a native drag"
        assert page.evaluate("window.getSelection()?.toString() || ''") == "", "Saved employee-row card selected text"
        assert not page.get_by_role("dialog").count(), "Drag unexpectedly opened a dialog"
        assert mutations == [], mutations

        saved.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog).to_contain_text("Regular Bob")
        dialog.get_by_role("button", name="取消").click()
        if page.get_by_role("alertdialog").count():
            page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        expect(page.get_by_role("dialog")).to_have_count(0)

        target.click(position={"x": target_box["width"] / 2, "y": 20})
        add_dialog = page.get_by_role("dialog")
        expect(add_dialog).to_be_visible()
        expect(add_dialog.get_by_role("button", name=re.compile("^HandoverEmployee006 "))).to_have_attribute("aria-pressed", "true")
        add_dialog.get_by_role("button", name="取消").click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        assert mutations == [], mutations
    finally:
        browser.close()

after = api.get(shift_url, params={"storeId": "browser-store"}).json()
period_after = api.get(base + "/roster/periods/qa-draft-period", params={"storeId": "browser-store"}).json()
assert after == before and period_after == period_before
print(json.dumps({"verified": True, "savedCardDragWrites": 0, "clickEdit": True,
                  "blankEmployeeDatePrefill": "browser-HandoverEmployee006:2026-10-10", "shiftAndPeriodUnchanged": True,
                  "nativeDragStarts": 0, "textSelections": 0, "savedCardPositionUnchanged": True}))
