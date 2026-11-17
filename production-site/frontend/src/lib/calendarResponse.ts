import type { CalendarResponse, RosterPeriod, Shift } from "../types/roster";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validPeriod(value: unknown, storeId: string): value is RosterPeriod {
  return record(value) && nonempty(value.id) && value.storeId === storeId
    && calendarDate(value.startDate) && calendarDate(value.endDate)
    && value.startDate <= value.endDate
    && (value.cycleType === "WEEK" || value.cycleType === "FORTNIGHT")
    && (value.status === "DRAFT" || value.status === "PUBLISHED")
    && Number.isInteger(value.version) && Number(value.version) > 0
    && (value.publishedAt === null || (typeof value.publishedAt === "string" && Number.isFinite(Date.parse(value.publishedAt))));
}

function validShift(value: unknown, storeId: string): value is Shift {
  if (!record(value) || !nonempty(value.id) || !nonempty(value.rosterPeriodId)
    || value.storeId !== storeId || !calendarDate(value.date)
    || !nonempty(value.shiftRoleId) || !nonempty(value.startAt) || !nonempty(value.endAt)
    || !Array.isArray(value.assignments) || value.assignments.length === 0) return false;

  const start = Date.parse(value.startAt);
  const end = Date.parse(value.endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start
    || typeof value.breakMinutes !== "number" || !Number.isInteger(value.breakMinutes)
    || value.breakMinutes < 0 || value.breakMinutes * 60_000 >= end - start) return false;

  return value.assignments.every((assignment: unknown) => record(assignment)
    && nonempty(assignment.id) && nonempty(assignment.employeeId)
    && nonempty(assignment.employeeNameSnapshot));
}

/** Refuse an incomplete API snapshot before Calendar grouping can silently discard rows. */
export function assertCalendarResponse(value: unknown, storeId: string, from: string, to: string): CalendarResponse {
  if (!record(value) || value.storeId !== storeId || value.from !== from || value.to !== to) {
    throw new Error("日历数据与请求的门店或日期不一致，请刷新后重试");
  }
  if (!Array.isArray(value.periods) || !Array.isArray(value.shifts)) {
    throw new Error("日历数据不完整，请刷新后重试");
  }
  if (!value.periods.every((period: unknown) => validPeriod(period, storeId))) {
    throw new Error("日历排班周期的数据不完整，请刷新后重试");
  }
  const periods = new Map<string, RosterPeriod>();
  for (const period of value.periods as RosterPeriod[]) {
    if (periods.has(period.id)) throw new Error(`日历排班周期 ${period.id} 重复，请刷新后重试`);
    periods.set(period.id, period);
  }
  const shiftIds = new Set<string>();
  for (const shift of value.shifts) {
    if (!validShift(shift, storeId)) {
      const id = record(shift) && nonempty(shift.id) ? shift.id : "未知班次";
      throw new Error(`日历班次 ${id} 的数据不完整，请刷新后重试`);
    }
    if (shiftIds.has(shift.id)) throw new Error(`日历班次 ${shift.id} 重复，请刷新后重试`);
    shiftIds.add(shift.id);
    const period = periods.get(shift.rosterPeriodId);
    if (!period || shift.date < period.startDate || shift.date > period.endDate) {
      throw new Error(`日历班次 ${shift.id} 与排班周期不一致，请刷新后重试`);
    }
  }
  return value as CalendarResponse;
}
