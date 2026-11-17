import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCalendarResponse } from "./calendarResponse";
import { rosterRepository } from "../services/rosterRepository";

afterEach(() => vi.unstubAllGlobals());

const valid = {
  storeId: "store-1",
  from: "2037-10-12",
  to: "2037-10-18",
  periods: [{ id: "period-1", storeId: "store-1", startDate: "2037-10-12", endDate: "2037-10-18",
    cycleType: "WEEK", status: "DRAFT", version: 1, publishedAt: null }],
  shifts: [{
    id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2037-10-12",
    startAt: "2037-10-11T23:00:00.000Z", endAt: "2037-10-12T07:00:00.000Z",
    breakMinutes: 30, shiftRoleId: "role-1",
    assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "Alice" }],
  }],
};

describe("assertCalendarResponse", () => {
  it("accepts a complete shift response for the requested store and range", () => {
    expect(assertCalendarResponse(valid, "store-1", valid.from, valid.to)).toBe(valid);
  });

  it("accepts a previous-day shift that continues into the requested date with its owning period", () => {
    const carryover = { ...valid, from: "2037-10-13", to: "2037-10-13",
      shifts: [{ ...valid.shifts[0], startAt: "2037-10-12T22:00:00.000Z", endAt: "2037-10-13T07:00:00.000Z" }] };
    expect(assertCalendarResponse(carryover, "store-1", carryover.from, carryover.to)).toBe(carryover);
  });

  it("rejects a partial shift rather than silently hiding it from the calendar", () => {
    const partial = { ...valid, shifts: [{ ...valid.shifts[0], endAt: undefined }] };
    expect(() => assertCalendarResponse(partial, "store-1", valid.from, valid.to)).toThrow(/shift-1/);
  });

  it("rejects an incomplete assignment rather than displaying a shift without its employee", () => {
    const partial = { ...valid, shifts: [{ ...valid.shifts[0], assignments: [{ id: "assignment-1", employeeNameSnapshot: "Alice" }] }] };
    expect(() => assertCalendarResponse(partial, "store-1", valid.from, valid.to)).toThrow(/shift-1/);
  });

  it("rejects a broken period before Calendar reads its status or dates", () => {
    expect(() => assertCalendarResponse({ ...valid, periods: [null] }, "store-1", valid.from, valid.to)).toThrow(/排班周期/);
  });

  it("rejects an impossible period date and a shift with an impossible start date", () => {
    expect(() => assertCalendarResponse({ ...valid, periods: [{ ...valid.periods[0], endDate: "2037-10-32" }] },
      "store-1", valid.from, valid.to)).toThrow(/排班周期/);
    expect(() => assertCalendarResponse({ ...valid, shifts: [{ ...valid.shifts[0], date: "2037-10-32" }] },
      "store-1", valid.from, valid.to)).toThrow(/shift-1/);
  });

  it("rejects duplicate shift IDs and an empty assignment list before rendering", () => {
    expect(() => assertCalendarResponse({ ...valid, shifts: [valid.shifts[0], { ...valid.shifts[0] }] },
      "store-1", valid.from, valid.to)).toThrow(/重复/);
    expect(() => assertCalendarResponse({ ...valid, shifts: [{ ...valid.shifts[0], assignments: [] }] },
      "store-1", valid.from, valid.to)).toThrow(/shift-1/);
  });

  it("rejects a shift whose owning period is absent or does not contain its work date", () => {
    expect(() => assertCalendarResponse({ ...valid, periods: [] }, "store-1", valid.from, valid.to)).toThrow(/shift-1/);
    expect(() => assertCalendarResponse({ ...valid, periods: [{ ...valid.periods[0], startDate: "2037-10-13" }] },
      "store-1", valid.from, valid.to)).toThrow(/shift-1/);
  });

  it("rejects a response for another store or date range", () => {
    expect(() => assertCalendarResponse({ ...valid, storeId: "store-2" }, "store-1", valid.from, valid.to)).toThrow(/门店或日期/);
    expect(() => assertCalendarResponse({ ...valid, to: "2037-10-19" }, "store-1", valid.from, valid.to)).toThrow(/门店或日期/);
  });

  it("rejects an incomplete successful API response before Calendar can display it", async () => {
    const partial = { ...valid, shifts: [{ ...valid.shifts[0], assignments: [{ id: "assignment-1", employeeNameSnapshot: "Alice" }] }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(partial), { status: 200 })));
    await expect(rosterRepository.calendar("store-1", valid.from, valid.to)).rejects.toThrow(/shift-1/);
  });
});
