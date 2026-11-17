import { describe, expect, it } from "vitest";
import { calendarClickDurationMinutes, calendarClickEnd, calendarRangeWithinStoreHours, canCreateFromCalendarSelection } from "./calendarSelection";
import { storeDateTime } from "./storeTime";

const timezone = "Australia/Sydney";
const local = (date: string, time: string) => storeDateTime(date, time, timezone);

describe("Calendar drag-create selection boundaries", () => {
  it("prefills a clicked slot with a valid, slot-aligned minimum duration", () => {
    expect(calendarClickDurationMinutes(30, 0)).toBe(30);
    expect(calendarClickDurationMinutes(30, 60)).toBe(60);
    expect(calendarClickDurationMinutes(30, 45)).toBe(60);
  });
  it("keeps a repeated-hour click from ending at an earlier wall-clock label", () => {
    expect(calendarClickEnd(local("2026-04-05", "02:30"), 30, timezone).toISOString()).toBe("2026-04-04T16:30:00.000Z");
    expect(calendarClickEnd(local("2026-10-04", "03:30"), 30, timezone).toISOString()).toBe("2026-10-03T17:00:00.000Z");
  });
  it("accepts same-day and overnight selections within the store's minimum", () => {
    expect(canCreateFromCalendarSelection(local("2026-10-06", "10:00"), local("2026-10-06", "11:30"), timezone, 60)).toBe(true);
    expect(canCreateFromCalendarSelection(local("2026-10-06", "22:00"), local("2026-10-07", "02:00"), timezone, 60)).toBe(true);
  });

  it("blocks ranges the Shift dialog cannot represent or the backend cannot save", () => {
    expect(canCreateFromCalendarSelection(local("2026-10-06", "10:00"), local("2026-10-08", "11:30"), timezone, 0)).toBe(false);
    expect(canCreateFromCalendarSelection(local("2026-10-06", "09:00"), local("2026-10-07", "10:00"), timezone, 0)).toBe(false);
    expect(canCreateFromCalendarSelection(local("2026-10-06", "10:00"), local("2026-10-06", "10:30"), timezone, 60)).toBe(false);
  });

  it("blocks a clicked minimum duration that extends beyond store closing", () => {
    expect(calendarRangeWithinStoreHours(local("2026-10-10", "21:00"), local("2026-10-10", "22:00"), timezone, "09:00", "22:00")).toBe(true);
    expect(calendarRangeWithinStoreHours(local("2026-10-10", "21:30"), local("2026-10-10", "22:30"), timezone, "09:00", "22:00")).toBe(false);
  });

  it("uses the server's overnight operating-hour rule", () => {
    expect(calendarRangeWithinStoreHours(local("2026-10-10", "23:00"), local("2026-10-11", "01:00"), timezone, "18:00", "02:00")).toBe(true);
    expect(calendarRangeWithinStoreHours(local("2026-10-10", "00:30"), local("2026-10-10", "01:30"), timezone, "18:00", "02:00")).toBe(true);
    expect(calendarRangeWithinStoreHours(local("2026-10-10", "10:00"), local("2026-10-10", "11:30"), timezone, "18:00", "02:00")).toBe(false);
    expect(calendarRangeWithinStoreHours(local("2026-10-11", "01:30"), local("2026-10-11", "02:30"), timezone, "18:00", "02:00")).toBe(false);
  });
});
