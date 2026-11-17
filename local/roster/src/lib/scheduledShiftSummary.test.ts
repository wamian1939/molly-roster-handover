import { describe, expect, it } from "vitest";
import { boundedScheduledDateSelection, calendarMonthDates, calendarWeekNumber, filterScheduledEmployeesByJobs, filterScheduledEmployeesByName, scheduledJobFilters, scheduledShiftOccupiedDates, scheduledWorklogTimeRange, selectedScheduledJobIds, selectedShiftSummaries, selectScheduledDate } from "./scheduledShiftSummary";
import type { RosterPeriod, Shift } from "../types/roster";
import type { RosterEmployee, RosterStoreJob } from "../types/workforce";

const period = (id: string, status: "DRAFT" | "PUBLISHED") => ({ id, status }) as RosterPeriod;
const shift = (id: string, date: string, startAt: string, endAt: string, breakMinutes: number, rosterPeriodId = "draft") => ({
  id, date, startAt, endAt, breakMinutes, rosterPeriodId, shiftRoleId: "formal-role", roleNameSnapshot: "全岗",
  assignments: [{ employeeId: "employee-a", employeeNameSnapshot: rosterPeriodId === "published" ? "旧姓名" : "原姓名" }],
}) as Shift;

describe("Scheduled Shift side panel data", () => {
  it("shows the local end date for overnight Worklog shifts without changing same-day ranges", () => {
    expect(scheduledWorklogTimeRange("2026-10-31T00:00:00Z", "2026-10-31T08:00:00Z", "Australia/Sydney"))
      .toBe("11:00–19:00");
    expect(scheduledWorklogTimeRange("2026-10-31T11:00:00Z", "2026-10-31T15:00:00Z", "Australia/Sydney"))
      .toBe("22:00–11月1日 02:00");
    expect(scheduledWorklogTimeRange("2026-10-31T11:00:00Z", "2026-10-31T15:00:00Z", "Australia/Adelaide"))
      .toBe("21:30–11月1日 01:30");
    expect(scheduledWorklogTimeRange("2026-12-31T11:00:00Z", "2026-12-31T15:00:00Z", "Australia/Sydney"))
      .toBe("22:00–2027年1月1日 02:00");
  });

  it("selects a continuous range across months and resets when an endpoint is clicked", () => {
    let selected = selectScheduledDate(new Set(), "2026-10-30");
    expect([...selected]).toEqual(["2026-10-30"]);
    selected = selectScheduledDate(selected, "2026-11-02");
    expect([...selected]).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    selected = selectScheduledDate(selected, "2026-11-01");
    expect([...selected]).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
    expect([...selectScheduledDate(selected, "2026-11-01")]).toEqual(["2026-11-01"]);
    selected = selectScheduledDate(selected, "2026-10-30");
    expect([...selected]).toEqual(["2026-10-30"]);
    expect(selectScheduledDate(selected, "2026-10-30").size).toBe(0);
  });

  it("extends a single selected day backward without skipping dates", () => {
    const selected = selectScheduledDate(new Set(["2026-10-04"]), "2026-10-02");
    expect([...selected]).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
  });

  it("rejects a distant sidebar range before it can drive hundreds of calendar requests", () => {
    const current = new Set(["2026-10-21"]);
    expect(boundedScheduledDateSelection(current, "2100-01-01")).toBeNull();
    expect([...current]).toEqual(["2026-10-21"]);
    expect(boundedScheduledDateSelection(current, "2026-11-02")?.size).toBe(13);
  });

  it("builds a Monday-first six-week calendar across month boundaries", () => {
    const dates = calendarMonthDates("2026-10-21");
    expect(dates).toHaveLength(42);
    expect(dates[0]).toBe("2026-09-28");
    expect(dates[41]).toBe("2026-11-08");
    expect(calendarWeekNumber(dates[0])).toBe(40);
    expect(calendarWeekNumber("2021-01-01")).toBe(53);
    expect(calendarWeekNumber("2021-01-04")).toBe(1);
  });

  it("marks overnight continuation dates but excludes a shift ending exactly at midnight", () => {
    const dates = ["2026-10-31", "2026-11-01", "2026-11-02"];
    const overnight = shift("night", "2026-10-31", "2026-10-31T11:00:00Z", "2026-10-31T15:00:00Z", 0);
    const midnight = shift("midnight", "2026-11-01", "2026-11-01T10:00:00Z", "2026-11-01T13:00:00Z", 0);
    expect([...scheduledShiftOccupiedDates([overnight], dates, "Australia/Sydney")]).toEqual(["2026-10-31", "2026-11-01"]);
    expect([...scheduledShiftOccupiedDates([midnight], dates, "Australia/Sydney")]).toEqual(["2026-11-01"]);
  });

  it("uses real Sydney midnight boundaries across spring daylight saving", () => {
    const dates = ["2026-10-03", "2026-10-04", "2026-10-05"];
    const shiftAcrossChange = shift("dst", "2026-10-03", "2026-10-03T13:30:00Z", "2026-10-04T13:30:00Z", 0);
    expect([...scheduledShiftOccupiedDates([shiftAcrossChange], dates, "Australia/Sydney")]).toEqual(dates);
  });

  it("aggregates only selected dates, subtracts breaks and preserves published names", () => {
    const rows = selectedShiftSummaries([
      shift("friday", "2026-10-09", "2026-10-09T03:00:00Z", "2026-10-09T05:00:00Z", 30),
      shift("sunday", "2026-10-11", "2026-10-11T00:00:00Z", "2026-10-11T03:00:00Z", 0, "published"),
      shift("unselected", "2026-10-12", "2026-10-12T00:00:00Z", "2026-10-12T02:00:00Z", 0),
    ], [period("draft", "DRAFT"), period("published", "PUBLISHED")],
    new Set(["2026-10-09", "2026-10-11"]), new Map([["employee-a", "新姓名"]]),
    new Map([["formal-role", "全岗"]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ employeeId: "employee-a", totalHours: 4.5, weekdayHours: 1.5, sundayHours: 3 });
    expect(rows[0].entries.map((entry) => entry.employeeName)).toEqual(["新姓名", "旧姓名"]);
  });

  it("finds published work by both the frozen and current Evaluate names without changing its display", () => {
    const rows = selectedShiftSummaries([
      shift("published", "2026-10-16", "2026-10-15T22:00:00Z", "2026-10-16T02:00:00Z", 0, "published"),
    ], [period("published", "PUBLISHED")], new Set(["2026-10-16"]), new Map([["employee-a", "新姓名"]]));
    const names = new Map([["employee-a", "新姓名"]]);
    expect(filterScheduledEmployeesByName(rows, "新姓名", names)).toEqual(rows);
    expect(filterScheduledEmployeesByName(rows, "旧姓名", names)).toEqual(rows);
    expect(filterScheduledEmployeesByName(rows, "陌生人", names)).toEqual([]);
    expect(rows[0]?.name).toBe("旧姓名");
    expect(rows[0]?.entries[0]?.employeeName).toBe("旧姓名");
  });

  it("marks unverified draft roles as historical while preserving published snapshots", () => {
    const rows = selectedShiftSummaries([
      { ...shift("old-draft", "2026-10-09", "2026-10-09T03:00:00Z", "2026-10-09T05:00:00Z", 0), shiftRoleId: "old-role", roleNameSnapshot: "验收岗" },
      { ...shift("old-published", "2026-10-09", "2026-10-09T05:00:00Z", "2026-10-09T07:00:00Z", 0, "published"), shiftRoleId: "old-role", roleNameSnapshot: "发布时岗位" },
    ], [period("draft", "DRAFT"), period("published", "PUBLISHED")], new Set(["2026-10-09"]),
    new Map([["employee-a", "新姓名"]]), new Map([["formal-role", "全岗"]]));
    expect(rows[0].entries.map((entry) => entry.roleName)).toEqual(["旧岗位：验收岗", "发布时岗位"]);
  });

  it("offers active Evaluate jobs held by scheduled employees on the selected dates, regardless of Shift roles", () => {
    const job = (id: string, name: string, storeId = "store", isActive = true): RosterStoreJob => ({
      id, name, storeId, isActive, code: id, colorToken: "#123456", displayOrder: id === "job-b" ? 2 : id === "unused" ? 3 : 1,
    });
    const jobs = [job("job-b", "带训员"), job("job-a", "全岗"), job("unused", "培训"),
      job("old-role", "验收岗", "another-store"), job("disabled", "前场", "store", false)];
    const employees = [
      { id: "employee-a", storeId: "store", isActive: true, positions: [{ id: "job-a" }, { id: "job-b" }] },
      { id: "employee-b", storeId: "store", isActive: true, positions: [{ id: "unused" }] },
    ] as RosterEmployee[];
    const rows = selectedShiftSummaries([shift("a", "2026-10-09", "2026-10-09T03:00:00Z", "2026-10-09T05:00:00Z", 0)],
      [period("draft", "DRAFT")], new Set(["2026-10-09"]), new Map([["employee-a", "甲"]]));
    expect(scheduledJobFilters(jobs, employees, rows, "store").map((item) => item.name)).toEqual(["全岗", "带训员"]);
    expect(scheduledJobFilters(jobs, employees, [...rows, { ...rows[0]!, employeeId: "employee-b", name: "乙" }], "store")
      .map((item) => item.name)).toEqual(["全岗", "带训员", "培训"]);
    expect(scheduledJobFilters(jobs, employees, [], "store")).toEqual([]);
  });

  it("filters employees by formal job while retaining every Shift role and all their hours", () => {
    const shifts = [
      { ...shift("a-old-role", "2026-10-09", "2026-10-09T03:00:00Z", "2026-10-09T05:00:00Z", 0), shiftRoleId: "old-role", roleNameSnapshot: "验收岗" },
      { ...shift("a-new-role", "2026-10-09", "2026-10-09T05:00:00Z", "2026-10-09T07:00:00Z", 0), shiftRoleId: "new-role", roleNameSnapshot: "全岗" },
      { ...shift("b-same-role", "2026-10-09", "2026-10-09T08:00:00Z", "2026-10-09T10:00:00Z", 0), shiftRoleId: "old-role",
        assignments: [{ ...shift("b-assignment", "2026-10-09", "2026-10-09T08:00:00Z", "2026-10-09T10:00:00Z", 0).assignments[0], employeeId: "employee-b", employeeNameSnapshot: "乙" }] },
    ];
    const rows = selectedShiftSummaries(shifts, [period("draft", "DRAFT")], new Set(["2026-10-09"]),
      new Map([["employee-a", "甲"], ["employee-b", "乙"]]));
    const employees = [
      { id: "employee-a", storeId: "store", isActive: true, positions: [{ id: "job-a" }] },
      { id: "employee-b", storeId: "store", isActive: true, positions: [{ id: "job-b" }] },
    ] as RosterEmployee[];
    expect(rows).toHaveLength(2);
    expect(filterScheduledEmployeesByJobs(rows, employees, new Set(["job-a"]), "store")
      .map((row) => [row.name, row.totalHours, row.entries.map((entry) => entry.roleName)]))
      .toEqual([["甲", 4, ["旧岗位：验收岗", "旧岗位：全岗"]]]);
    expect(filterScheduledEmployeesByJobs(rows, employees, new Set(["job-b"]), "store")
      .map((row) => [row.name, row.totalHours])).toEqual([["乙", 2]]);
    expect(filterScheduledEmployeesByJobs(rows, employees, new Set(), "store")).toEqual([]);
    expect(filterScheduledEmployeesByJobs(rows, employees, null, "store")).toEqual(rows);
    expect(filterScheduledEmployeesByJobs(rows, [{ ...employees[0], isActive: false }, employees[1]], new Set(["job-a"]), "store")).toEqual([]);
  });

  it("checks newly appearing jobs while retaining explicit exclusions across dates", () => {
    const job = (id: string): RosterStoreJob => ({ id, storeId: "store", name: id,
      code: id, colorToken: "#123456", displayOrder: 1, isActive: true });
    const excluded = new Set(["service"]);
    expect(selectedScheduledJobIds([job("service"), job("training")], excluded)).toEqual(new Set(["training"]));
    expect(selectedScheduledJobIds([job("service"), job("training"), job("new")], excluded))
      .toEqual(new Set(["training", "new"]));
    expect(selectedScheduledJobIds([job("training"), job("new")], excluded)).toBeNull();
    expect(selectedScheduledJobIds([job("service")], excluded)).toEqual(new Set());
  });
});
