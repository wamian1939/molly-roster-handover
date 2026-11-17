"""Two reviewed imports of the same script must report the second as a replay."""

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


def verify(stage):
    result = subprocess.run(["npx.cmd", "tsx", "scripts/verify-multi-employee-script-browser.ts", stage],
                            cwd=backend, check=True, text=True, capture_output=True)
    return json.loads(result.stdout)


api = requests.Session()
base = "http://127.0.0.1:4035/api"
api.post(base + "/auth/login", json=credential).raise_for_status()
configuration = api.get(base + "/roster/availability-script/shortcuts", params={"storeId": "browser-store"})
configuration.raise_for_status()
assert configuration.json()["configuration"] is None
saved = api.put(base + "/roster/availability-script/shortcuts", json={"storeId": "browser-store",
    "shortcuts": [{"code": "AA", "startTime": "10:00", "endTime": "22:00"}]})
assert saved.status_code == 200, saved.text
assert verify("before")["availabilityRows"] == 0

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        pages = [browser.new_page(viewport={"width": 1600, "height": 1050}, locale="zh-CN") for _ in range(2)]
        dialogs = []
        for page in pages:
            page.goto("http://127.0.0.1:5177/staff", wait_until="domcontentloaded")
            page.locator('input[autocomplete="username"]').fill(credential["username"])
            page.locator('input[autocomplete="current-password"]').fill(credential["password"])
            page.locator('button[type="submit"]').click()
            trigger = page.get_by_role("button", name="Edit Preset Time Slot Script")
            expect(trigger).to_be_enabled(timeout=15000)
            trigger.click()
            dialog = page.get_by_role("dialog")
            expect(dialog).to_be_visible()
            dialog.get_by_label("我已核对本门店快捷码与时间").check()
            dialog.get_by_label("Script", exact=True).fill("HandoverEmployee006\t1AA\nCindy\t2AA")
            dialog.get_by_role("button", name="转换脚本预览").click()
            expect(dialog.get_by_text("新增 2 · 不变 0 · 冲突 0")).to_be_visible(timeout=15000)
            dialogs.append(dialog)

        with pages[0].expect_response(lambda response: response.url.endswith("/roster/availability-script/commit")) as first:
            dialogs[0].get_by_role("button", name="确认追加 2 条").click()
        first_result = first.value.json()
        assert first_result["alreadyImported"] is False and first_result["created"] == 2, first_result
        expect(pages[0].get_by_text("可用时间脚本已导入")).to_be_visible(timeout=15000)

        with pages[1].expect_response(lambda response: response.url.endswith("/roster/availability-script/commit")) as second:
            dialogs[1].get_by_role("button", name="确认追加 2 条").click()
        second_result = second.value.json()
        assert second_result["alreadyImported"] is True and second_result["importId"] == first_result["importId"], second_result
        expect(pages[1].get_by_text("脚本此前已导入")).to_be_visible(timeout=15000)
        expect(pages[1].get_by_text("本次没有新增记录；此前导入新增 2 条")).to_be_visible()
        after = verify("after")
        print(json.dumps({"verified": True, "first": first_result, "replay": second_result,
                          "availabilityRows": after["availabilityRows"], "importAudits": after["importAudits"]}))
    finally:
        browser.close()
