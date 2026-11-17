"""Authenticated browser check for a Copy Week target on the wrong weekday."""

import json
import re
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
api = "http://127.0.0.1:4035/api"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1440, "height": 900}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        before_settings = page.context.request.get(f"{api}/roster/settings?storeId=browser-store")
        if before_settings.status != 200 or before_settings.json().get("settings") is not None:
            raise AssertionError("Expected the disposable store to have no saved Settings")
        default_period = page.context.request.post(f"{api}/roster/periods", data={
            "storeId": "browser-store", "startDate": "2026-11-03", "endDate": "2026-11-09", "cycleType": "WEEK",
        })
        if default_period.status != 400 or default_period.json().get("validation", {}).get("code") != "INVALID_TIME_RANGE":
            raise AssertionError(f"Default Monday boundary was bypassed: {default_period.status} {default_period.text()}")
        settings = page.context.request.put(f"{api}/roster/settings/browser-store", data={
            "storeId": "browser-store", "timezone": "Australia/Sydney", "openingTime": "09:00",
            "closingTime": "22:00", "slotIntervalMinutes": 30, "minimumShiftMinutes": 60,
            "defaultBreakMinutes": 30, "weekStartsOn": 1, "cycleType": "WEEK",
            "weeklyHourWarning": 38, "dailyHourWarning": 10,
        })
        if settings.status not in (200, 201):
            raise AssertionError(f"Could not set disposable store rules: {settings.status} {settings.text()}")
        invalid = {"storeId": "browser-store", "sourcePeriodId": "qa-published-period",
                   "targetStartDate": "2026-10-20"}
        preview = page.context.request.post(f"{api}/roster/batch/copy/preview", data=invalid)
        body = preview.json()
        if preview.status != 200 or body.get("canCopy") or body.get("readyShifts") != 0 or not any(
            issue.get("code") == "INVALID_TIME_RANGE" for issue in body.get("issues", [])
        ):
            raise AssertionError(f"Misaligned target was not blocked in preview: {preview.status} {body}")
        commit = page.context.request.post(f"{api}/roster/batch/copy", data={
            **invalid, "expectedSourcePeriodVersion": body["sourcePeriodVersion"],
        })
        if commit.status != 400 or commit.json().get("validation", {}).get("code") != "INVALID_TIME_RANGE":
            raise AssertionError(f"Misaligned target was not rejected on commit: {commit.status} {commit.text()}")
        valid = page.context.request.post(f"{api}/roster/batch/copy/preview", data={
            **invalid, "targetStartDate": "2026-10-19",
        })
        if valid.status != 200 or any(issue.get("code") == "INVALID_TIME_RANGE" for issue in valid.json().get("issues", [])):
            raise AssertionError(f"Aligned target was rejected by the new boundary rule: {valid.status} {valid.text()}")
        explicit = page.context.request.post(f"{api}/roster/periods", data={
            "storeId": "browser-store", "startDate": "2026-11-03", "endDate": "2026-11-09", "cycleType": "WEEK",
        })
        if explicit.status != 400 or explicit.json().get("validation", {}).get("code") != "INVALID_TIME_RANGE":
            raise AssertionError(f"Explicit period create bypassed the weekday rule: {explicit.status} {explicit.text()}")
        page.reload(wait_until="domcontentloaded")
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        print(json.dumps({"verified": True, "invalidPreview": "INVALID_TIME_RANGE", "invalidCommitHttp": commit.status,
                          "invalidExplicitCreateHttp": explicit.status, "defaultBoundaryHttp": default_period.status,
                          "alignedBoundaryAccepted": True, "calendarReloaded": True}))
    finally:
        browser.close()
