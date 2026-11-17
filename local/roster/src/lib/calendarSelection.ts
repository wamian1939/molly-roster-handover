import { addCalendarDays, storeDateTimeCandidates, storeParts } from "./storeTime";

export function canCreateFromCalendarSelection(start: Date, end: Date, timezone: string, minimumShiftMinutes: number): boolean {
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440 || durationMinutes < minimumShiftMinutes) return false;
  const startDate = storeParts(start, timezone).date;
  const endDate = storeParts(end, timezone).date;
  return endDate === startDate || endDate === addCalendarDays(startDate, 1);
}

export function calendarClickDurationMinutes(slotIntervalMinutes: number, minimumShiftMinutes: number): number {
  return Math.max(slotIntervalMinutes, Math.ceil(minimumShiftMinutes / slotIntervalMinutes) * slotIntervalMinutes);
}

export function calendarClickEnd(start: Date, durationMinutes: number, timezone: string): Date {
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const startLocal = storeParts(start, timezone);
  const endLocal = storeParts(end, timezone);
  if (endLocal.date === startLocal.date && endLocal.time < startLocal.time) {
    return storeDateTimeCandidates(startLocal.date, startLocal.time, timezone).find((candidate) => candidate > end) ?? end;
  }
  return end;
}

export function calendarRangeWithinStoreHours(startAt: Date, endAt: Date, timezone: string, openingTime: string, closingTime: string): boolean {
  const start = storeParts(startAt, timezone);
  const end = storeParts(endAt, timezone);
  const overnightStore = closingTime < openingTime;
  const morningSegment = overnightStore && start.time < closingTime;
  return morningSegment
    ? end.date === start.date && end.time <= closingTime
    : start.time >= openingTime && (overnightStore
      ? end.date === start.date || end.time <= closingTime
      : end.date === start.date && end.time <= closingTime);
}
