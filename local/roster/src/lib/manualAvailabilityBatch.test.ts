import { describe, expect, it } from "vitest";
import { manualAvailabilityBatchEntries } from "./manualAvailabilityBatch";

describe("manual multi-date Availability", () => {
  it("uses each store-local date and preserves an overnight interval", () => {
    expect(manualAvailabilityBatchEntries(["2026-10-27", "2026-10-26"], "09:00", "22:00", false, "Australia/Sydney"))
      .toEqual([
        { date: "2026-10-26", status: "AVAILABLE", startAt: "2026-10-25T22:00:00.000Z", endAt: "2026-10-26T11:00:00.000Z", source: "MANUAL" },
        { date: "2026-10-27", status: "AVAILABLE", startAt: "2026-10-26T22:00:00.000Z", endAt: "2026-10-27T11:00:00.000Z", source: "MANUAL" },
      ]);
    expect(manualAvailabilityBatchEntries(["2026-10-25"], "22:00", "02:00", true, "Australia/Adelaide")[0])
      .toMatchObject({ date: "2026-10-25", startAt: "2026-10-25T11:30:00.000Z", endAt: "2026-10-25T15:30:00.000Z" });
  });

  it("rejects ambiguous and nonexistent DST wall clocks instead of silently choosing an occurrence", () => {
    expect(() => manualAvailabilityBatchEntries(["2026-04-05"], "02:30", "04:00", false, "Australia/Sydney"))
      .toThrow(/重复/);
    expect(() => manualAvailabilityBatchEntries(["2026-10-04"], "02:30", "04:00", false, "Australia/Sydney"))
      .toThrow(/不存在/);
  });

  it("rejects duplicate dates, zero duration and overlong overnight windows", () => {
    expect(() => manualAvailabilityBatchEntries(["2026-10-26", "2026-10-26"], "09:00", "22:00", false, "Australia/Sydney"))
      .toThrow(/重复/);
    expect(() => manualAvailabilityBatchEntries(["2026-10-26"], "09:00", "09:00", false, "Australia/Sydney"))
      .toThrow(/结束时间/);
    expect(() => manualAvailabilityBatchEntries(["2026-04-04"], "03:00", "03:00", true, "Australia/Sydney"))
      .toThrow(/24 小时/);
  });
});
