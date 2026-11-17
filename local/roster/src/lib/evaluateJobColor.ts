// Evaluate's StoreJobDefinition.colorToken is the authority for current job colors.
// These are the same Tailwind 50/200/800 shades used by Evaluate's StoreJobTag.
export const EVALUATE_JOB_COLORS = {
  rose: { accent: "#9f1239", background: "#fff1f2", border: "#fecdd3" },
  teal: { accent: "#115e59", background: "#f0fdfa", border: "#99f6e4" },
  violet: { accent: "#5b21b6", background: "#f5f3ff", border: "#ddd6fe" },
  amber: { accent: "#78350f", background: "#fffbeb", border: "#fde68a" },
  blue: { accent: "#1e40af", background: "#eff6ff", border: "#bfdbfe" },
  slate: { accent: "#334155", background: "#f1f5f9", border: "#cbd5e1" },
} as const;

export function evaluateJobPalette(token: unknown) {
  return typeof token === "string" && Object.hasOwn(EVALUATE_JOB_COLORS, token)
    ? EVALUATE_JOB_COLORS[token as keyof typeof EVALUATE_JOB_COLORS]
    : undefined;
}

export function evaluateJobColor(token: unknown) {
  return evaluateJobPalette(token)?.accent;
}

export function evaluatePaletteFromColor(color: string) {
  return Object.values(EVALUATE_JOB_COLORS).find((palette) => palette.accent === color.toLowerCase());
}
