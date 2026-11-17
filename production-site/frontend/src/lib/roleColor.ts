import type { CSSProperties } from "react";
import type { ShiftRole } from "../types/roster";
import { evaluateJobColor, evaluatePaletteFromColor } from "./evaluateJobColor";

const FALLBACK_ROLE_COLORS = ["#9d5660", "#2563eb", "#0f766e", "#b45309", "#7c3aed", "#047857", "#475569", "#c2410c"] as const;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeRoleColor(color: unknown, identity: string) {
  const formalColor = evaluateJobColor(color);
  if (formalColor) return formalColor;
  if (typeof color === "string" && HEX_COLOR.test(color.trim())) return color.trim().toLowerCase();
  return FALLBACK_ROLE_COLORS[stableHash(identity) % FALLBACK_ROLE_COLORS.length];
}

export function roleColor(role: Pick<ShiftRole, "id" | "code" | "colorToken">) {
  return normalizeRoleColor(role.colorToken, role.id || role.code);
}

export function roleColorStyle(role: Pick<ShiftRole, "id" | "code" | "colorToken">) {
  const color = roleColor(role);
  const palette = evaluatePaletteFromColor(color);
  return { "--role-color": color, "--shift-accent": color,
    ...(palette ? { "--shift-background": palette.background, "--shift-border": palette.border } : {}) } as CSSProperties;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

