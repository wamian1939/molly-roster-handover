"""Save a scoped Staff script through Chromium and verify its canonical employee."""

import json
import re
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
store = "browser-store"
target = sys.argv[1] if len(sys.argv) > 1 else "HandoverEmployee006"
assert target in ("HandoverEmployee006", "Cindy", "Anne (Tea) & Co")
target_id = {"HandoverEmployee006": "browser-HandoverEmployee006", "Cindy": "browser-cindy",
             "Anne (Tea) & Co": "browser-punctuation-name"}[target]
base = "http://127.0.0.1:4035/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
configuration = api.get(base + "/roster/availability-script/shortcuts", params={"storeId": store})
configuration.raise_for_status()
if configuration.json()["configuration"] is None:
    saved = api.put(base + "/roster/availability-script/shortcuts", json={"storeId": store,
        "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}]})
    assert saved.status_code == 200, saved.text
today = datetime.now(ZoneInfo("Australia/Sydney")).date()
next_monday = today + timedelta(days=7 - today.weekday())
date = next_monday.isoformat()
end_date = (next_monday + timedelta(days=6)).isoformat()
before = api.get(base + "/roster/availability", params={"storeId": store, "employeeId": target_id, "from": date, "to": end_date})
before.raise_for_status()
assert before.json() == [], before.text

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN")
        writes = []
        script_payloads = []
        page.on("request", lambda request: writes.append((request.method, request.url)) if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/availability-script/" in request.url else None)
        page.on("request", lambda request: script_payloads.append(json.loads(request.post_data)["script"])
                if request.method == "POST" and ("/availability-script/preview" in request.url or "/availability-script/commit" in request.url) else None)
        page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        card = page.locator(".staff-directory-card").filter(has_text=target)
        expect(card).to_be_visible(timeout=15000)
        card.click()
        page.get_by_role("button", name=f"Script Record Time · {target}").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("heading", name=f"Script Record Time · {target}")).to_be_visible()
        dialog.get_by_label("星期与快捷码").fill("1AA")
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 1 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
        expect(dialog.get_by_text(target, exact=True)).to_be_visible()
        dialog.get_by_role("button", name="确认追加 1 条").click()
        expect(dialog).to_have_count(0, timeout=15000)
        assert [method for method, url in writes if "/preview" in url] == ["POST"], writes
        assert [method for method, url in writes if "/commit" in url] == ["POST"], writes
        assert script_payloads[:2] == [f"{target}\t1AA", f"{target}\t1AA"], script_payloads
        page.reload()
        card = page.locator(".staff-directory-card").filter(has_text=target)
        expect(card).to_be_visible(timeout=15000)
        card.click()
        page.get_by_role("button", name=f"Script Record Time · {target}").click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("星期与快捷码").fill("1AA")
        dialog.get_by_label("我已核对本门店快捷码与时间").check()
        dialog.get_by_role("button", name="转换脚本预览").click()
        expect(dialog.get_by_text("新增 0 · 不变 1 · 冲突 0")).to_be_visible(timeout=15000)
        dialog.get_by_role("button", name="取消").click()
        after = api.get(base + "/roster/availability", params={"storeId": store, "employeeId": target_id, "from": date, "to": end_date})
        after.raise_for_status()
        rows = after.json()
        assert len(rows) == 1, rows
        assert rows[0]["employeeId"] == target_id and rows[0]["date"] == date and rows[0]["source"] == "SCRIPT", rows
        print(json.dumps({"verified": True, "date": date, "employeeId": rows[0]["employeeId"],
                          "preview": "CREATE 1", "repeatPreview": "UNCHANGED 1", "savedRows": len(rows),
                          "nameFirstPayload": script_payloads[:2],
                          "browserScriptWrites": len(writes)}, ensure_ascii=False))
    finally:
        browser.close()
