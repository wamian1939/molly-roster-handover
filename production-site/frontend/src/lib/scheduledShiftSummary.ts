import type { RosterPeriod, Shift } from "../types/roster";
import type { RosterEmployee, RosterStoreJob } from "../types/workforce";
import { addCalendarDays, storeDateTime, storeParts } from "./storeTime";

/** Make an overnight Worklog end date explicit in the store's local timezone. */
export function scheduledWorklogTimeRange(startAt: string, endAt: string, timezone: string): string {
  const start = storeParts(startAt, timezone);
  const end = storeParts(endAt, timezone);
  if (start.date === end.date) return `${start.time}–${end.time}`;
  const [startYear] = start.date.split("-");
  const [endYear, endMonth, endDay] = end.date.split("-");
  const year = startYear === endYear ? "" : `${endYear}年`;
  return `${start.time}–${year}${Number(endMonth)}月${Number(endDay)}日 ${end.time}`;
}

export function calendarMonthDates(anchor: string, weekStartsOn = 1): string[] {
  const [year, month] = anchor.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return [];
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (first.getUTCDay() - weekStartsOn + 7) % 7;
  first.setUTCDate(first.getUTCDate() - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setUTCDate(first.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function calendarWeekNumber(date: string): number {
  const day = new Date(`${date}T12:00:00.000Z`);
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1, 12));
  return Math.ceil(((day.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Mark dates with any visible part of a Shift, including its overnight continuation. */
export function scheduledShiftOccupiedDates(shifts: Pick<Shift, "startAt" | "endAt">[], visibleDates: string[], timezone: string): Set<string> {
  if (!visibleDates.length || !shifts.length) return new Set();
  const boundaries = [...visibleDates, addCalendarDays(visibleDates[visibleDates.length - 1]!, 1)]
    .map((date) => storeDateTime(date, "00:00", timezone).getTime());
  const occupied = new Set<string>();
  for (const shift of shifts) {
    const start = Date.parse(shift.startAt);
    const end = Date.parse(shift.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
    if (end <= boundaries[0]! || start >= boundaries[boundaries.length - 1]!) continue;
    for (let index = 0; index < visibleDates.length; index += 1) {
      if (start < boundaries[index + 1]! && end > boundaries[index]!) occupied.add(visibleDates[index]!);
    }
  }
  return occupied;
}

/** The Scheduled Shift mini-calendar selects one continuous inclusive date range. */
export function selectScheduledDate(current: ReadonlySet<string>, clicked: string): Set<string> {
  const selected = [...current].sort();
  if (!selected.length) return new Set([clicked]);
  if (selected.length === 1 && selected[0] === clicked) return new Set();
  if (selected.length > 1 && (selected[0] === clicked || selected[selected.length - 1] === clicked)) {
    return new Set([clicked]);
  }

  const start = clicked < selected[0] ? clicked : selected[0];
  const end = clicked < selected[0] ? selected[selected.length - 1] : clicked;
  const days = new Set<string>();
  const cursor = new Date(`${start}T12:00:00.000Z`);
  while (cursor.toISOString().slice(0, 10) <= end) {
    days.add(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Keep the sidebar's optional cross-month selection within one calendar year of data. */
export function boundedScheduledDateSelection(current: ReadonlySet<string>, clicked: string): Set<string> | null {
  const selected = [...current].sort();
  if (selected.length && !(selected.length === 1 && selected[0] === clicked)
    && !(selected.length > 1 && (selected[0] === clicked || selected[selected.length - 1] === clicked))) {
    const first = clicked < selected[0]! ? clicked : selected[0]!;
    const last = clicked > selected[selected.length - 1]! ? clicked : selected[selected.length - 1]!;
    const days = (Date.parse(`${last}T12:00:00.000Z`) - Date.parse(`${first}T12:00:00.000Z`)) / 86_400_000 + 1;
    if (days > 366) return null;
  }
  const next = selectScheduledDate(current, clicked);
  return next.size <= 366 ? next : null;
}

export function scheduledJobFilters(
  jobs: RosterStoreJob[], employees: RosterEmployee[], rows: ScheduledEmployeeSummary[], storeId: string,
): RosterStoreJob[] {
  const scheduledIds = new Set(rows.map((row) => row.employeeId));
  const assignedJobIds = new Set(employees.filter((employee) => employee.isActive && employee.storeId === storeId
    && scheduledIds.has(employee.id)).flatMap((employee) => employee.positions?.map((position) => position.id) ?? []));
  return jobs.filter((job) => job.isActive && job.storeId === storeId && assignedJobIds.has(job.id))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name, "zh-CN"));
}

/** Newly appearing jobs start checked; only explicit exclusions survive a date-range change. */
export function selectedScheduledJobIds(jobs: RosterStoreJob[], excludedJobIds: ReadonlySet<string>): Set<string> | null {
  if (!jobs.some((job) => excludedJobIds.has(job.id))) return null;
  return new Set(jobs.filter((job) => !excludedJobIds.has(job.id)).map((job) => job.id));
}

export type ScheduledShiftEntry = {
  shift: Shift;
  employeeName: string;
  roleName: string;
  hours: number;
};

export type ScheduledEmployeeSummary = {
  employeeId: string;
  name: string;
  totalHours: number;
  weekdayHours: number;
  saturdayHours: number;
  sundayHours: number;
  entries: ScheduledShiftEntry[];
};

/** BHS Job filters staff by their current formal qualifications, keeping all of their shift hours. */
export function filterScheduledEmployeesByJobs(
  rows: ScheduledEmployeeSummary[], employees: RosterEmployee[], chosenJobIds: ReadonlySet<string> | null, storeId: string,
): ScheduledEmployeeSummary[] {
  if (chosenJobIds === null) return rows;
  const eligible = new Set(employees.filter((employee) => employee.isActive && employee.storeId === storeId
    && employee.positions?.some((position) => chosenJobIds.has(position.id))).map((employee) => employee.id));
  return rows.filter((row) => eligible.has(row.employeeId));
}

/** Search can use today's Evaluate name without rewriting a published name snapshot. */
export function filterScheduledEmployeesByName(
  rows: ScheduledEmployeeSummary[], query: string, currentEmployeeNames: ReadonlyMap<string, string>,
): ScheduledEmployeeSummary[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => [row.name, currentEmployeeNames.get(row.employeeId),
    ...row.entries.map((entry) => entry.employeeName)]
    .some((name) => name?.toLocaleLowerCase().includes(needle)));
}

export function selectedShiftSummaries(
  shifts: Shift[], periods: RosterPeriod[], selectedDates: ReadonlySet<string>,
  currentEmployeeNames: ReadonlyMap<string, string>,
  formalRoleNames: ReadonlyMap<string, string> = new Map(),
): ScheduledEmployeeSummary[] {
  const published = new Set(periods.filter((period) => period.status === "PUBLISHED").map((period) => period.id));
  const rows = new Map<string, ScheduledEmployeeSummary>();
  for (const shift of shifts) {
    if (!selectedDates.has(shift.date)) continue;
    const netHours = Math.max(0, (Date.parse(shift.endAt) - Date.parse(shift.startAt)) / 3_600_000 - shift.breakMinutes / 60);
    if (!Number.isFinite(netHours)) continue;
    const day = new Date(`${shift.date}T12:00:00.000Z`).getUTCDay();
    for (const assignment of shift.assignments) {
      const name = published.has(shift.rosterPeriodId)
        ? assignment.employeeNameSnapshot
        : currentEmployeeNames.get(assignment.employeeId) ?? assignment.employeeNameSnapshot;
      const row = rows.get(assignment.employeeId) ?? {
        employeeId: assignment.employeeId, name, totalHours: 0, weekdayHours: 0,
        saturdayHours: 0, sundayHours: 0, entries: [],
      };
      row.totalHours += netHours;
      if (day === 0) row.sundayHours += netHours;
      else if (day === 6) row.saturdayHours += netHours;
      else row.weekdayHours += netHours;
      const roleName = published.has(shift.rosterPeriodId) ? shift.roleNameSnapshot
        : formalRoleNames.get(shift.shiftRoleId) ?? `旧岗位：${shift.roleNameSnapshot}`;
      row.entries.push({ shift, employeeName: name, roleName, hours: netHours });
      rows.set(assignment.employeeId, row);
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export function formatScheduledHours(hours: number): string {
  return `${Number(hours.toFixed(2))}h`;
}
