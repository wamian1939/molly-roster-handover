import type { CalendarView } from "../types/roster";

const CALENDAR_VIEWS: readonly CalendarView[] = ["dayGridMonth", "timeGridWeek", "timeGridDay"];

export function calendarViewFromQuery(value: string | null, fallback: CalendarView): CalendarView {
  return CALENDAR_VIEWS.find((view) => view === value) ?? fallback;
}

export function calendarDateFromQuery(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : undefined;
}

export function calendarQueryWithContext(current: URLSearchParams, context: { storeId: string; view: CalendarView; date?: string }): URLSearchParams {
  const next = new URLSearchParams(current);
  if (context.storeId) next.set("store", context.storeId);
  else next.delete("store");
  next.set("view", context.view);
  if (context.date) next.set("date", context.date);
  else next.delete("date");
  return next;
}
