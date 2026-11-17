type CalendarDuration = { years: number; months: number; days: number; milliseconds: number };

/** A move keeps elapsed duration even when the destination crosses a DST change. */
export function calendarMoveInstants(original: { startAt: string; endAt: string }, targetStart: Date) {
  const duration = new Date(original.endAt).getTime() - new Date(original.startAt).getTime();
  return { start: targetStart, end: new Date(targetStart.getTime() + duration) };
}

/**
 * FullCalendar can lose the original end instant when two local clock readings
 * are equal during a fall-back hour. Its resize deltas still describe the
 * pointer's snapped movement, so apply them to the authoritative Shift UTC
 * instants instead of the reconstructed event end.
 */
export function calendarResizeInstants(
  original: { startAt: string; endAt: string },
  changed: { start: Date; end: Date },
  startDelta: CalendarDuration,
  endDelta: CalendarDuration,
) {
  const exact = [startDelta, endDelta].every((delta) => delta.years === 0 && delta.months === 0 &&
    delta.days === 0 && Number.isFinite(delta.milliseconds));
  if (!exact) return changed;
  return {
    start: new Date(new Date(original.startAt).getTime() + startDelta.milliseconds),
    end: new Date(new Date(original.endAt).getTime() + endDelta.milliseconds),
  };
}
