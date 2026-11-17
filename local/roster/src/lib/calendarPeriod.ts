import type { CalendarResponse, RosterPeriod, Shift } from "../types/roster";

export function activeCalendarPeriod(periods: readonly RosterPeriod[], from: string, to: string, focusedDate?: string): RosterPeriod | null {
  if (focusedDate) return focusedDate >= from && focusedDate <= to
    ? periods.find((period) => period.startDate <= focusedDate && period.endDate >= focusedDate) ?? null
    : null;
  return periods.find((period) => period.startDate <= from && period.endDate >= from)
    ?? periods.find((period) => period.startDate >= from && period.startDate <= to)
    ?? null;
}

export function exactCyclePeriod(periods: readonly RosterPeriod[], startDate: string, endDate: string, cycleType: RosterPeriod["cycleType"]): RosterPeriod | null {
  return periods.find((period) => period.startDate === startDate && period.endDate === endDate && period.cycleType === cycleType) ?? null;
}

export function coveredPeriodShifts(calendar: CalendarResponse, period: RosterPeriod): Shift[] | null {
  if (calendar.from > period.startDate || calendar.to < period.endDate) return null;
  return calendar.shifts.filter((shift) => shift.rosterPeriodId === period.id);
}
