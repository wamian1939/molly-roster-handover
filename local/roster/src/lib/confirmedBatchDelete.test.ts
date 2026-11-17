import { describe, expect, it } from "vitest";
import { confirmedBatchDeleteMatches } from "./confirmedBatchDelete";

describe("batch delete confirmation", () => {
  it("accepts only the exact shift IDs that were confirmed", () => {
    expect(confirmedBatchDeleteMatches(["one", "two"], ["two", "one"])).toBe(true);
    expect(confirmedBatchDeleteMatches(["one", "two"], ["one", "three"])).toBe(false);
    expect(confirmedBatchDeleteMatches(["one", "two"], ["one", "two", "three"])).toBe(false);
    expect(confirmedBatchDeleteMatches(["one", "two"], ["one"])).toBe(false);
    expect(confirmedBatchDeleteMatches(null, ["one"])).toBe(false);
  });
});
