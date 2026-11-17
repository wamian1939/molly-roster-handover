"""Preview an Excel-style script with trailing blank rows and cancel without writes."""

import json
import re
import subprocess
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
backend = Path(__file__).resolve().parents[1] / "backend"


def verify():
    result = subprocess.run(["npx.cmd", "tsx", "scripts/verify-multi-employee-script-browser.ts", "before"],
                            cwd=backend, check=True, text=True, capture_output=True)
    return json.loads(result.stdout)


api = requests.Session()
base = "http://127.0.0.1:4035/api"
api.post(base + "/auth/login", json=credential).raise_for_status()
shortcuts = api.put(base + "/roster/availability-script/shortcuts", json={
    "storeId": "browser-store", "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}],
})
assert shortcuts.status_code == 200, (shortcuts.status_code, shortcuts.text)
before = verify()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        commits = []
        page.on("request", lambda request: commits.append((request.method, request.url))
                if request.method == "POST" and "/roster/availability-script/commit" in request.url else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        button = page.get_by_role("button", name="Edit Preset Time Slot Script")
        expect(button).to_be_enabled(timeout=15000)
        button.click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_label("Script", exact=True).fill("HandoverEmployee006\t1AA\n" + "\n" * 101)
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 1 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        expect(dialog.get_by_text("脚本最多 100 行")).to_have_count(0)
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        after = verify()
        assert before == after, (before, after)
        assert not commits, commits
        print(json.dumps({"verified": True, "previewCreate": 1,
                          "availabilityRows": after["availabilityRows"],
                          "importAudits": after["importAudits"], "commitRequests": len(commits)}))
    finally:
        browser.close()
