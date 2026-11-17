# Molly Roster calendar readability audit

> **Current audit verdict (2026-09-27):** Week/Day pass；Month event 隐藏员工姓名，P2。当前证据与修复要求见本文末尾的 `2026-09-27 Independent Audit Update`；此前段落仅为历史基线。

Audit date: 2026-09-10

## Current measured state

The current local Week card was measured in the real browser before this refactor:

- Event card: approximately 216 × 82 px for a one-hour shift.
- Role: 12 px.
- Time: 10.5 px.
- Break: 10 px.
- Employee name: 10.5 px.
- Layout: `flex-direction: column`, `justify-content: flex-start`, 6×5 px padding and 2 px gap.

At narrow container widths the existing CSS reduces key text to 8–8.5 px and, in the narrowest rule, to 7 px. Long events still stack all content at the top, so their lower body carries no semantic content.

## Problems

- The visual block is large because time determines its height, but typography remains small.
- Role, time, Break and names compete in one undifferentiated stack.
- Employee names are capped to a small two-line area rather than using the event body.
- Month uses the same four-row content model with a 60 px minimum height, which reduces density.
- Colour comes from each shift snapshot but has no shared validation/fallback helper.
- No active-role legend explains colour mapping.
- Very narrow overlaps solve fit by shrinking fonts below a reasonable reading size.

## View-specific target

### Month

Use a single compact row: role, time and compact Break. Keep the full employee list in the title/accessible label. Target roughly 30–34 px rather than 60 px minimum height.

### Week and Day

Use a two-region grid:

1. compact header containing role, time and Break;
2. assignment body using the remaining height with centred employee names.

Use tall/medium/short duration classes. Preserve a practical minimum font size; compress content or summarise additional names with `+N` instead of falling to 7–8 px.

## Information priority

- Tall: full role, time, full Break and all practical employee names.
- Medium: full role/time, compact Break and readable names.
- Short: role, time, first employee and `+N`; full details remain in tooltip/accessibility text.
- All text remains centred inside the event card.

## Layout and colour

- Group exact five-field matches before overlap layout.
- Preserve independent columns for any role/start/end/Break difference.
- Continue lane reuse when touching or completed events no longer overlap.
- Apply one normalised DB role colour across Month, Week, Day, Legend, role selector, staff-role filter and Staff role tags.
- Derive soft background and stronger border using CSS colour mixing; retain role text as a non-colour cue.

# 2026-09-27 Independent Audit Update

> 本节是本轮独立审计的权威结论；下方旧内容仅作为历史记录，不用于当前 Pilot 判断。

## Runtime 结论

| View | 实测 | 结论 |
|---|---|---|
| Month | 2026-09-08 09:00–10:00 event 约 116×30；role/time/break 可见，员工 `HandoverEmployee001` 不可见 | **Fail (P2)**：compact CSS 视觉隐藏 assignment body |
| Week | event 约 163×82；role/time/break/name 均可读并居中 | Pass；窄宽度在 calendar surface 内滚动 |
| Day | event 约 775×82；role/time/break/name 均可读 | Pass |
| Overlap | unit tests覆盖 2/3 完全重叠、部分重叠、touching、long/short | Pass at algorithm level；仍需 browser visual regression |
| Short shift | min slot 高度、overflow hidden、runtime guard 存在 | 没有 crash；极窄文本需 visual test |

## 关键证据

- `src/styles.css:120-127`：month compact `.shift-event-assignment-body` 被裁为 1×1；这正是姓名消失的直接原因。
- `src/styles.css:81-90`：Calendar base typography 10–13px；week/day runtime 可读，month 的信息优先级需要调整。
- `src/lib/calendarGrouping.ts:206`：grouping 严格使用 date/start/end/role/break。
- `src/components/calendar/CalendarEventContent.tsx:21-26`：invalid extendedProps 显式 fallback；不会直接读取 undefined.assignments。
- 当前真实 Chrome console 没有 Molly Roster runtime error；extension warning 已排除。

## 必须修复与回归

Month compact 应显示首名或 initials；多人显示 `A/B/+N`，空间不足时优先缩短 break，而不是完全隐藏 employee。增加 390/768/1024/1366/1920 visual assertions、长姓名、多人、重叠和 30 分钟短班次 fixtures。

---

# 2026-09-28 Remediation Verification

## Verdict

`CAL-READ-01` is **VERIFIED**. Month no longer hides the employee assignment body, while retaining a compact 30 px event height.

## Implemented presentation

- Compact Month cards display `岗位 · 首位员工 [+N]` on the first line and `HH:mm–HH:mm` on the second.
- Long role/name content uses ellipsis; the full role, time, break and employee list remain in the tooltip and accessible label.
- The implementation does not reduce text to the former 7–8 px fallback. Measured compact text is approximately 10–10.5 px at a 30 px event height.
- At mobile widths, the Month grid scrolls inside the calendar surface. This preserves useful card width without making the document itself overflow.

## Runtime evidence

| Viewport / surface | Event measurement | Visible content | Overflow result |
|---|---:|---|---|
| Desktop Month | approximately 116×30 px | `前场 · HandoverEmployee001`, `09:00–10:00` | Pass |
| Mobile Month | approximately 105×30 px | employee and time remain visible; role colour/label retained | document width equals viewport; calendar surface scrolls internally |
| Week / Day | existing two-region cards | role, time, break and employee names | Pass |

## Code evidence

- `src/components/calendar/ShiftEventCard.tsx` renders the compact role/name/time contract.
- `src/styles.css` defines `.shift-event-compact-line`, role/name ellipsis and compact time.
- The mobile rule gives `.fc-dayGridMonth-view` a stable internal width of 770 px; this is contained by `.calendar-surface`, not the page body.

## Regression requirements

- Keep assertions for a single employee, multiple employees with `+N`, long names, 30-minute shifts and overlapping events.
- At 390 px, assert employee and time remain visible and `document.scrollWidth <= viewport width`.
- Do not reintroduce visually hidden assignment text as the only employee cue.

