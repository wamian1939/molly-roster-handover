"""Exercise publication response validation against disposable Evaluate/Roster data."""

import json
import re
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
resume_publish = sys.argv[1:] == ["--resume-publish"]
assert not sys.argv[1:] or resume_publish
api = "http://127.0.0.1:4035/api/roster"
period_url = f"{api}/periods/qa-published-period?storeId=browser-store"
publications_url = f"{api}/periods/qa-published-period/publications?storeId=browser-store"
reopen_pattern = re.compile(r"/api/roster/periods/qa-published-period/reopen$")
publish_pattern = re.compile(r"/api/roster/periods/qa-published-period/publish$")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        if not resume_publish:
            settings = page.request.put(f"{api}/settings/browser-store", data={
                "storeId": "browser-store", "timezone": "Australia/Sydney",
                "openingTime": "09:00", "closingTime": "22:00", "slotIntervalMinutes": 30,
                "minimumShiftMinutes": 60, "defaultBreakMinutes": 30, "weekStartsOn": 1,
                "cycleType": "WEEK", "weeklyHourWarning": 38, "dailyHourWarning": 10,
            })
            assert settings.status in (200, 201), (settings.status, settings.text())
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-16",
                  wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)

        initial = page.request.get(period_url).json()
        archive_initial = page.request.get(publications_url).json()
        assert initial["status"] == ("DRAFT" if resume_publish else "PUBLISHED")
        assert initial["version"] == (2 if resume_publish else 1), initial
        assert len(archive_initial) == 1, archive_initial
        fake_reopen_calls = []

        def fake_reopen(route):
            fake_reopen_calls.append(route.request.url)
            route.fulfill(status=200, content_type="application/json", body=json.dumps(initial))

        if resume_publish:
            reopened = initial
        else:
            page.route(reopen_pattern, fake_reopen)
            page.get_by_role("button", name="重新打开草稿").click()
            expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=15000)
            expect(page.get_by_role("button", name="重新打开草稿")).to_be_visible(timeout=15000)
            assert page.request.get(period_url).json() == initial
            assert len(fake_reopen_calls) == 1
            page.unroute(reopen_pattern, fake_reopen)

            page.get_by_role("button", name="重新打开草稿").click()
            expect(page.get_by_text("排班已重新打开为草稿", exact=True)).to_be_visible(timeout=15000)
            reopened = page.request.get(period_url).json()
            assert reopened["status"] == "DRAFT" and reopened["version"] == 2, reopened

            availability = page.request.put(f"{api}/availability", data={
                "storeId": "browser-store", "employeeId": "browser-regular", "dates": ["2026-10-16"],
                "expectedRows": [], "entries": [{"date": "2026-10-16", "status": "AVAILABLE",
                    "startAt": "2026-10-15T22:00:00.000Z", "endAt": "2026-10-16T02:00:00.000Z"}],
            })
            assert availability.status == 200, (availability.status, availability.text())
            page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("button", name="发布本周期")).to_be_enabled(timeout=15000)

        fake_publish_calls = []

        def fake_publish(route):
            fake_publish_calls.append(route.request.url)
            route.fulfill(status=200, content_type="application/json", body=json.dumps({
                "period": {**reopened, "status": "PUBLISHED", "version": 3,
                           "publishedAt": "2026-10-27T00:00:00.000Z"},
                # A successful publish must also contain the committed archive.
            }))

        page.route(publish_pattern, fake_publish)
        page.get_by_role("button", name="发布本周期").click()
        expect(page.get_by_text("结果尚未确认", exact=True)).to_be_visible(timeout=15000)
        expect(page.get_by_role("button", name="发布本周期")).to_be_visible(timeout=15000)
        assert page.request.get(period_url).json() == reopened
        assert page.request.get(publications_url).json() == archive_initial
        assert len(fake_publish_calls) == 1
        page.unroute(publish_pattern, fake_publish)
        page.get_by_role("button", name="发布本周期").click()
        expect(page.get_by_text("排班已发布", exact=True)).to_be_visible(timeout=15000)
        committed = page.request.get(period_url).json()
        archive_committed = page.request.get(publications_url).json()
        assert committed["status"] == "PUBLISHED" and committed["version"] == 3, committed
        assert len(archive_committed) == 2, archive_committed
        print(json.dumps({"verified": True, "fakeReopen": len(fake_reopen_calls),
                          "realReopenVersion": reopened["version"],
                          "fakePublish": len(fake_publish_calls),
                          "publicationCount": len(archive_committed)}, ensure_ascii=False))
    finally:
        browser.close()
