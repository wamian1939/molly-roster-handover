// Mirrors Evaluate's StoreJobTag palette. Evaluate's colorToken is the source;
// Roster stores a hex snapshot only for historical shifts and publications.
const COLORS = {
  rose: "#9f1239",
  teal: "#115e59",
  violet: "#5b21b6",
  amber: "#78350f",
  blue: "#1e40af",
  slate: "#334155",
} as const;

export function evaluateJobColor(token: unknown) {
  return typeof token === "string" && Object.hasOwn(COLORS, token) ? COLORS[token as keyof typeof COLORS] : undefined;
}
