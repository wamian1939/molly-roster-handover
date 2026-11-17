"""Exercise rejected republish through the Calendar UI in disposable schemas."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Unexpected disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Unexpected disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]
base = "http://127.0.0.1:4035/api"
store = "browser-store"
period_id = "qa-published-period"


def checked_json(response, expected_status=200):
    if response.status != expected_status:
        raise AssertionError(f"Unexpected HTTP {response.status}: {response.text()}")
    return response.json()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)

        publications_url = f"{base}/roster/periods/{period_id}/publications?storeId={store}"
        before = checked_json(page.context.request.get(publications_url))
        assert len(before) == 1, before
        publication_id = before[0]["id"]
        detail_url = f"{base}/roster/publications/{publication_id}?storeId={store}&audience=manager"
        original_snapshot = checked_json(page.context.request.get(detail_url))["snapshot"]

        page.goto(f"http://127.0.0.1:5177/calendar?store={store}&view=dayGridMonth&date=2026-10-16", wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        if page.get_by_role("button", name="重新打开草稿").is_visible():
            with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith(f"/{period_id}/reopen")) as reopening:
                page.get_by_role("button", name="重新打开草稿").click()
            checked_json(reopening.value)
        expect(page.get_by_role("button", name="发布本周期")).to_be_visible()

        roles = checked_json(page.context.request.get(f"{base}/roster/roles?storeId={store}&includeInactive=true"))
        role = next(item for item in roles if item["code"] == "qa-front")
        # The fixture uses a shared/system role, which the role API intentionally cannot edit.
        # Mutate only the guarded disposable schema, then exercise the publish button in Chromium.
        if role["isActive"]:
            subprocess.run(["node", str(Path(__file__).with_name("deactivate-disposable-published-role.mjs"))],
                           check=True, capture_output=True, text=True)

        with page.expect_response(lambda response: response.request.method == "POST" and response.url.endswith(f"/{period_id}/publish")) as publishing:
            page.get_by_role("button", name="发布本周期").click()
        failure = checked_json(publishing.value, 422)
        assert failure.get("validation", {}).get("code") == "INACTIVE_SHIFT_ROLE", failure
        expect(page.get_by_role("alert")).to_contain_text("岗位")
        expect(page.get_by_role("button", name="发布本周期")).to_be_visible()

        period = checked_json(page.context.request.get(f"{base}/roster/periods/{period_id}?storeId={store}"))
        after = checked_json(page.context.request.get(publications_url))
        snapshot = checked_json(page.context.request.get(detail_url))["snapshot"]
        assert period["status"] == "DRAFT" and period["version"] == 2, period
        assert len(after) == 1 and after[0]["id"] == publication_id, after
        assert snapshot == original_snapshot
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.get_by_role("button", name="发布本周期")).to_be_visible()
        print(json.dumps({"verified": True, "publishStatus": 422, "errorCode": "INACTIVE_SHIFT_ROLE",
                          "periodStatus": period["status"], "periodVersion": period["version"],
                          "publicationCount": len(after), "snapshotUnchanged": True, "reloadRetainedDraft": True}))
    finally:
        browser.close()
