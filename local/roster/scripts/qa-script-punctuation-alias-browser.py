"""Exercise joined punctuation nickname mapping and one isolated Script commit."""

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

api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
response = api.put("http://127.0.0.1:4035/api/roster/availability-script/shortcuts", json={
    "storeId": "browser-store", "shortcuts": [{"code": "AA", "startTime": "11:00", "endTime": "22:00"}],
})
assert response.status_code == 200, response.text

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        writes = []
        errors = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/api/roster/" in request.url and "/availability-script/preview" not in request.url else None)
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        opener = page.get_by_role("button", name="Edit Preset Time Slot Script")
        expect(opener).to_be_enabled(timeout=20000)
        opener.click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_role("tab", name="New: Time Slot Script").click()
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_label("Script", exact=True).fill("Tea (Nick)1AA2AA34567AA")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("Tea (Nick)", exact=True)).to_be_visible(timeout=15000)
        chooser = dialog.get_by_label("Tea (Nick) 对应员工")
        chooser.select_option("browser-HandoverEmployee006")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 7 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        assert not writes and not errors, {"writes": writes, "errors": errors}
        dialog.get_by_role("button", name="确认追加 7 条").click()
        expect(dialog).to_have_count(0, timeout=15000)
        expect(page.get_by_text("可用时间脚本已导入")).to_be_visible(timeout=15000)
        assert len(writes) == 1 and "/availability-script/commit" in writes[0][1], writes
        verify = subprocess.run(["npx.cmd", "tsx", "scripts/verify-script-punctuation-alias-browser.ts"],
                                cwd=workspace / "backend", check=True, text=True, capture_output=True)
        print(json.dumps({"verified": True, "joinedPunctuationAlias": "Tea (Nick)",
                          "canonicalEmployeeId": "browser-HandoverEmployee006", "created": 7, "browserWrites": len(writes),
                          "pageErrors": errors, "database": json.loads(verify.stdout)}))
    finally:
        browser.close()
