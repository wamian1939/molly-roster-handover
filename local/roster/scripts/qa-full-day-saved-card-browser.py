"""Saved shift cards remain click-only under the full-day Day/Week grid."""

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
api.post("http://127.0.0.1:4035/api/auth/login", json=credential).raise_for_status()
base = "http://127.0.0.1:4035/api"
before = [api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
          for shift_id in ("qa-draft-shift", "qa-draft-grouped-shift")]


def drag_saved_card(page):
    card = page.locator('.fc-timegrid-event').filter(has_text="Regular Bob")
    expect(card).to_be_visible(timeout=10000)
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
    after = card.bounding_box()
    assert after and abs(after["x"] - box["x"]) < 1 and abs(after["y"] - box["y"]) < 1, (box, after)
    assert page.evaluate("window.__savedCardNativeDrags") == 0, "Saved card started a native browser drag"
    assert page.evaluate("window.getSelection()?.toString() || ''") == "", "Saved card drag selected text"
    return card


def double_click_saved_card(page, card):
    bounds = card.bounding_box()
    assert bounds
    page.mouse.dblclick(bounds["x"] + bounds["width"] / 2, bounds["y"] + bounds["height"] / 2, delay=35)
    expect(page.get_by_role("dialog")).to_have_count(1)
    assert re.search(r"编辑班次|选择要编辑的班次", page.get_by_role("dialog").locator("h2").inner_text())
    page.reload(wait_until="domcontentloaded")
    expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
    expect(page.get_by_role("dialog")).to_have_count(0)
    arm_native_drag_probe(page)


def arm_native_drag_probe(page):
    page.evaluate("""() => {
      window.__savedCardNativeDrags = 0;
      document.addEventListener('dragstart', event => {
        if (event.target instanceof Element && event.target.closest('.fc-event')) window.__savedCardNativeDrags += 1;
      }, true);
    }""")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        mutations = []
        page.on("request", lambda request: mutations.append(request.url)
                if request.method in ("POST", "PATCH", "PUT", "DELETE") and "/roster/shifts" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-09", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        arm_native_drag_probe(page)
        day_card = drag_saved_card(page)
        double_click_saved_card(page, day_card)
        page.get_by_role("button", name="周视图").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        card = drag_saved_card(page)
        double_click_saved_card(page, card)
        card.click()
        expect(page.get_by_role("dialog")).to_be_visible()
        assert not mutations, mutations
        after = [api.get(base + "/roster/shifts/" + shift_id, params={"storeId": "browser-store"}).json()
                 for shift_id in ("qa-draft-shift", "qa-draft-grouped-shift")]
        assert after == before
        print(json.dumps({"verified": True, "dayAndWeekSavedCardDragWrites": 0,
                          "nativeDragStarts": page.evaluate("window.__savedCardNativeDrags"),
                          "textSelections": 0, "cardPositionUnchanged": True,
                          "clickOpensDetail": True, "savedCardDoubleClickOpensOneDialog": True,
                          "sourceShiftsUnchanged": True}))
    finally:
        browser.close()
