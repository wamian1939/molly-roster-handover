import { describe, expect, it } from "vitest";
import { dateOnly, dateString } from "../src/validation.js";

describe("calendar dates", () => {
  it("rejects impossible calendar days instead of normalizing them", () => {
    for (const invalid of ["2026-02-30", "2026-04-31", "2026-13-01", "2025-02-29", "2026-00-10"]) {
      expect(dateString.safeParse(invalid).success).toBe(false);
      expect(() => dateOnly(invalid)).toThrow();
    }
    expect(dateString.safeParse("2024-02-29").success).toBe(true);
    expect(dateOnly("2024-02-29").toISOString()).toBe("2024-02-29T00:00:00.000Z");
  });
});
