"""Exercise a safe formal-role deactivate/reactivate cycle on paired QA schemas."""

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


def login(page, identity):
    credential = evaluate["credentials"][identity]
    page.goto("http://127.0.0.1:5177/settings?store=browser-store", wait_until="domcontentloaded")
    page.locator('input[autocomplete="username"]').fill(credential["username"])
    page.locator('input[autocomplete="current-password"]').fill(credential["password"])
    page.locator('button[type="submit"]').click()
    expect(page.get_by_role("heading", name="设置", exact=True)).to_be_visible(timeout=15000)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        admin = browser.new_page(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        shift_writes = []
        admin.on("request", lambda request: shift_writes.append((request.method, request.url))
                 if request.method in ("POST", "PATCH", "PUT", "DELETE")
                 and "/roster/shifts" in request.url else None)
        login(admin, "browser-admin")

        job_response = admin.request.post("http://127.0.0.1:4010/api/stores/browser-store/jobs",
                                          data={"name": "QA 可恢复岗位", "code": "qa-reactivate",
                                                "colorToken": "blue", "displayOrder": 900})
        assert job_response.status == 201, (job_response.status, job_response.text())
        role_response = admin.request.post("http://127.0.0.1:4035/api/roster/roles",
                                           data={"storeId": "browser-store", "nameZh": "QA 可恢复岗位",
                                                 "code": "qa-reactivate", "colorToken": "#2563eb",
                                                 "requiredSkillCodes": [], "displayOrder": 900})
        assert role_response.status == 201, (role_response.status, role_response.text())
        role = role_response.json()
        role_id = role["id"]
        deactivated = admin.request.patch(f"http://127.0.0.1:4035/api/roster/roles/{role_id}",
                                          data={"storeId": "browser-store", "nameZh": "QA 可恢复岗位",
                                                "colorToken": "#2563eb", "requiredSkillCodes": [],
                                                "isActive": False, "displayOrder": 900, "version": role["version"]})
        assert deactivated.status == 200, (deactivated.status, deactivated.text())
        assert deactivated.json()["isActive"] is False

        evaluator = browser.new_page(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        login(evaluator, "browser-evaluator-a")
        expect(evaluator.get_by_role("button", name="重新启用")).to_have_count(0)
        forbidden = evaluator.request.get("http://127.0.0.1:4035/api/roster/roles?storeId=browser-store&includeInactive=true")
        assert forbidden.status == 403, forbidden.status

        admin.reload(wait_until="domcontentloaded")
        reactivate = admin.get_by_role("button", name="重新启用")
        expect(reactivate).to_be_visible(timeout=15000)
        expect(admin.get_by_text("已停用，可在下方重新启用")).to_be_visible()
        reactivate.click()
        expect(admin.get_by_text("岗位已启用")).to_be_visible(timeout=15000)
        expect(admin.get_by_role("button", name="重新启用")).to_have_count(0)
        expect(admin.get_by_text("已用于排班")).to_be_visible()
        admin.reload(wait_until="domcontentloaded")
        expect(admin.get_by_text("已用于排班")).to_be_visible(timeout=15000)
        rows_response = admin.request.get("http://127.0.0.1:4035/api/roster/roles?storeId=browser-store&includeInactive=true")
        assert rows_response.status == 200, rows_response.status
        saved = next(item for item in rows_response.json() if item["id"] == role_id)
        assert saved["isActive"] is True and saved["version"] == role["version"] + 2, saved
        assert not shift_writes, shift_writes
        print(json.dumps({"verified": True, "reactivatedRoleId": role_id,
                          "roleVersion": saved["version"], "evaluatorInactiveRead": forbidden.status,
                          "shiftWrites": len(shift_writes)}))
    finally:
        browser.close()
