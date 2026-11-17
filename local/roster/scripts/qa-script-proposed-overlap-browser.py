"""A joined name-code Script must flag overlap between two new adjacent-day windows."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


root = Path(__file__).resolve().parents[1]
temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
admin = evaluate["credentials"]["browser-admin"]
evaluator = evaluate["credentials"]["browser-evaluator-a"]
base = "http://127.0.0.1:4035/api"

admin_api = requests.Session()
admin_api.post(base + "/auth/login", json=admin).raise_for_status()
shortcuts = [
    {"code": "NN", "startTime": "22:00", "endTime": "02:00"},
    {"code": "AA", "startTime": "01:00", "endTime": "04:00"},
]
existing_configuration = admin_api.get(base + "/roster/availability-script/shortcuts",
                                       params={"storeId": "browser-store"})
existing_configuration.raise_for_status()
if existing_configuration.json()["configuration"] is None:
    saved = admin_api.put(base + "/roster/availability-script/shortcuts", json={
        "storeId": "browser-store", "shortcuts": shortcuts,
    })
    assert saved.status_code == 200, saved.text
    configuration = saved.json()
else:
    configuration = existing_configuration.json()["configuration"]
assert configuration["version"] == 1 and configuration["shortcuts"] == shortcuts


def verify():
    result = subprocess.run(["npx.cmd", "tsx", "scripts/verify-multi-employee-script-browser.ts", "before"],
                            cwd=root / "backend", check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


assert verify()["availabilityRows"] == 0
api = requests.Session()
api.post(base + "/auth/login", json=evaluator).raise_for_status()
for script, expected in (("Berlin1NN", {"create": 1, "unchanged": 0, "conflict": 0}),
                         ("Berlin2AA", {"create": 1, "unchanged": 0, "conflict": 0}),
                         ("Berlin1NN2AA", {"create": 0, "unchanged": 0, "conflict": 2})):
    response = api.post(base + "/roster/availability-script/preview", json={
        "storeId": "browser-store", "week": "NEXT", "script": script,
        "expectedShortcutsVersion": configuration["version"],
    })
    assert response.status_code == 200, response.text
    preview = response.json()
    assert preview["summary"] == expected, (script, preview)
    assert preview["canCommit"] is (script != "Berlin1NN2AA")
    if script == "Berlin1NN2AA":
        assert [issue["code"] for issue in preview["issues"]] == [
            "SCRIPT_WINDOW_OVERLAP", "SCRIPT_WINDOW_OVERLAP"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        errors = []
        commits = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: commits.append(request.url)
                if request.method in ("POST", "PUT", "PATCH", "DELETE")
                and (request.url.endswith("/roster/availability-script/commit")
                     or request.url.endswith("/roster/availability")) else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(evaluator["username"])
        page.locator('input[autocomplete="current-password"]').fill(evaluator["password"])
        page.locator('button[type="submit"]').click()
        opener = page.get_by_role("button", name="Edit Preset Time Slot Script")
        expect(opener).to_be_enabled(timeout=15000)
        opener.click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_label("Script", exact=True).fill("Berlin1NN2AA")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 0 · 不变 0 · 冲突 2")).to_be_visible(timeout=15000)
        expect(dialog.get_by_role("alert")).to_contain_text("与同次导入的另一时段重叠")
        expect(dialog.get_by_role("button", name="确认追加 0 条")).to_be_disabled()
        page.screenshot(path=str(root / "docs/evidence/molly-script-overlap-blocked-2026-10-21.png"), full_page=True)
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        assert not commits and not errors, {"commits": commits, "errors": errors}
        after = verify()
        assert after["availabilityRows"] == 0 and after["importAudits"] == 0
        print(json.dumps({"verified": True, "singleRowsValid": 2, "joinedConflicts": 2,
                          "commitEnabled": False, "browserWrites": len(commits),
                          "availabilityRows": after["availabilityRows"],
                          "importAudits": after["importAudits"], "pageErrors": len(errors)}))
    finally:
        browser.close()
