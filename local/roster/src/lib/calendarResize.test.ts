import { describe, expect, it } from "vitest";
import { calendarMoveInstants, calendarResizeInstants } from "./calendarResize";

const zero = { years: 0, months: 0, days: 0, milliseconds: 0 };

describe("calendarMoveInstants", () => {
  it("retains eight elapsed hours after moving onto Sydney's fall-back date", () => {
    const result = calendarMoveInstants(
      { startAt: "2026-04-03T13:30:00.000Z", endAt: "2026-04-03T21:30:00.000Z" },
      new Date("2026-04-04T13:30:00.000Z"),
    );
    expect(result.start.toISOString()).toBe("2026-04-04T13:30:00.000Z");
    expect(result.end.toISOString()).toBe("2026-04-04T21:30:00.000Z");
  });

  it("retains eight elapsed hours after moving onto Sydney's spring-forward date", () => {
    const result = calendarMoveInstants(
      { startAt: "2026-10-02T14:30:00.000Z", endAt: "2026-10-02T22:30:00.000Z" },
      new Date("2026-10-03T14:30:00.000Z"),
    );
    expect(result.end.toISOString()).toBe("2026-10-03T22:30:00.000Z");
  });
});

describe("calendarResizeInstants", () => {
  it("applies a snapped bottom resize to the actual second 02:30 instant", () => {
    const result = calendarResizeInstants(
      { startAt: "2026-04-04T15:30:00.000Z", endAt: "2026-04-04T16:30:00.000Z" },
      { start: new Date("2026-04-04T15:30:00.000Z"), end: new Date("2026-04-04T18:00:00.000Z") },
      zero, { ...zero, milliseconds: 30 * 60_000 },
    );
    expect(result.start.toISOString()).toBe("2026-04-04T15:30:00.000Z");
    expect(result.end.toISOString()).toBe("2026-04-04T17:00:00.000Z");
  });

  it("changes only the top edge when the first 02:30 moves up one slot", () => {
    const result = calendarResizeInstants(
      { startAt: "2026-04-04T15:30:00.000Z", endAt: "2026-04-04T17:00:00.000Z" },
      { start: new Date("2026-04-04T14:00:00.000Z"), end: new Date("2026-04-04T17:00:00.000Z") },
      { ...zero, milliseconds: -30 * 60_000 }, zero,
    );
    expect(result.start.toISOString()).toBe("2026-04-04T15:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-04-04T17:00:00.000Z");
  });

  it("keeps ordinary same-day resize increments exact", () => {
    const result = calendarResizeInstants(
      { startAt: "2026-10-09T23:00:00.000Z", endAt: "2026-10-10T00:30:00.000Z" },
      { start: new Date("2026-10-09T23:00:00.000Z"), end: new Date("2026-10-10T01:00:00.000Z") },
      zero, { ...zero, milliseconds: 30 * 60_000 },
    );
    expect(result.start.toISOString()).toBe("2026-10-09T23:00:00.000Z");
    expect(result.end.toISOString()).toBe("2026-10-10T01:00:00.000Z");
  });

  it("retains FullCalendar's date-aware output for calendar-day deltas", () => {
    const changed = { start: new Date("2026-04-05T15:30:00.000Z"), end: new Date("2026-04-05T17:00:00.000Z") };
    expect(calendarResizeInstants({ startAt: "2026-04-04T15:30:00.000Z", endAt: "2026-04-04T16:30:00.000Z" },
      changed, zero, { ...zero, days: 1 })).toBe(changed);
  });
});
