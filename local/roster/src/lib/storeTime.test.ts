import { describe, expect, it } from "vitest";
import { addCalendarDays, isStoreClockChangeDate, storeDateTime, storeDateTimeCandidates, storeParts } from "./storeTime";

describe("store-local roster time", () => {
  it("identifies both Australian clock-change dates by their real day length", () => {
    expect(isStoreClockChangeDate("2026-10-04", "Australia/Sydney")).toBe(true);
    expect(isStoreClockChangeDate("2026-04-05", "Australia/Adelaide")).toBe(true);
    expect(isStoreClockChangeDate("2026-10-05", "Australia/Sydney")).toBe(false);
  });
  it("converts Sydney clock time independently of the browser timezone", () => {
    expect(storeDateTime("2026-10-07", "09:00", "Australia/Sydney").toISOString()).toBe("2026-10-06T22:00:00.000Z");
    expect(storeParts("2026-10-06T22:00:00.000Z", "Australia/Sydney")).toEqual({ date: "2026-10-07", time: "09:00" });
    expect(storeParts("2026-10-06T22:00:00.000Z", "America/New_York")).toEqual({ date: "2026-10-06", time: "18:00" });
  });

  it("preserves local clock time after a calendar-date move across DST", () => {
    expect(addCalendarDays("2026-09-28", 7)).toBe("2026-10-05");
    expect(storeDateTime("2026-09-28", "09:00", "Australia/Sydney").toISOString()).toBe("2026-09-27T23:00:00.000Z");
    expect(storeDateTime("2026-10-05", "09:00", "Australia/Sydney").toISOString()).toBe("2026-10-04T22:00:00.000Z");
  });

  it("rejects a nonexistent clock time and chooses the earlier repeated occurrence", () => {
    expect(() => storeDateTime("2026-10-04", "02:30", "Australia/Sydney")).toThrow(/不存在/);
    expect(storeDateTime("2026-04-05", "02:30", "Australia/Sydney").toISOString()).toBe("2026-04-04T15:30:00.000Z");
    expect(storeDateTimeCandidates("2026-04-05", "02:30", "Australia/Sydney").map((value) => value.toISOString())).toEqual([
      "2026-04-04T15:30:00.000Z", "2026-04-04T16:30:00.000Z",
    ]);
    expect(storeDateTimeCandidates("2026-04-05", "02:30", "Australia/Adelaide").map((value) => value.toISOString())).toEqual([
      "2026-04-04T16:00:00.000Z", "2026-04-04T17:00:00.000Z",
    ]);
  });
});
