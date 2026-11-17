---
name: Molly Roster
description: A calm, high-density roster workspace for Molly Tea store managers.
colors:
  brand-soft: "#faebec"
  brand-mid: "#c97f87"
  brand-deep: "#9d5660"
  canvas: "#f6f7f8"
  surface: "#ffffff"
  border: "#d8dde2"
  ink: "#111722"
  ink-muted: "#586574"
  focus: "#2563eb"
  success: "#059669"
  warning: "#d97706"
  danger: "#dc2626"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.25
rounded:
  event: "8px"
  control: "12px"
  field: "13px"
  surface: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    padding: "0 14px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "0 12px"
    height: "44px"
---

# Design System: Molly Roster

## Overview

**Creative North Star: "The Calm Shift Board"**

Molly Roster feels like a well-run manager desk at the start of service: current information is close at hand, risks are visible before commitment, and the interface stays quiet enough for fast decisions. It is a high-density product surface, not a marketing experience. Familiar controls, compact typography and consistent state feedback let the tool disappear into the scheduling task.

The visual language continues Evaluate Molly without copying its product structure. Pink identifies Molly and selected states; graphite carries navigation, data and primary actions. The system explicitly rejects old BH Software styling, generic SaaS gradients, glassmorphism, decorative card walls and oversized rounding.

**Key Characteristics:**

- Restrained graphite surfaces with brand pink on less than 10% of a screen.
- Dense calendar information with 44px interactive targets.
- One system sans family, tabular numbers for time and score.
- Structural responsive changes at 768px, 1024px and 1360px.
- Motion limited to state feedback in 160–240ms, with reduced-motion support.

## Colors

The palette uses cool graphite neutrals and a muted rose identity accent, with conventional semantic colors reserved for status.

### Primary

- **Molly Deep Rose:** Current selection, checked options, brand markers and limited emphasis.
- **Molly Soft Rose:** Selected surfaces, calendar today and non-blocking contextual highlights.

### Secondary

- **Graphite Ink:** Primary actions, active navigation and high-priority text.

### Tertiary

- **Signal Colors:** Focus blue, success emerald, warning amber and danger red only communicate their named states.

### Neutral

- **Cool Canvas:** Application background and lower-emphasis zones.
- **White Surface:** Calendar, dialogs, settings and data work areas.
- **Graphite Border:** Dividers and control outlines.
- **Muted Ink:** Secondary labels that still meet AA contrast.

**The Pink Rarity Rule.** Brand pink occupies no more than 10% of a normal task screen. Its rarity preserves meaning.

**The State Rule.** Never use brand color to represent warning, failure or success; use the semantic token and a text label.

## Typography

**Display Font:** System UI sans with platform-native fallbacks  
**Body Font:** System UI sans with platform-native fallbacks  
**Label/Mono Font:** System UI sans; numeric data uses tabular figures

**Character:** Direct, neutral and highly legible. Weight and spacing create hierarchy without introducing a decorative display face.

### Hierarchy

- **Headline** (600, 24–30px, 1.2): Page titles only; letter spacing never tighter than -0.03em.
- **Title** (600, 18–20px, 1.3): Dialog and panel headings.
- **Body** (400–500, 14px, 1.5): Guidance and explanatory content, capped near 70ch.
- **Label** (600, 12–14px, normal case): Controls, table headings, status and metadata.

**The One-Family Rule.** Do not introduce a display font into an operational screen. Hierarchy comes from size, weight and whitespace.

## Elevation

Depth is structural and restrained. Most surfaces use tonal contrast and a 1px border; small shadows separate floating shell panels, menus, dialogs and the mobile bottom navigation only. Persistent content cards remain close to flat.

### Shadow Vocabulary

- **Panel:** A compact shadow with no more than 8px blur for shell surfaces.
- **Lift:** Reserved for dialogs and floating navigation; do not combine a wide shadow with a decorative border.

**The Flat-By-Default Rule.** Data surfaces are flat at rest. Elevation indicates an actual layer, not decoration.

## Components

### Buttons

- **Shape:** Gently curved operational control (12px), minimum 44px high.
- **Primary:** Graphite ink background, white label, horizontal padding 16px.
- **Hover / Focus:** Slight graphite lightening; 2px visible focus outline; active state moves down 1px.
- **Secondary / Ghost:** White or transparent surface with graphite border and label.

### Chips

- **Style:** Full pill only for short metadata, selection count, Tier or employee type.
- **State:** Selected chips use soft rose plus deep-rose text; warning chips use amber tint and explicit copy.

### Cards / Containers

- **Corner Style:** 12–16px for normal sections. Shell containers may reach 24px because they define the application frame.
- **Background:** White surface on cool canvas.
- **Shadow Strategy:** Flat for rows and employee cards; compact panel elevation for primary work surfaces.
- **Border:** 1px graphite border when it clarifies grouping.
- **Internal Padding:** 16px compact, 24px standard, 32px spacious desktop.

### Inputs / Fields

- **Style:** White, 1px graphite border, 13px radius, 44px minimum height.
- **Focus:** Deep-rose border plus a visible rose outline; global keyboard fallback is focus blue.
- **Error / Disabled:** Error copy is explicit and red; disabled controls retain legible text and reduce opacity only as a secondary cue.

### Navigation

Desktop uses a floating left rail, expanding from icon-only at 1024px to labels at 1360px. The active route uses graphite ink with white text. Mobile uses four primary destinations in a fixed bottom bar and places secondary destinations in the menu drawer.

### Shift Event and Staff Picker

Calendar events use the saved role color, employee names and compact time text. The staff picker paginates at 60 employees, exposes score/Tier without evaluator detail, and shows time conflict, availability and missing-skill warnings before save.

## Do's and Don'ts

### Do:

- **Do** keep every core pointer and touch control at least 44px high.
- **Do** show status through text or icon in addition to color.
- **Do** keep Month events compact and move detailed selection into the shift dialog.
- **Do** preserve current workforce data and saved roster snapshots as visibly different concepts.
- **Do** use loading, empty, error, success and stale-version states consistently.

### Don't:

- **Don't** make this look like old BH Software or a dense gray desktop form.
- **Don't** use generic SaaS gradients, glassmorphism, decorative card walls or oversized 32px-plus card rounding.
- **Don't** present Roster as a second employee, authentication or scoring system.
- **Don't** use color as the only status signal or ship native ugly select controls.
- **Don't** break the core create-and-save workflow at 1366px or 390px.
- **Don't** use colored side-stripe borders, gradient text or wide ghost-card shadows.
