"""Check that an existing Day card grows after overlapping fixture shifts are removed."""

import json
import re
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
assert re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"])
assert re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"])
credential = evaluate["credentials"]["browser-admin"]
backend = Path(__file__).resolve().parents[1] / "backend"


def card_metrics(page):
    card = page.locator('.fc-timegrid-event').filter(has_text="HandoverEmployee006")
    expect(card).to_be_visible(timeout=15000)
    return card.evaluate("""event => {
      const harness = event.closest('.fc-timegrid-event-harness');
      const column = event.closest('.fc-timegrid-col[data-date]');
      return {left: harness.style.left, right: harness.style.right,
        ratio: harness.getBoundingClientRect().width / column.getBoundingClientRect().width};
    }""")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/calendar?view=timeGridDay&date=2026-10-10", wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        before = card_metrics(page)
        assert before["ratio"] < 0.8, before

        result = subprocess.run(["npx.cmd", "tsx", "scripts/remove-day-overlap-browser.ts"],
                                cwd=backend, check=True, capture_output=True, text=True)
        assert json.loads(result.stdout)["removed"] == 4
        page.locator(".calendar-more-actions > summary").click()
        page.get_by_role("button", name="刷新排班").click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        expect(page.locator('.fc-timegrid-event')).to_have_count(1)
        after = card_metrics(page)
        assert after["ratio"] > 0.9, {"before": before, "after": after}
        print(json.dumps({"result": "PASS", "before": before, "after": after}))
    finally:
        browser.close()
