"""Exercise the observed BHS script tabs using disposable Molly services and data."""

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
base = "http://127.0.0.1:4035/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
configuration = api.get(base + "/roster/availability-script/shortcuts", params={"storeId": "browser-store"})
configuration.raise_for_status()
if configuration.json()["configuration"] is None:
    saved = api.put(base + "/roster/availability-script/shortcuts", json={"storeId": "browser-store",
        "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}]})
    assert saved.status_code == 200, saved.text
else:
    assert configuration.json()["configuration"]["version"] == 1
    assert configuration.json()["configuration"]["shortcuts"] == [
        {"code": "AA", "startTime": "10:00", "endTime": "22:00"}]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 3093, "height": 1670}, locale="zh-CN")
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
        expect(dialog.get_by_role("tab")).to_have_count(3)
        expect(dialog.get_by_role("tab", name="Time Slot Script", exact=True)).to_have_attribute("aria-selected", "true")
        expect(dialog.get_by_label("开始时间 1")).to_have_value("10:00", timeout=15000)
        expect(dialog).to_have_css("transform", "matrix(1, 0, 0, 1, 0, 0)", timeout=15000)
        panel_box = dialog.bounding_box()
        editor_box = dialog.locator(".preset-script-editor").bounding_box()
        assert panel_box and editor_box and abs(panel_box["width"] - 1300) < 2, (panel_box, editor_box)
        assert abs(panel_box["height"] - 846.8) < 3, panel_box
        assert abs(editor_box["width"] - 352.3) < 3 and abs(editor_box["height"] - 503.7) < 3, editor_box
        dialog.screenshot(path=str(workspace / "docs/evidence/molly-script-tabs-time-2026-10-20.png"))

        dialog.get_by_label("Script", exact=True).fill("HandoverEmployee006\t1AA")
        dialog.get_by_role("tab", name="New: Time Slot Script").click()
        expect(dialog.get_by_label("Script", exact=True)).to_have_value("")
        expect(dialog.get_by_role("button", name=re.compile("确认追加"))).to_be_disabled()
        dialog.get_by_role("tab", name="Time Slot Script", exact=True).click()
        expect(dialog.get_by_label("Script", exact=True)).to_have_value("")
        assert not writes, writes

        dialog.get_by_role("tab", name="Edit Script").click()
        expect(dialog.get_by_label("快捷码 1", exact=True)).to_have_value("AA")
        expect(dialog.get_by_role("button", name=re.compile("确认追加"))).to_have_count(0)
        dialog.get_by_label("开始时间 1").fill("11:00")
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.screenshot(path=str(workspace / "docs/evidence/molly-script-tabs-edit-2026-10-20.png"))
        dialog.get_by_role("button", name="保存本门店快捷码").click()
        expect(dialog.get_by_text("当前门店快捷码版本 2", exact=False)).to_be_visible(timeout=15000)
        assert len(writes) == 1 and "/roster/availability-script/shortcuts" in writes[0][1], writes

        dialog.get_by_role("tab", name="Time Slot Script", exact=True).click()
        dialog.get_by_label("Script", exact=True).fill("HandoverEmployee006\t1AA")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 1 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        assert len(writes) == 1, writes
        check = subprocess.run(["npx.cmd", "tsx", "scripts/verify-script-tabs-browser.ts"],
                               cwd=workspace / "backend", check=True, text=True, capture_output=True)
        report = json.loads(check.stdout)
        print(json.dumps({"result": "PASS", "tabs": 3, "referenceViewport": "3093x1670",
                          "panel": panel_box, "editor": editor_box, "rosterWrites": len(writes),
                          "database": report}))
    finally:
        browser.close()
