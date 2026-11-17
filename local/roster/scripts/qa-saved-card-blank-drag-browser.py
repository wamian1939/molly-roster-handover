"""A saved card is click-only; dragging blank Day/Week time selects an unsaved interval."""

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

evaluate_api = requests.Session()
evaluate_api.post("http://127.0.0.1:4010/api/auth/login", json=credential).raise_for_status()
job = evaluate_api.post("http://127.0.0.1:4010/api/stores/browser-store/jobs", json={
    "name": "QA Front", "code": "qa-front", "colorToken": "blue", "displayOrder": 1,
})
assert job.status_code in (201, 409), job.text

base = "http://127.0.0.1:4040/api"
api = requests.Session()
api.post(base + "/auth/login", json=credential).raise_for_status()
availability_rows = api.get(base + "/roster/availability", params={
    "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "from": "2026-10-10", "to": "2026-10-10",
}).json()
if not availability_rows:
    availability = api.put(base + "/roster/availability", json={
        "storeId": "browser-store", "employeeId": "browser-HandoverEmployee006", "dates": ["2026-10-10"],
        "expectedRows": [], "entries": [{"date": "2026-10-10", "status": "AVAILABLE",
                                      "startAt": "2026-10-09T21:00:00.000Z", "endAt": "2026-10-10T08:00:00.000Z"}],
    })
    assert availability.status_code in (200, 201), availability.text
source = api.get(base + "/roster/shifts/qa-draft-shift", params={"storeId": "browser-store"}).json()
existing = api.get(base + "/roster/calendar", params={
    "storeId": "browser-store", "from": "2026-10-10", "to": "2026-10-10",
}).json()["shifts"]
if existing:
    assert len(existing) == 1 and [assignment["employeeId"] for assignment in existing[0]["assignments"]] == ["browser-HandoverEmployee006"]
    shift_id = existing[0]["id"]
else:
    created = api.post(base + "/roster/shifts/with-period", json={
        "storeId": "browser-store", "targetStartDate": "2026-10-05", "targetEndDate": "2026-10-11",
        "date": "2026-10-10", "startAt": "2026-10-09T22:00:00.000Z",
        "endAt": "2026-10-10T02:00:00.000Z", "breakMinutes": 0,
        "shiftRoleId": source["shiftRoleId"], "employeeIds": ["browser-HandoverEmployee006"],
    })
    assert created.status_code == 201, created.text
    shift_id = created.json()["id"]
before = api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
before_period = api.get(base + "/roster/periods/qa-draft-period", params={"storeId": "browser-store"}).json()


def drag_blank(page, date):
    start = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]')
    finish = page.locator('.fc-timegrid-slot-lane[data-time="15:00:00"]')
    start.scroll_into_view_if_needed()
    first, last = start.bounding_box(), finish.bounding_box()
    assert first and last
    column = page.locator(f'.fc-timegrid-col[data-date="{date}"]')
    col_box = column.bounding_box()
    assert col_box
    x = col_box["x"] + col_box["width"] * 0.55
    page.mouse.move(x, first["y"] + 4)
    page.mouse.down()
    page.mouse.move(x, last["y"] + last["height"] - 3, steps=14)
    page.mouse.up()
    dialog = page.get_by_role("dialog")
    expect(dialog).to_be_visible(timeout=5000)
    times = dialog.locator('input[type="time"]')
    values = [times.nth(index).input_value() for index in range(2)]
    assert values == ["14:00", "15:30"], values
    dialog.get_by_role("button", name="取消").click()
    expect(dialog).to_have_count(0)
    return values


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append(request.url) if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5178/calendar?view=timeGridDay&date=2026-10-10", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        expect(page).to_have_url(re.compile(r"/calendar\?view=timeGridDay&date=2026-10-10(?:&|$)"))
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        card = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
        expect(card).to_be_visible()
        card.scroll_into_view_if_needed()
        box = card.bounding_box()
        assert box
        x, y = box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.5
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + 35, y + 70, steps=12)
        page.mouse.up()
        expect(page.get_by_role("dialog")).to_have_count(0)
        expect(card).to_be_visible()
        card.click()
        edit = page.get_by_role("dialog")
        expect(edit).to_be_visible()
        expect(edit.get_by_text("HandoverEmployee006")).to_be_visible()
        edit.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        expect(edit).to_have_count(0)

        day_values = drag_blank(page, "2026-10-10")
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        week_values = drag_blank(page, "2026-10-10")
        page.get_by_role("button", name="员工行").click()
        lane_card = page.locator('section[aria-label="员工行排班"] [role="button"][aria-label*="HandoverEmployee006 2026-10-10"]')
        expect(lane_card).to_be_visible()
        assert "cursor-grab" not in (lane_card.get_attribute("class") or "")
        lane_box = lane_card.bounding_box()
        assert lane_box
        lane_x, lane_y = lane_box["x"] + lane_box["width"] * 0.5, lane_box["y"] + lane_box["height"] * 0.5
        page.mouse.move(lane_x, lane_y)
        page.mouse.down()
        page.mouse.move(lane_x - 120, lane_y, steps=12)
        page.mouse.up()
        expect(page.get_by_role("dialog")).to_have_count(0)
        expect(lane_card).to_be_visible()
        lane_card.click()
        lane_edit = page.get_by_role("dialog")
        expect(lane_edit).to_be_visible()
        lane_edit.get_by_role("button", name="取消").click()
        page.get_by_role("alertdialog").get_by_role("button", name="放弃修改").click()
        expect(lane_edit).to_have_count(0)
        page.get_by_role("button", name="为 Cindy 在 2026-10-10 新建班次").click()
        lane_create = page.get_by_role("dialog")
        expect(lane_create).to_be_visible()
        expect(lane_create.get_by_role("button", name=re.compile("^Cindy "))).to_have_attribute("aria-pressed", "true")
        lane_create.get_by_role("button", name="取消").click()
        expect(lane_create).to_have_count(0)
        assert not mutations, mutations
        page.reload(wait_until="domcontentloaded")
        after = api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
        after_period = api.get(base + "/roster/periods/qa-draft-period", params={"storeId": "browser-store"}).json()
        assert (after["version"], after["startAt"], after["endAt"], [a["employeeId"] for a in after["assignments"]]) == (
            before["version"], before["startAt"], before["endAt"], [a["employeeId"] for a in before["assignments"]])
        assert after_period["version"] == before_period["version"]
        print(json.dumps({"verified": True, "loginDeepLinkPreserved": True,
                          "savedCardDragMutationRequests": 0, "savedCardClickOpenedDialog": True,
                          "employeeLaneCardDragMutationRequests": 0, "employeeLaneCardClickOpenedDialog": True,
                          "employeeLaneBlankCreatePrefilledEmployee": "Cindy",
                          "dayBlankSelection": day_values, "weekBlankSelection": week_values,
                          "canceledSelectionsPersisted": 0, "shiftAndPeriodVersionsUnchanged": True}))
    finally:
        browser.close()
