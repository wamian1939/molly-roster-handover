import { describe, expect, it } from "vitest";
import { breakMinuteOptions } from "./breakMinuteOptions";

describe("break minute choices", () => {
  it("offers the BHS-observed quarter-hour choices through two hours", () => {
    expect(breakMinuteOptions(30)).toEqual([0, 15, 30, 45, 60, 75, 90, 105, 120]);
  });

  it("keeps an older nonstandard value editable without replacing it", () => {
    expect(breakMinuteOptions(150)).toEqual([0, 15, 30, 45, 60, 75, 90, 105, 120, 150]);
  });
});
