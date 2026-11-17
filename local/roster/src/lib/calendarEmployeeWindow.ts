import type { Shift } from "../types/roster";
import type { CalendarView } from "../types/roster";
import type { RosterEmployee } from "../types/workforce";
import { addCalendarDays, storeDateTime } from "./storeTime";

export const WEEK_EMPLOYEE_PAGE_SIZE = 100;
export const MONTH_EMPLOYEE_PAGE_SIZE = 25;
export const MAX_READABLE_CONCURRENT_SHIFTS = 4;

export function calendarEmployeePageSize(view: CalendarView, peakConcurrency: number): number {
  if (view === "dayGridMonth") return MONTH_EMPLOYEE_PAGE_SIZE;
  if (view === "timeGridDay") return Number.MAX_SAFE_INTEGER;
  return peakConcurrency > MAX_READABLE_CONCURRENT_SHIFTS ? 1 : WEEK_EMPLOYEE_PAGE_SIZE;
}

export function shouldPageCalendarEmployees(view: CalendarView, employeeCount: number, pageSize: number, hasEmployeeFilter: boolean): boolean {
  return view !== "timeGridDay" && (employeeCount > pageSize || hasEmployeeFilter);
}

export function scheduledEmployeeCount(shifts: readonly Shift[]): number {
  const employeeIds = new Set<string>();
  for (const shift of shifts) for (const assignment of shift.assignments) employeeIds.add(assignment.employeeId);
  return employeeIds.size;
}

export function peakConcurrentShifts(shifts: readonly Shift[]): number {
  const boundaries: Array<{ time: number; change: number }> = [];
  for (const shift of shifts) {
    const start = Date.parse(shift.startAt);
    const end = Date.parse(shift.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    boundaries.push({ time: start, change: 1 }, { time: end, change: -1 });
  }
  boundaries.sort((left, right) => left.time - right.time || left.change - right.change);
  let current = 0;
  let peak = 0;
  for (const boundary of boundaries) {
    current += boundary.change;
    peak = Math.max(peak, current);
  }
  return peak;
}

export function weekEmployeeOptions(employees: readonly RosterEmployee[], shifts: readonly Shift[]) {
  const options = new Map(employees.map((employee) => [employee.id, employee.displayName]));
  const scheduled = new Set<string>();
  for (const shift of shifts) for (const assignment of shift.assignments) {
    scheduled.add(assignment.employeeId);
    if (!options.has(assignment.employeeId)) options.set(assignment.employeeId, assignment.employeeNameSnapshot);
  }
  return [...options].map(([id, name]) => ({ id, name }))
    .sort((left, right) => Number(scheduled.has(right.id)) - Number(scheduled.has(left.id))
      || left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id));
}

export function shiftsForEmployees(shifts: readonly Shift[], employeeIds: ReadonlySet<string>): Shift[] {
  return shifts.filter((shift) => shift.assignments.some((assignment) => employeeIds.has(assignment.employeeId)));
}

export function shiftsOverlappingCalendarDates(shifts: readonly Shift[], from: string, to: string, timezone: string): Shift[] {
  const visibleStart = storeDateTime(from, "00:00", timezone).getTime();
  const visibleEnd = storeDateTime(addCalendarDays(to, 1), "00:00", timezone).getTime();
  return shifts.filter((shift) => {
    const start = Date.parse(shift.startAt);
    const end = Date.parse(shift.endAt);
    return Number.isFinite(start) && Number.isFinite(end) && start < visibleEnd && end > visibleStart;
  });
}
