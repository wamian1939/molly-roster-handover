import { describe, expect, it } from "vitest";
import type { CalendarResponse, RosterPeriod } from "../types/roster";
import { activeCalendarPeriod, coveredPeriodShifts, exactCyclePeriod } from "./calendarPeriod";

describe("activeCalendarPeriod", () => {
  it("keeps the visible week active when an overnight shift includes the prior period", () => {
    const prior = { id: "prior", startDate: "2037-10-05", endDate: "2037-10-11" } as RosterPeriod;
    const current = { id: "current", startDate: "2037-10-12", endDate: "2037-10-18" } as RosterPeriod;
    expect(activeCalendarPeriod([prior, current], "2037-10-12", "2037-10-18")?.id).toBe("current");
    expect(activeCalendarPeriod([prior], "2037-10-12", "2037-10-18")).toBeNull();
  });

  it("selects the focused week in Month view and leaves an unscheduled focus without an action period", () => {
    const early = { id: "early", startDate: "2026-10-05", endDate: "2026-10-11" } as RosterPeriod;
    const focused = { id: "focused", startDate: "2026-10-12", endDate: "2026-10-18" } as RosterPeriod;
    expect(activeCalendarPeriod([early, focused], "2026-09-28", "2026-11-01", "2026-10-16")?.id).toBe("focused");
    expect(activeCalendarPeriod([early, focused], "2026-09-28", "2026-11-01", "2026-10-23")).toBeNull();
  });
});

describe("coveredPeriodShifts", () => {
  const period = { id: "current", startDate: "2037-10-12", endDate: "2037-10-18" } as RosterPeriod;
  const shifts = [{ id: "carryover", rosterPeriodId: "prior" }, { id: "current-shift", rosterPeriodId: "current" }] as CalendarResponse["shifts"];

  it("reuses a complete response but excludes a prior-period overnight carryover", () => {
    const calendar = { from: "2037-10-12", to: "2037-10-18", shifts } as CalendarResponse;
    expect(coveredPeriodShifts(calendar, period)?.map((shift) => shift.id)).toEqual(["current-shift"]);
  });

  it("requires a second read when a Day response omits the rest of the period", () => {
    const calendar = { from: "2037-10-12", to: "2037-10-12", shifts } as CalendarResponse;
    expect(coveredPeriodShifts(calendar, period)).toBeNull();
  });
});

describe("exactCyclePeriod", () => {
  it("does not treat a one-week source as the previous fortnight after changing cycle settings", () => {
    const week = { id: "week", startDate: "2026-10-19", endDate: "2026-10-25", cycleType: "WEEK" } as RosterPeriod;
    const fortnight = { id: "fortnight", startDate: "2026-10-12", endDate: "2026-10-25", cycleType: "FORTNIGHT" } as RosterPeriod;
    expect(exactCyclePeriod([week], "2026-10-12", "2026-10-25", "FORTNIGHT")).toBeNull();
    expect(exactCyclePeriod([fortnight], "2026-10-12", "2026-10-25", "FORTNIGHT")?.id).toBe("fortnight");
    expect(exactCyclePeriod([week], "2026-10-19", "2026-10-25", "WEEK")?.id).toBe("week");
  });
});
