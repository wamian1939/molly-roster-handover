"""Exercise employee-row creation against the exact disposable local QA stack."""

import json
import re
import tempfile
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


temporary = Path(tempfile.gettempdir())
roster = json.loads((temporary / "molly-roster-calendar-name-browser.json").read_text(encoding="utf-8"))
evaluate = json.loads((temporary / "evaluate-molly-browser-acceptance.json").read_text(encoding="utf-8"))
if not re.fullmatch(r"codex_calendar_name_[0-9]+_[0-9a-f]{4}", roster["schema"]):
    raise RuntimeError("Expected the exact disposable Roster schema")
if not re.fullmatch(r"codex_browser_acceptance_[0-9]+", evaluate["schema"]):
    raise RuntimeError("Expected the exact disposable Evaluate schema")
credential = evaluate["credentials"]["browser-admin"]
evidence = Path(__file__).resolve().parent.parent / "docs" / "evidence" / "calendar-employee-row-create-2026-10-15.png"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    try:
        page = browser.new_page(viewport={"width": 1600, "height": 1100}, locale="zh-CN")
        page.goto("http://127.0.0.1:5177/", wait_until="domcontentloaded")
        page.get_by_role("textbox", name="用户名").fill(credential["username"])
        page.get_by_role("textbox", name="密码").fill(credential["password"])
        page.get_by_role("button", name="进入排班系统").click()
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()

        page.get_by_role("button", name="上一页").click()
        expect(page.get_by_text("草稿 · 可编辑 · 数据版本 1")).to_be_visible()
        page.get_by_role("button", name="员工行").click()
        page.get_by_role("button", name="为 HandoverEmployee006 在 2026-10-10 新建班次").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_role("textbox", name="开始时间")).to_have_value("09:00")
        expect(dialog.get_by_role("textbox", name="结束时间")).to_have_value("10:00")
        expect(dialog.get_by_role("button", name=re.compile("^HandoverEmployee006 "))).to_have_attribute("aria-pressed", "true")
        expect(dialog.get_by_text("10月10日星期六")).to_be_visible()
        dialog.get_by_role("textbox", name="公开备注").fill("Employee row create QA")
        dialog.get_by_role("button", name=re.compile("^保存班次")).click()
        expect(dialog).to_have_count(0)
        board = page.get_by_role("region", name="员工行排班")
        expect(board.get_by_role("button", name="HandoverEmployee006 2026-10-10 QA Front 09:00–10:00")).to_be_visible()
        expect(page.get_by_text("草稿 · 可编辑 · 数据版本 2")).to_be_visible()
        evidence.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(evidence), full_page=True)

        page.reload(wait_until="domcontentloaded")
        expect(page.get_by_role("heading", name="排班日历")).to_be_visible()
        page.get_by_role("button", name="上一页").click()
        expect(page.get_by_text("草稿 · 可编辑 · 数据版本 2")).to_be_visible()
        page.get_by_role("button", name="员工行").click()
        board = page.get_by_role("region", name="员工行排班")
        expect(board.get_by_role("button", name="HandoverEmployee006 2026-10-10 QA Front 09:00–10:00")).to_be_visible()

        board.locator('[data-drop-target="browser-cindy:2026-10-11"]').click(position={"x": 110, "y": 55})
        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()
        expect(dialog.get_by_text("10月11日星期日")).to_be_visible()
        expect(dialog.get_by_role("button", name=re.compile("^Cindy "))).to_have_attribute("aria-pressed", "true")
        dialog.get_by_role("button", name="取消").click()
        expect(dialog).to_have_count(0)
        expect(page.get_by_text("草稿 · 可编辑 · 数据版本 2")).to_be_visible()

        page.get_by_role("button", name="下一页").click()
        expect(page.get_by_text(re.compile("已发布 · 已锁定"))).to_be_visible()
        page.get_by_role("button", name="员工行").click()
        expect(page.get_by_role("button", name="为 HandoverEmployee006 在 2026-10-16 新建班次")).to_have_count(0)
        print(json.dumps({"verified": True, "savedDate": "2026-10-10", "savedEmployeeId": "browser-HandoverEmployee006", "draftVersion": 2,
                          "blankCellPrefill": "browser-cindy:2026-10-11", "publishedCreateBlocked": True, "screenshot": str(evidence)}))
    finally:
        browser.close()
