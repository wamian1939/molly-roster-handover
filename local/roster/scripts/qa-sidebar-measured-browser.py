"""Measure Molly's desktop sidebar against the recorded BHS geometry in isolated Chromium."""

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
evidence = Path(__file__).resolve().parents[1] / "docs" / "evidence"
evidence.mkdir(parents=True, exist_ok=True)


def measure(page):
    return page.evaluate("""() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const bounds = element.getBoundingClientRect();
        return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height};
      };
      return {sidebar: rect('.app-sidebar-panel'), navLink: rect('.app-sidebar-navigation a'),
        calendar: rect('.calendar-surface'), workspace: rect('.app-workspace-panel'),
        viewport: {width: innerWidth, height: innerHeight},
        documentWidth: document.documentElement.scrollWidth};
    }""")


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 3093, "height": 1670}, locale="zh-CN")
        writes = []
        page.on("request", lambda request: writes.append((request.method, request.url))
                if request.method in ("POST", "PATCH", "PUT", "DELETE")
                and "/roster/" in request.url else None)
        page.goto("http://127.0.0.1:5177/calendar?store=browser-store&view=dayGridMonth&date=2026-10-20",
                  wait_until="domcontentloaded")
        page.locator('input[autocomplete="username"]').fill(credential["username"])
        page.locator('input[autocomplete="current-password"]').fill(credential["password"])
        page.locator('button[type="submit"]').click()
        expect(page.locator(".calendar-surface")).to_have_attribute("aria-busy", "false", timeout=15000)
        sidebar_order = [text.strip() for text in page.locator(".app-sidebar-navigation a").all_text_contents()]
        assert sidebar_order == ["排班日历", "导出", "员工与可用时间", "排班模板", "设置", "帮助"], sidebar_order
        expanded = measure(page)
        assert abs(expanded["sidebar"]["width"] - 320) < 2, expanded
        assert abs(expanded["navLink"]["height"] - 40) < 2, expanded
        assert abs(expanded["calendar"]["x"] - 340) < 5, expanded
        assert abs(expanded["calendar"]["y"] - 143) < 5, expanded
        assert abs(expanded["calendar"]["height"] - 1458) < 5, expanded
        page.screenshot(path=str(evidence / "molly-month-sidebar-expanded-2026-10-20.png"))
        page.get_by_role("button", name="折叠侧边栏").click()
        expect(page.get_by_role("button", name="展开侧边栏")).to_be_visible()
        collapsed = measure(page)
        assert abs(collapsed["sidebar"]["width"] - 60) < 2, collapsed
        assert abs(collapsed["navLink"]["width"] - 40) < 2, collapsed
        page.screenshot(path=str(evidence / "molly-month-sidebar-collapsed-2026-10-20.png"))
        page.get_by_role("link", name="设置", exact=True).click()
        expect(page).to_have_url(re.compile(r"/settings"))
        expect(page.get_by_role("button", name="展开侧边栏")).to_be_visible()
        page.get_by_role("button", name="展开侧边栏").click()
        expect(page.get_by_role("button", name="折叠侧边栏")).to_be_visible()
        page.get_by_role("link", name="排班日历").click()
        expect(page.locator(".calendar-surface")).to_be_visible(timeout=15000)
        page.set_viewport_size({"width": 640, "height": 800})
        mobile_order = [text.strip() for text in page.locator(".app-bottom-navigation a").all_text_contents()]
        assert mobile_order == ["排班日历", "员工与可用时间", "排班模板", "导出"], mobile_order
        expect(page.get_by_role("button", name="打开导航")).to_be_visible()
        expect(page.locator(".app-sidebar-panel")).to_be_hidden()
        page.get_by_role("button", name="打开导航").click()
        expect(page.get_by_role("dialog")).to_be_visible()
        page.get_by_role("button", name="关闭导航").click()
        mobile = page.evaluate("""() => ({viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          mobileHeaderVisible: getComputedStyle(document.querySelector('.app-mobile-header')).display !== 'none'})""")
        assert mobile["documentWidth"] <= mobile["viewport"], mobile
        assert mobile["mobileHeaderVisible"] and not writes, (mobile, writes)
        print(json.dumps({"verified": True, "sidebarOrder": sidebar_order, "mobileOrder": mobile_order,
                          "expanded": expanded, "collapsed": collapsed,
                          "mobile": mobile, "rosterWrites": len(writes)}))
    finally:
        browser.close()
