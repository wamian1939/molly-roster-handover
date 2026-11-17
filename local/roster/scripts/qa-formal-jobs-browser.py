"""Verify that a legacy local role is excluded from the actual browser workflow."""

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
api = requests.Session()
api.post("http://127.0.0.1:4040/api/auth/login", json=credential).raise_for_status()
roles = api.get("http://127.0.0.1:4040/api/roster/roles", params={"storeId": "browser-store"}).json()
assert {role["code"] for role in roles} == {"qa-front", "qa-role"}
jobs = api.get("http://127.0.0.1:4040/api/workforce/stores/browser-store/jobs").json()["jobs"]
assert [job["code"] for job in jobs] == ["qa-front"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        page.goto("http://127.0.0.1:5178/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.goto("http://127.0.0.1:5178/settings", wait_until="domcontentloaded")
        formal_jobs = page.locator('[aria-label="Evaluate 正式岗位清单"]')
        expect(formal_jobs).to_contain_text("QA Front", timeout=15000)
        expect(page.get_by_text("验收岗", exact=True)).to_have_count(0)
        assert page.get_by_text("QA Front", exact=True).count() >= 1
        page.goto("http://127.0.0.1:5178/staff", wait_until="domcontentloaded")
        staff_roles = page.get_by_role("combobox", name="按技能匹配班次角色")
        expect(staff_roles).to_be_visible(timeout=15000)
        staff_roles.click()
        expect(page.get_by_role("option", name="QA Front")).to_be_visible()
        expect(page.get_by_role("option", name="验收岗")).to_have_count(0)
        page.keyboard.press("Escape")

        page.goto("http://127.0.0.1:5178/templates", wait_until="domcontentloaded")
        expect(page.get_by_text("旧岗位：验收岗 · 需重新关联")).to_be_visible(timeout=15000)
        template_roles = page.get_by_role("combobox", name="默认岗位")
        template_roles.click()
        expect(page.get_by_role("option", name="QA Front")).to_be_visible()
        expect(page.get_by_role("option", name="验收岗")).to_have_count(0)
        page.keyboard.press("Escape")
        page.get_by_role("button", name="编辑").click()
        expect(page.get_by_role("alert")).to_contain_text("请选择当前岗位")
        expect(page.get_by_role("button", name="保存修改")).to_be_disabled()
        page.goto("http://127.0.0.1:5178/calendar?view=day&date=2026-10-09", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="新增班次").click()
        expect(page.get_by_role("heading", name="新增班次")).to_be_visible()
        expect(page.get_by_text("旧岗位模板", exact=False)).to_have_count(0)
        page.get_by_role("button", name="关闭新增班次").click()
        legacy_event = page.locator(".fc-timegrid-event").filter(has_text="旧岗位：验收岗")
        expect(legacy_event).to_have_count(1)
        legacy_event.click()
        expect(page.get_by_role("heading", name="编辑班次")).to_be_visible()
        page.get_by_role("button", name="关闭编辑班次").click()
        saved = api.get("http://127.0.0.1:4040/api/roster/shifts/qa-legacy-role-shift", params={"storeId": "browser-store"})
        saved.raise_for_status()
        assert saved.json()["roleNameSnapshot"] == "验收岗"
        print(json.dumps({"formalJobsShown": [job["code"] for job in jobs],
                          "legacyRoleInDatabase": True, "legacyRoleVisibleInSettings": False,
                          "legacyRoleSelectableInStaffOrTemplates": False, "legacyTemplateFlagged": True,
                          "legacyTemplateOfferedInCalendar": False, "legacyCalendarLabel": "旧岗位：验收岗",
                          "savedSnapshotUnchanged": True}))
    finally:
        browser.close()
