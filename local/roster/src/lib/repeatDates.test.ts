import { describe, expect, it } from "vitest";
import { repeatTargetDates } from "./repeatDates";

describe("weekly repeat dates", () => {
  it("selects weekdays by calendar date across Sydney DST", () => {
    expect(repeatTargetDates("2026-09-28", "2026-10-12", [1])).toEqual(["2026-10-05", "2026-10-12"]);
    expect(repeatTargetDates("2026-09-28", "2026-10-12", [1, 3])).toEqual(["2026-09-30", "2026-10-05", "2026-10-07", "2026-10-12"]);
  });

  it("rejects empty or excessive recurrence before preview", () => {
    expect(() => repeatTargetDates("2026-09-28", "2026-10-12", [])).toThrow();
    expect(() => repeatTargetDates("2026-09-28", "2026-10-12", [1], 1)).toThrow(/最多/);
  });
});
