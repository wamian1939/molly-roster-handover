import { describe, expect, it } from "vitest";
import { groupShiftsForCalendar } from "./calendarGrouping";
import { calendarOverlapInsets, layoutCalendarShiftGroups, layoutCalendarShiftGroupsByVisibleDay } from "./calendarOverlap";
import type { Shift } from "../types/roster";

describe("layoutCalendarShiftGroups", () => {
  it("allocates two completely overlapping groups to two columns", () => {
    const layout = layoutCalendarShiftGroups(groups([
      shift("one", "09:00", "12:00", "front"),
      shift("two", "09:00", "12:00", "bar"),
    ]));

    expect(layout.map(({ columnIndex, columnCount }) => [columnIndex, columnCount])).toEqual([[0, 2], [1, 2]]);
  });

  it("allocates three completely overlapping groups to three stable columns", () => {
    const layout = layoutCalendarShiftGroups(groups([
      shift("three", "09:00", "12:00", "kitchen"),
      shift("one", "09:00", "12:00", "front"),
      shift("two", "09:00", "12:00", "bar"),
    ]));

    expect(layout).toHaveLength(3);
    expect(layout.map((item) => item.columnIndex)).toEqual([0, 1, 2]);
    expect(layout.every((item) => item.columnCount === 3)).toBe(true);
  });

  it("keeps partial overlap in one cluster", () => {
    const layout = layoutCalendarShiftGroups(groups([
      shift("one", "09:00", "11:00", "front"),
      shift("two", "10:00", "12:00", "bar"),
    ]));

    expect(new Set(layout.map((item) => item.clusterId)).size).toBe(1);
    expect(layout.map((item) => item.columnIndex)).toEqual([0, 1]);
  });

  it("reuses the first column when ranges only touch", () => {
    const layout = layoutCalendarShiftGroups(groups([
      shift("one", "09:00", "10:00", "front"),
      shift("two", "10:00", "11:00", "bar"),
    ]));

    expect(layout.map((item) => item.columnIndex)).toEqual([0, 0]);
    expect(new Set(layout.map((item) => item.clusterId)).size).toBe(2);
  });

  it("handles one long group containing two touching shorter groups", () => {
    const layout = layoutCalendarShiftGroups(groups([
      shift("long", "09:00", "13:00", "front"),
      shift("short-one", "10:00", "11:00", "bar"),
      shift("short-two", "11:00", "12:00", "kitchen"),
    ]));

    expect(layout.map((item) => item.columnIndex)).toEqual([0, 1, 1]);
    expect(layout.every((item) => item.columnCount === 2)).toBe(true);
  });

  it("allows a later group to span columns that are no longer occupied", () => {
    const layout = layoutCalendarShiftGroups(groups([
      shift("long", "09:00", "12:00", "front"),
      shift("short-one", "09:00", "10:00", "bar"),
      shift("short-two", "09:00", "10:00", "kitchen"),
      shift("later", "10:00", "12:00", "bar"),
    ]));

    expect(layout.find((item) => item.group.sourceShifts[0].id === "later")).toMatchObject({ columnIndex: 1, columnCount: 3, columnSpan: 2 });
  });

  it("reuses three columns across a long chain instead of squeezing every card into a new column", () => {
    const layout = layoutCalendarShiftGroups(groups([
      shift("one", "09:00", "10:30", "front"),
      shift("two", "09:30", "11:00", "bar"),
      shift("three", "10:00", "11:30", "kitchen"),
      shift("four", "10:30", "12:00", "front"),
      shift("five", "11:00", "12:30", "bar"),
    ]));

    expect(layout.map(({ columnIndex, columnCount }) => [columnIndex, columnCount])).toEqual([
      [0, 3], [1, 3], [2, 3], [0, 3], [1, 3],
    ]);
    expect(calendarOverlapInsets(layout[3])).toEqual({ left: "0%", right: "66.66666666666666%" });
  });

  it("lays out an overnight continuation against shifts on the next store-local day", () => {
    const overnight = {
      ...shift("overnight", "22:00", "23:00", "front"),
      startAt: "2026-09-07T12:00:00.000Z",
      endAt: "2026-09-07T16:00:00.000Z",
    };
    const nextDay = {
      ...shift("next-day", "01:00", "03:00", "bar"),
      date: "2026-09-08",
      startAt: "2026-09-07T15:00:00.000Z",
      endAt: "2026-09-07T17:00:00.000Z",
    };
    const placements = layoutCalendarShiftGroupsByVisibleDay(groups([overnight, nextDay]), "2026-09-07", "2026-09-08", "Australia/Sydney");
    const firstDay = [...placements.entries()].filter(([key]) => key.startsWith("2026-09-07:"));
    const secondDay = [...placements.entries()].filter(([key]) => key.startsWith("2026-09-08:"));
    expect(firstDay.map(([, placement]) => placement.columnCount)).toEqual([1]);
    expect(secondDay.map(([, placement]) => placement.columnCount)).toEqual([2, 2]);
  });
});

function groups(shifts: Shift[]) {
  return groupShiftsForCalendar(shifts);
}

function shift(id: string, start: string, end: string, role: string): Shift {
  return {
    id,
    rosterPeriodId: "period-1",
    storeId: "store-1",
    date: "2026-09-07",
    startAt: `2026-09-07T${start}:00.000Z`,
    endAt: `2026-09-07T${end}:00.000Z`,
    breakMinutes: 0,
    shiftRoleId: role,
    roleNameSnapshot: role,
    roleColorSnapshot: "#647180",
    publicNote: null,
    internalNote: null,
    version: 1,
    shiftRole: { id: role, storeId: null, code: role, nameZh: role, colorToken: "#647180", requiredSkillCodes: [] },
    assignments: [{ id: `assignment-${id}`, employeeId: `employee-${id}`, employeeNameSnapshot: id, employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }],
  };
}
