"""Verify explicit unknown-name mapping in Molly's New tab on disposable services."""

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
configuration = api.get("http://127.0.0.1:4035/api/roster/availability-script/shortcuts",
                        params={"storeId": "browser-store"})
configuration.raise_for_status()
assert configuration.json()["configuration"] is None
for start, version in (("10:00", None), ("11:00", 1)):
    payload = {"storeId": "browser-store", "shortcuts": [{"code": "AA", "startTime": start, "endTime": "22:00"}]}
    if version is not None:
        payload["version"] = version
    saved = api.put("http://127.0.0.1:4035/api/roster/availability-script/shortcuts", json=payload)
    assert saved.status_code == 200, saved.text

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url
                and "/roster/availability-script/preview" not in request.url else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        opener = page.get_by_role("button", name="Edit Preset Time Slot Script")
        expect(opener).to_be_enabled(timeout=20000)
        opener.click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_role("tab", name="New: Time Slot Script").click()
        expect(dialog.get_by_label("Script", exact=True)).to_have_value("")
        expect(dialog.get_by_text("当前门店快捷码版本 2", exact=False)).to_be_visible(timeout=15000)
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_label("Script", exact=True).fill("Unknown Nickname1AA2AA34567AA\nCindy 1234567AA")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("Unknown Nickname", exact=True)).to_be_visible(timeout=15000)
        expect(dialog.get_by_text("找不到员工姓名", exact=False)).to_be_visible()
        assert not writes, writes
        chooser = dialog.get_by_label("Unknown Nickname 对应员工")
        labels = chooser.locator("option").all_text_contents()
        assert "HandoverEmployee006" in labels and "Cindy" in labels, labels
        assert not any("browser-" in label for label in labels), labels
        chooser.select_option("browser-HandoverEmployee006")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 14 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        expect(dialog.get_by_text("11:00–22:00", exact=False).first).to_be_visible()
        assert not writes, writes
        dialog.get_by_role("button", name="确认追加 14 条").click()
        expect(dialog).to_have_count(0, timeout=15000)
        expect(page.get_by_text("可用时间脚本已导入")).to_be_visible(timeout=15000)
        assert len(writes) == 1 and "/roster/availability-script/commit" in writes[0][1], writes
        check = subprocess.run(["npx.cmd", "tsx", "scripts/verify-script-new-append-browser.ts"],
                               cwd=workspace / "backend", check=True, text=True, capture_output=True)
        print(json.dumps({"result": "PASS", "rosterWrites": writes, "database": json.loads(check.stdout)}))
    finally:
        browser.close()
