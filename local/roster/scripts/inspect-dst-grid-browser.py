"""Read-only geometry probe for a disposable DST Calendar browser fixture."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1500, "height": 1000}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-04", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        data = []
        for clock in ["01:30:00", "02:00:00", "02:30:00", "03:00:00", "03:30:00", "14:00:00"]:
            slot = page.locator(f'.fc-timegrid-slot-lane[data-time="{clock}"]')
            slot.scroll_into_view_if_needed()
            data.append(page.evaluate("""clock => {
              const row = document.querySelector(`.fc-timegrid-slot-lane[data-time="${clock}"]`);
              const column = document.querySelector('.fc-timegrid-col[data-date="2026-10-04"]');
              const r = row.getBoundingClientRect(); const c = column.getBoundingClientRect();
              const x = c.x + c.width * .6, y = r.y + r.height * .5;
              const elements = document.elementsFromPoint(x, y).slice(0, 6).map(el => ({tag:el.tagName, cls:el.className?.baseVal ?? el.className, time:el.getAttribute('data-time'), date:el.getAttribute('data-date')}));
              return {clock, rowY:r.y, rowH:r.height, columnY:c.y, columnH:c.height, elements};
            }""", clock))
        cards = page.evaluate("""() => [...document.querySelectorAll('.fc-timegrid-event')].map(el => {
          const r=el.getBoundingClientRect();
          const lane=document.querySelector('.fc-timegrid-slot-lane[data-time="03:30:00"]')?.getBoundingClientRect();
          return {text:el.textContent?.trim().slice(0, 100), top:r.top, bottom:r.bottom, slot0330Top:lane?.top, slot0330Bottom:lane?.bottom};
        })""")
        print(json.dumps({"slots": data, "cards": cards}, ensure_ascii=False))
    finally:
        browser.close()
