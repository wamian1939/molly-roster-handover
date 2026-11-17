import { describe, expect, it } from "vitest";
import { normalizeRoleColor, roleColor } from "./roleColor";

describe("roleColor", () => {
  it("normalizes persisted hex colours", () => {
    expect(normalizeRoleColor("#ABCDEF", "role-1")).toBe("#abcdef");
  });

  it("uses a deterministic identity fallback for missing or invalid colours", () => {
    const first = normalizeRoleColor("", "role-stable");
    expect(first).toMatch(/^#[0-9a-f]{6}$/);
    expect(normalizeRoleColor(undefined, "role-stable")).toBe(first);
    expect(normalizeRoleColor("not-css", "role-stable")).toBe(first);
  });

  it("uses the same role colour contract across consumers", () => {
    expect(roleColor({ id: "role-1", code: "front", colorToken: "#2563EB" })).toBe("#2563eb");
  });
});

