"""Check that secondary Copy Day previews date changes without a manual first step."""

import json
import re
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import expect, sync_playwright


temp = Path(tempfile.gettempdir())
roster = json.loads((temp / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temp / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
api = requests.Session()
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
params = {"storeId": "browser-store", "from": "2026-10-09", "to": "2026-10-16"}
before = api.get("http://127.0.0.1:4035/api/roster/calendar", params=params).json()

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        errors = []
        writes = []
        previews = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda request: writes.append(request.url) if request.method in ("PUT", "PATCH", "DELETE") or
                request.method == "POST" and "/roster/batch/copy-day/preview" not in request.url and
                "/auth/" not in request.url else None)
        page.on("response", lambda response: previews.append(response.json()) if
                response.request.method == "POST" and response.url.endswith("/roster/batch/copy-day/preview") and
                response.status == 200 else None)
        def wait_for_preview(source, target):
            for _ in range(150):
                if any(item.get("sourceDate") == source and item.get("targetDate") == target for item in previews):
                    return
                page.wait_for_timeout(100)
            raise AssertionError(f"No automatic preview for {source} -> {target}: {previews}")

        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible(timeout=15000)
        page.get_by_role("button", name="排班操作").click()
        page.get_by_role("button", name="复制一天").click()
        dialog = page.get_by_role("dialog", name="复制一天")
        expect(dialog.get_by_text(re.compile(r"可复制 \d+/\d+ 个班次"))).to_be_visible(timeout=15000)
        dialog.get_by_label("来源日期").fill("2026-10-09")
        dialog.get_by_label("目标日期").fill("2026-10-10")
        wait_for_preview("2026-10-09", "2026-10-10")

        pending = {}
        def hold_preview(route):
            target = route.request.post_data_json["targetDate"]
            pending[target] = (route, route.fetch())

        page.route("**/roster/batch/copy-day/preview", hold_preview)
        dialog.get_by_label("目标日期").fill("2026-10-11")
        for _ in range(150):
            if "2026-10-11" in pending:
                break
            page.wait_for_timeout(100)
        assert "2026-10-11" in pending
        dialog.get_by_label("目标日期").fill("2026-10-12")
        for _ in range(150):
            if "2026-10-12" in pending:
                break
            page.wait_for_timeout(100)
        assert "2026-10-12" in pending
        pending["2026-10-11"][0].fulfill(response=pending["2026-10-11"][1])
        expect(dialog.get_by_text(re.compile(r"可复制 \d+/\d+ 个班次"))).to_have_count(0)
        pending["2026-10-12"][0].fulfill(response=pending["2026-10-12"][1])
        expect(dialog.get_by_text(re.compile(r"可复制 \d+/\d+ 个班次"))).to_be_visible(timeout=15000)
        page.unroute("**/roster/batch/copy-day/preview", hold_preview)

        def fail_preview(route):
            route.fulfill(status=503, content_type="application/json", body=json.dumps({"message": "测试预览暂不可用"}))

        page.route("**/roster/batch/copy-day/preview", fail_preview)
        dialog.get_by_label("目标日期").fill("2026-10-13")
        expect(dialog.get_by_role("alert")).to_be_visible(timeout=15000)
        preview_failure = dialog.get_by_role("alert").first.inner_text()
        expect(dialog.get_by_role("button", name="复制为草稿")).to_be_disabled()
        page.unroute("**/roster/batch/copy-day/preview", fail_preview)
        dialog.get_by_role("button", name="检查冲突").click()
        wait_for_preview("2026-10-09", "2026-10-13")
        expect(dialog.get_by_text(preview_failure, exact=True)).to_have_count(0)
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        after = api.get("http://127.0.0.1:4035/api/roster/calendar", params=params).json()
        assert before == after and not writes and not errors, {"writes": writes, "errors": errors}
        print(json.dumps({"verified": True, "automaticPreview": True, "stalePreviewDiscarded": True, "retryAfter503": True,
                          "writes": len(writes), "pageErrors": len(errors), "calendarUnchanged": True}))
    finally:
        browser.close()
