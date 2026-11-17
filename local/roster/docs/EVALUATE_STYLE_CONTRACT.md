# Evaluate Molly Style Contract

Source audit date: 2026-09-07

## Product direction

Molly Roster is a high-density manager workspace, not a marketing page and not a legacy enterprise grid. It preserves Evaluate Molly's calm premium SaaS language while increasing calendar information density.

Design dials:

- `DESIGN_VARIANCE: 4` - orderly operational layouts with selective asymmetry in summary panels.
- `MOTION_INTENSITY: 4` - short state transitions and direct feedback, no decorative loops.
- `VISUAL_DENSITY: 8` - compact calendar and picker data with strict typography and spacing hierarchy.

## Brand and typography

- Primary brand: `#e9b2b6`.
- Brand dark: `#9d5660`; brand mid: `#c97f87`; pale surfaces: `#fdf7f7`, `#faebec`, `#f4d6d8`.
- Graphite text family: `#111722`, `#1d2430`, `#303744`, `#454e5c`, `#586574`, `#647180`.
- Base surface: `#f6f7f8`; white elevated surfaces with cool grey borders.
- System sans stack: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Numbers use tabular figures. Overall score is prominent but skill fit and availability remain the stronger assignment signals.
- Light theme only for V1, matching current Evaluate and the Roster non-goal for dark mode.

## Shape and elevation

- App outer panels: 20-24px radius depending on viewport.
- Content panels: 16px radius.
- Controls and navigation items: 11-13px radius.
- Compact badges: 8-10px radius; pills only for true filter/status chips.
- Panel shadow: `0 8px 24px rgba(17, 24, 39, 0.07)`.
- Lifted overlay shadow: `0 16px 42px rgba(15, 23, 42, 0.13)`.
- Borders: cool graphite 200 equivalents, never shadow alone.

## Floating layered shell

```text
App background with 8-20px responsive gutter
  Floating sidebar (desktop)
  Floating workspace with internal scroll
  Sticky compact header (tablet/mobile)
  Floating bottom navigation (mobile)
```

- Desktop sidebar width: 84px from 1024px, 260px from 1360px, 280px from 1440px.
- Desktop shell gap: 12-18px.
- Workspace content max width may expand to 1680px for the calendar.
- The browser document must not horizontally overflow. Calendar subregions may use intentional contained scrolling at tablet sizes.
- At 390px, core Day actions, employee cards, dialog save/cancel, and navigation remain usable.

## Components

- Use Lucide React exclusively because it is the existing Evaluate icon family. Standardize `strokeWidth={1.8}` where practical.
- Use Radix Select for custom selects. Trigger height is 44px (38px only for fine-pointer compact controls), with 44px coarse-pointer fallback.
- Dialogs use a portal, `aria-modal`, focus trap, Escape handling, backdrop click when safe, body scroll lock, and focus restoration.
- Toasts use a single top-center live region. Success/error messages include text and icons, never color alone.
- Loading states use shape-matched skeletons. Empty and error states contain an actionable next step.
- Buttons have loading/disabled states and server mutations have duplicate-submit protection.

## Calendar-specific rules

- Role color determines shift event color. Employee type and Tier are small badges only.
- Time axis, dates, and hour totals use tabular figures.
- Month chips remain compact; names truncate to `A / B / +N`.
- Week/Day overlap uses columns, not occlusion.
- Drag selection uses a low-opacity brand fill, visible outline, and a textual start/end label.
- Status labels always include text: `草稿`, `已发布`, `冲突`, `可用`, `不可用`, `未提交`.
- Controls remain keyboard accessible and pointer interactions have button alternatives.

## Motion

Tokens copied as an independent local contract:

```css
--motion-fast: 160ms;
--motion-standard: 240ms;
--motion-emphasis: 640ms;
--ease-molly: cubic-bezier(.16, 1, .3, 1);
--ease-molly-soft: cubic-bezier(.22, 1, .36, 1);
```

Motion communicates state change, hierarchy, feedback, or navigation only. Animate transform and opacity. Calendar pointer movement must not use React state for continuous coordinates when a CSS variable/ref can update without tree-wide rerenders. All motion degrades to effectively instant under `prefers-reduced-motion`.

## Brand asset

The source asset is `Evaluate Molly/Molly LOGO/Molly LOGO/四叶星-黑.png`. Molly Roster keeps an independent copy under its own `src/assets` and uses it as a CSS mask so tone is controlled through semantic color. Runtime code never imports across sibling project paths.

## Content and accessibility

- User-visible product name: `Molly Roster`; subtitle: `茉莉排班系统`.
- Operational copy is concise Chinese. Raw errors, database identifiers, and stack traces never appear in UI.
- Focus rings remain high contrast. Primary controls target 44px on touch.
- Dialog and calendar keyboard paths are tested.
- Do not use em dash/en dash characters as visual separators; use Chinese punctuation, layout, or a normal hyphen for ranges.
- No decorative glows, generic equal KPI card rows, or animation that slows scheduling.

