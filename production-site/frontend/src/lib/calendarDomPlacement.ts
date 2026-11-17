import { calendarOverlapInsets, type CalendarOverlapPlacement } from "./calendarOverlap";

type Placements = ReadonlyMap<string, CalendarOverlapPlacement>;

export function positionCalendarEvent(element: HTMLElement, placements: Placements) {
  const harness = element.closest<HTMLElement>(".fc-timegrid-event-harness");
  if (!harness) return;
  const date = element.closest<HTMLElement>(".fc-timegrid-col[data-date]")?.dataset.date;
  const eventId = element.dataset.rosterEventId;
  const placement = date && eventId ? placements.get(`${date}:${eventId}`) : undefined;
  if (placement) {
    const { left, right } = calendarOverlapInsets(placement);
    harness.style.left = left;
    harness.style.right = right;
  } else {
    harness.style.removeProperty("left");
    harness.style.removeProperty("right");
  }
  harness.classList.add("roster-positioned");
}

export function positionVisibleCalendarEvents(root: HTMLElement, placements: Placements) {
  root.querySelectorAll<HTMLElement>(".fc-timegrid-event-harness .roster-layout-managed[data-roster-event-id]")
    .forEach((element) => positionCalendarEvent(element, placements));
}
