import { describe, expect, it } from "vitest";
import { calendarEmployeePageSize, peakConcurrentShifts, scheduledEmployeeCount, shouldPageCalendarEmployees, shiftsForEmployees, shiftsOverlappingCalendarDates, weekEmployeeOptions } from "./calendarEmployeeWindow";
import type { Shift } from "../types/roster";
import type { RosterEmployee } from "../types/workforce";

function shift(id: string, ...assignments: Array<[string, string]>): Shift {
  return { id, assignments: assignments.map(([employeeId, employeeNameSnapshot]) => ({ employeeId, employeeNameSnapshot })) } as Shift;
}

describe("week employee window", () => {
  it("shows every employee in Day while retaining paging in Week and Month", () => {
    expect(calendarEmployeePageSize("timeGridDay", 12)).toBe(Number.MAX_SAFE_INTEGER);
    expect(calendarEmployeePageSize("timeGridWeek", 12)).toBe(1);
    expect(calendarEmployeePageSize("dayGridMonth", 12)).toBe(25);
    expect(shouldPageCalendarEmployees("timeGridDay", 25, 10, false)).toBe(false);
    expect(shouldPageCalendarEmployees("timeGridDay", 25, 10, true)).toBe(false);
    expect(shouldPageCalendarEmployees("timeGridWeek", 25, 1, false)).toBe(true);
    expect(shouldPageCalendarEmployees("dayGridMonth", 5, 25, true)).toBe(true);
  });
  it("counts only distinct employees with shifts", () => {
    expect(scheduledEmployeeCount([shift("first", ["a", "A"], ["b", "B"]), shift("second", ["a", "A"])])).toBe(2);
    expect(scheduledEmployeeCount([])).toBe(0);
  });
  it("keeps employees from saved shifts searchable even if they no longer appear in the current workforce", () => {
    const employees = [{ id: "active", displayName: "Current Name" }] as RosterEmployee[];
    const options = weekEmployeeOptions(employees, [shift("s1", ["active", "Old Name"], ["former", "Former Name"])]);
    expect(options).toEqual([{ id: "active", name: "Current Name" }, { id: "former", name: "Former Name" }]);
  });

  it("includes a whole shift when any assigned employee is visible, without duplicating it", () => {
    const shared = shift("shared", ["a", "A"], ["b", "B"]);
    const hidden = shift("hidden", ["c", "C"]);
    expect(shiftsForEmployees([shared, hidden], new Set(["b"]))).toEqual([shared]);
    expect(shiftsForEmployees([shared, hidden], new Set(["a", "b"]))).toEqual([shared]);
  });

  it("counts only shifts visible on the store-local Day, including an overnight continuation", () => {
    const timed = (id: string, startAt: string, endAt: string) => ({ ...shift(id, [id, id]), startAt, endAt });
    const shifts = [
      timed("previous", "2026-10-04T08:00:00Z", "2026-10-04T12:00:00Z"),
      timed("overnight", "2026-10-04T12:00:00Z", "2026-10-04T16:00:00Z"),
      timed("day", "2026-10-04T22:00:00Z", "2026-10-05T02:00:00Z"),
      timed("next", "2026-10-05T13:00:00Z", "2026-10-05T16:00:00Z"),
    ];
    expect(shiftsOverlappingCalendarDates(shifts, "2026-10-05", "2026-10-05", "Australia/Sydney")
      .map((item) => item.id)).toEqual(["overnight", "day"]);
  });

  it("uses real Sydney midnight boundaries across the spring clock change", () => {
    const timed = (id: string, startAt: string, endAt: string) => ({ ...shift(id, [id, id]), startAt, endAt });
    const shifts = [
      timed("ends-at-midnight", "2026-10-03T10:00:00Z", "2026-10-03T14:00:00Z"),
      timed("spring-day", "2026-10-03T14:00:00Z", "2026-10-04T13:00:00Z"),
      timed("starts-next-midnight", "2026-10-04T13:00:00Z", "2026-10-04T15:00:00Z"),
    ];
    expect(shiftsOverlappingCalendarDates(shifts, "2026-10-04", "2026-10-04", "Australia/Sydney")
      .map((item) => item.id)).toEqual(["spring-day"]);
  });

  it("puts scheduled employees before unscheduled names so the first page does not appear empty", () => {
    const employees = [
      { id: "available", displayName: "Aaron" },
      { id: "scheduled", displayName: "Zoe" },
    ] as RosterEmployee[];
    expect(weekEmployeeOptions(employees, [shift("s1", ["scheduled", "Zoe"])]).map((employee) => employee.id))
      .toEqual(["scheduled", "available"]);
  });

  it("counts simultaneous cards and treats a shift ending at the next start as non-overlapping", () => {
    const timed = (id: string, startAt: string, endAt: string) => ({ ...shift(id, [id, id]), startAt, endAt });
    expect(peakConcurrentShifts([
      timed("a", "2026-10-05T09:00:00Z", "2026-10-05T12:00:00Z"),
      timed("b", "2026-10-05T10:00:00Z", "2026-10-05T12:00:00Z"),
      timed("c", "2026-10-05T12:00:00Z", "2026-10-05T14:00:00Z"),
    ])).toBe(2);
  });
});
