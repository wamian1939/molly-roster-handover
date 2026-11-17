import { describe, expect, it } from "vitest";
import type { EmployeeAvailability } from "../types/roster";
import { availabilityRowsForShift, calendarAvailabilityByCell } from "./calendarAvailability";

const row = (overrides: Partial<EmployeeAvailability>): EmployeeAvailability => ({
  id: "availability-a", employeeId: "employee-a", storeId: "store-a", date: "2026-10-09",
  startAt: "2026-10-09T09:00:00.000Z", endAt: "2026-10-09T10:00:00.000Z",
  status: "AVAILABLE", note: null, source: "MANUAL", version: 1, ...overrides,
});

describe("calendarAvailabilityByCell", () => {
  it("shows recorded available and unavailable windows without inventing coverage for an empty cell", () => {
    const result = calendarAvailabilityByCell([
      row({ startAt: "2026-10-08T22:00:00.000Z", endAt: "2026-10-09T02:00:00.000Z" }),
      row({ id: "availability-b", status: "UNAVAILABLE", startAt: "2026-10-09T03:00:00.000Z", endAt: "2026-10-09T04:00:00.000Z" }),
      row({ id: "availability-c", employeeId: "employee-b", status: "UNKNOWN", startAt: null, endAt: null }),
    ], ["2026-10-09", "2026-10-10"], "Australia/Sydney");
    expect(result.get("employee-a:2026-10-09")).toEqual([
      { status: "AVAILABLE", label: "09:00–13:00" },
      { status: "UNAVAILABLE", label: "14:00–15:00" },
    ]);
    expect(result.has("employee-a:2026-10-10")).toBe(false);
    expect(result.has("employee-b:2026-10-09")).toBe(false);
  });

  it("splits a midnight crossing by local day and keeps the next-day end clear", () => {
    const result = calendarAvailabilityByCell([
      row({ startAt: "2026-10-09T11:00:00.000Z", endAt: "2026-10-09T15:00:00.000Z" }),
    ], ["2026-10-09", "2026-10-10"], "Australia/Sydney");
    expect(result.get("employee-a:2026-10-09")).toEqual([{ status: "AVAILABLE", label: "22:00–24:00" }]);
    expect(result.get("employee-a:2026-10-10")).toEqual([{ status: "AVAILABLE", label: "00:00–02:00" }]);
  });

  it("uses local midnight across Sydney daylight-saving change", () => {
    const result = calendarAvailabilityByCell([
      row({ date: "2026-04-05", startAt: "2026-04-04T12:00:00.000Z", endAt: "2026-04-05T15:00:00.000Z" }),
    ], ["2026-04-05", "2026-04-06"], "Australia/Sydney");
    expect(result.get("employee-a:2026-04-05")).toEqual([{ status: "AVAILABLE", label: "00:00 UTC+11–24:00 UTC+10" }]);
    expect(result.get("employee-a:2026-04-06")).toEqual([{ status: "AVAILABLE", label: "00:00–01:00" }]);
  });

  it("distinguishes the two repeated Sydney 02:30 wall-clock instants", () => {
    const result = calendarAvailabilityByCell([
      row({ date: "2026-04-05", startAt: "2026-04-04T15:30:00.000Z", endAt: "2026-04-04T16:30:00.000Z" }),
    ], ["2026-04-05"], "Australia/Sydney");
    expect(result.get("employee-a:2026-04-05")).toEqual([
      { status: "AVAILABLE", label: "02:30 UTC+11–02:30 UTC+10" },
    ]);
  });

  it("labels separate windows in both repeated Sydney clock hours with their offsets", () => {
    const result = calendarAvailabilityByCell([
      row({ id: "first", date: "2026-04-05", startAt: "2026-04-04T15:15:00.000Z", endAt: "2026-04-04T15:45:00.000Z" }),
      row({ id: "second", date: "2026-04-05", startAt: "2026-04-04T16:15:00.000Z", endAt: "2026-04-04T16:45:00.000Z" }),
    ], ["2026-04-05"], "Australia/Sydney");
    expect(result.get("employee-a:2026-04-05")).toEqual([
      { status: "AVAILABLE", label: "02:15 UTC+11–02:45 UTC+11" },
      { status: "AVAILABLE", label: "02:15 UTC+10–02:45 UTC+10" },
    ]);
  });
});

describe("availabilityRowsForShift", () => {
  it("does not label Monday as outside Tuesday-only availability", () => {
    const tuesday = row({ date: "2026-10-27", startAt: "2026-10-26T23:00:00.000Z", endAt: "2026-10-27T11:00:00.000Z" });
    expect(availabilityRowsForShift([tuesday], "2026-10-26", new Date("2026-10-25T23:00:00.000Z"), new Date("2026-10-26T00:00:00.000Z"))).toEqual([]);
  });

  it("retains a previous-day overnight window covering an early shift", () => {
    const overnight = row({ date: "2026-10-09", startAt: "2026-10-09T11:00:00.000Z", endAt: "2026-10-09T16:00:00.000Z" });
    expect(availabilityRowsForShift([overnight], "2026-10-10", new Date("2026-10-09T14:00:00.000Z"), new Date("2026-10-09T15:00:00.000Z"))).toEqual([overnight]);
  });
});
