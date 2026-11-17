import { describe, expect, it } from "vitest";
import { formatElapsedDuration, formatShiftTimeRange, netHours, rosterCycleRange, safeTimeRangeLabel, weekRange } from "./dateTime";

describe("roster date and time math", () => {
  it("shows elapsed hours and minutes without decimal rounding", () => {
    expect(formatElapsedDuration(120)).toBe("2 小时");
    expect(formatElapsedDuration(75)).toBe("1 小时 15 分钟");
    expect(formatElapsedDuration(30)).toBe("30 分钟");
  });
  it("distinguishes both occurrences of a repeated store-local hour", () => {
    expect(formatShiftTimeRange("2026-04-04T15:30:00.000Z", "2026-04-04T16:30:00.000Z", "Australia/Sydney"))
      .toBe("02:30 UTC+11–02:30 UTC+10");
  });

  it("marks a shift that ends after local midnight without changing normal cards", () => {
    expect(formatShiftTimeRange("2026-06-01T12:00:00.000Z", "2026-06-01T16:00:00.000Z", "Australia/Sydney"))
      .toBe("22:00–02:00（06-02）");
    expect(formatShiftTimeRange("2026-06-01T00:00:00.000Z", "2026-06-01T08:00:00.000Z", "Australia/Sydney"))
      .toBe("10:00–18:00");
  });

  it("calculates Monday to Sunday range", () => {
    expect(weekRange("2026-09-09")).toEqual({ startDate: "2026-09-07", endDate: "2026-09-13" });
    expect(weekRange("2026-09-09", 0)).toEqual({ startDate: "2026-09-06", endDate: "2026-09-12" });
  });

  it("anchors fortnight periods across earlier dates and Sydney DST", () => {
    const settings = { cycleType: "FORTNIGHT" as const, weekStartsOn: 1, fortnightAnchorDate: "2026-09-28" };
    expect(rosterCycleRange("2026-09-27", settings)).toEqual({ startDate: "2026-09-14", endDate: "2026-09-27", cycleType: "FORTNIGHT" });
    expect(rosterCycleRange("2026-10-04", settings)).toEqual({ startDate: "2026-09-28", endDate: "2026-10-11", cycleType: "FORTNIGHT" });
    expect(rosterCycleRange("2026-10-12", settings)).toEqual({ startDate: "2026-10-12", endDate: "2026-10-25", cycleType: "FORTNIGHT" });
    expect(() => rosterCycleRange("2026-10-12", { ...settings, fortnightAnchorDate: null })).toThrow("\u53cc\u5468\u8d77\u59cb\u65e5\u671f");
    expect(() => rosterCycleRange("2026-10-12", { ...settings, fortnightAnchorDate: "2026-02-30" })).toThrow();
    expect(() => rosterCycleRange("2026-02-30", settings)).toThrow();
  });

  it("subtracts break once from net hours", () => {
    expect(netHours("2026-09-07T09:00:00.000Z", "2026-09-07T17:00:00.000Z", 30)).toBe(7.5);
  });

  it("keeps the preview stable while a native time input is temporarily empty", () => {
    expect(safeTimeRangeLabel(new Date("invalid"), new Date("2026-09-07T10:00:00"), "", "10:00")).toBe("--:-- - 10:00");
  });
});
