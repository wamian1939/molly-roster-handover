"""A failed shortcut load must not turn reference defaults into a savable store config."""

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
base = "http://127.0.0.1:4035/api"
api.post(base + "/auth/login", json=credential).raise_for_status()
configured = api.get(base + "/roster/availability-script/shortcuts", params={"storeId": "browser-store"})
configured.raise_for_status()
if configured.json()["configuration"] is None:
    saved = api.put(base + "/roster/availability-script/shortcuts", json={
        "storeId": "browser-store", "shortcuts": [{"code": "AA", "startTime": "11:00", "endTime": "21:00"}],
    })
    assert saved.status_code == 200, saved.text
else:
    assert configured.json()["configuration"]["shortcuts"] == [
        {"code": "AA", "startTime": "11:00", "endTime": "21:00"}
    ]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        shortcut_reads = []
        writes = []

        def shortcut_route(route):
            if route.request.method == "GET":
                shortcut_reads.append(route.request.url)
                # React StrictMode may mount the dialog twice in development.
                if len(shortcut_reads) <= 2:
                    route.fulfill(status=503, content_type="application/json", body='{"error":"temporary"}')
                    return
            route.continue_()

        page.route("**/api/roster/availability-script/shortcuts**", shortcut_route)
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and ("/roster/availability-script/commit" in request.url
                     or "/roster/availability-script/shortcuts" in request.url) else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        opener = page.get_by_role("button", name="Edit Preset Time Slot Script")
        expect(opener).to_be_enabled(timeout=15000)
        opener.click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("button", name="重新加载快捷码")).to_be_visible(timeout=15000)
        expect(dialog.get_by_role("button", name="保存本门店快捷码")).to_be_disabled()
        expect(dialog.get_by_role("button", name="转换脚本预览")).to_be_disabled()
        assert writes == [], writes

        dialog.get_by_role("button", name="重新加载快捷码").click()
        expect(dialog.get_by_label("开始时间 1")).to_have_value("11:00", timeout=15000)
        expect(dialog.get_by_label("结束时间 1")).to_have_value("21:00")
        expect(dialog.get_by_role("button", name="保存本门店快捷码")).to_be_disabled()
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_label("Script", exact=True).fill("HandoverEmployee006\t1AA")
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 1 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="取消").click()
        assert len(shortcut_reads) >= 3 and writes == [], (shortcut_reads, writes)
        configuration = api.get(base + "/roster/availability-script/shortcuts", params={"storeId": "browser-store"})
        configuration.raise_for_status()
        assert configuration.json()["configuration"]["shortcuts"] == [
            {"code": "AA", "startTime": "11:00", "endTime": "21:00"}
        ]
        print(json.dumps({"verified": True, "failedLoadRecovered": True,
                          "savedStoreClocks": "11:00–21:00", "importWrites": len(writes)}))
    finally:
        browser.close()
