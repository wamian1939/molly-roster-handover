import { addCalendarDays, isStoreClockChangeDate, storeDateTime, storeParts } from "./storeTime";

export type TimeGridPointerSlot = { date: string; time: string };

export function createCalendarPointerOwner() {
  let pointerId: number | null = null;
  return {
    begin(nextId: number) {
      if (pointerId !== null) return false;
      pointerId = nextId;
      return true;
    },
    owns(nextId: number) { return pointerId === nextId; },
    end(nextId: number) {
      if (pointerId !== nextId) return false;
      pointerId = null;
      return true;
    },
    cancel() { pointerId = null; },
  };
}

/** BHS treats an upward drag's initial slot as the exclusive end boundary. */
export function upwardTimeGridSelectionEnd(first: TimeGridPointerSlot | null, start: Date, end: Date, slotMinutes: number, timezone: string): Date | null {
  if (!first || !Number.isInteger(slotMinutes) || slotMinutes <= 0 || isStoreClockChangeDate(first.date, timezone)) return null;
  if (storeParts(start, timezone).date !== first.date) return null;
  const boundary = storeDateTime(first.date, first.time, timezone);
  return boundary.getTime() > start.getTime() && end.getTime() - boundary.getTime() === slotMinutes * 60_000
    ? boundary : null;
}

export function timeGridPointerSlot(point: {
  clientX?: number;
  clientY?: number;
  changedTouches?: ArrayLike<{ clientX: number; clientY: number }>;
  touches?: ArrayLike<{ clientX: number; clientY: number }>;
}, root: Document = document): TimeGridPointerSlot | null {
  const touch = point.changedTouches?.[0] ?? point.touches?.[0];
  const x = touch?.clientX ?? point.clientX;
  const y = touch?.clientY ?? point.clientY;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const elements = root.elementsFromPoint(x!, y!);
  const clock = elements.find((element) => element.matches(".fc-timegrid-slot-lane[data-time]"))?.getAttribute("data-time")?.slice(0, 5);
  const date = elements.find((element) => element.matches(".fc-timegrid-col[data-date]"))?.getAttribute("data-date");
  return clock && /^([01]\d|2[0-3]):[0-5]\d$/.test(clock) && date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? { date, time: clock } : null;
}

export function timeGridPointerRange(first: TimeGridPointerSlot, last: TimeGridPointerSlot, slotMinutes: number, timezone: string) {
  if (first.date !== last.date || !Number.isInteger(slotMinutes) || slotMinutes <= 0) return null;
  const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));
  const firstMinutes = minutes(first.time);
  const lastMinutes = minutes(last.time);
  const startMinutes = Math.min(firstMinutes, lastMinutes);
  // The initial slot is the exclusive end when dragging upward, including on
  // a clock-change date. Downward selection includes the final hovered slot.
  const endMinutes = lastMinutes < firstMinutes ? firstMinutes : lastMinutes + slotMinutes;
  const clock = (total: number) => `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  const start = storeDateTime(first.date, clock(startMinutes), timezone);
  const endDate = endMinutes >= 1440 ? addCalendarDays(first.date, 1) : first.date;
  const end = storeDateTime(endDate, clock(endMinutes % 1440), timezone);
  return { date: first.date, start, end };
}
