import { DateTime } from "luxon";
import { addCalendarDays, storeDateTime } from "./storeTime";
import type { EmployeeAvailability } from "../types/roster";

export type CalendarAvailabilityBadge = { status: "AVAILABLE" | "UNAVAILABLE"; label: string };

/** Keep the selected local date and any overnight window that actually intersects the shift. */
export function availabilityRowsForShift(rows: EmployeeAvailability[], date: string, start: Date, end: Date) {
  const shiftStart = start.getTime();
  const shiftEnd = end.getTime();
  return rows.filter((row) => row.date === date || Boolean(row.startAt && row.endAt
    && Date.parse(row.startAt) < shiftEnd && Date.parse(row.endAt) > shiftStart));
}

/** Project recorded windows into visible store-local dates without treating missing rows as availability. */
export function calendarAvailabilityByCell(rows: EmployeeAvailability[], dates: string[], timezone: string) {
  const cells = new Map<string, Array<CalendarAvailabilityBadge & { startMillis: number }>>();
  const bounds = dates.map((date) => ({ date, start: storeDateTime(date, "00:00", timezone).getTime(),
    end: storeDateTime(addCalendarDays(date, 1), "00:00", timezone).getTime() }));
  for (const row of rows) {
    if (row.status === "UNKNOWN" || !row.startAt || !row.endAt) continue;
    const start = Date.parse(row.startAt);
    const end = Date.parse(row.endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) continue;
    for (const day of bounds) {
      const clippedStart = Math.max(start, day.start);
      const clippedEnd = Math.min(end, day.end);
      if (clippedStart >= clippedEnd) continue;
      const startLocal = DateTime.fromMillis(clippedStart, { zone: timezone });
      const endLocal = DateTime.fromMillis(clippedEnd, { zone: timezone });
      const startClock = clippedStart === day.start ? "00:00" : startLocal.toFormat("HH:mm");
      const endClock = clippedEnd === day.end ? "24:00" : endLocal.toFormat("HH:mm");
      const offsetChanged = startLocal.offset !== endLocal.offset
        || startLocal.getPossibleOffsets().length > 1 || endLocal.getPossibleOffsets().length > 1;
      const withOffset = (clock: string, local: DateTime) => offsetChanged
        ? `${clock} UTC${local.toFormat("ZZ").replace(/:00$/, "")}` : clock;
      const key = `${row.employeeId}:${day.date}`;
      const badges = cells.get(key) ?? [];
      badges.push({ status: row.status, label: `${withOffset(startClock, startLocal)}–${withOffset(endClock, endLocal)}`, startMillis: clippedStart });
      cells.set(key, badges);
    }
  }
  return new Map([...cells].map(([key, badges]) => [key, badges.sort((left, right) => left.startMillis - right.startMillis)
    .map((badge) => ({ status: badge.status, label: badge.label }))]));
}
