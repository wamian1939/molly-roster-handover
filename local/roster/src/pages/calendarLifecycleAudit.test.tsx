import { render } from "@testing-library/react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { useEffect, useMemo, useRef } from "react";
import { expect, it, vi } from "vitest";
import { positionCalendarEvent, positionVisibleCalendarEvents } from "../lib/calendarDomPlacement";
import type { CalendarOverlapPlacement } from "../lib/calendarOverlap";

type Event = { id: string; start: string; end: string };

function CalendarWithManagedColumns({ events, onMount }: { events: Event[]; onMount: (id: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const placements = useMemo(() => new Map(events.map((event, index) => [`2026-10-28:${event.id}`, {
    columnIndex: index, columnCount: events.length, columnSpan: 1,
  } as CalendarOverlapPlacement])), [events]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (root.current) positionVisibleCalendarEvents(root.current, placements);
    });
    return () => cancelAnimationFrame(frame);
  }, [placements]);
  return <div ref={root}><FullCalendar plugins={[timeGridPlugin]} initialView="timeGridDay" initialDate="2026-10-28"
    timeZone="UTC" headerToolbar={false} events={events.map((event) => ({ ...event, classNames: ["roster-layout-managed"] }))}
    eventDidMount={(info) => {
      onMount(info.event.id);
      info.el.dataset.rosterEventId = info.event.id;
      requestAnimationFrame(() => {
        if (info.el.isConnected) positionCalendarEvent(info.el, placements);
      });
    }}/></div>;
}

it("audits FullCalendar mount callbacks when an overlapping event is added", async () => {
  const mounted = vi.fn();
  const base = [
    { id: "one", start: "2026-10-28T10:00:00Z", end: "2026-10-28T13:00:00Z" },
    { id: "two", start: "2026-10-28T10:00:00Z", end: "2026-10-28T13:00:00Z" },
  ];
  const view = render(<CalendarWithManagedColumns events={base} onMount={mounted} />);
  const eventRight = (id: string) => (view.container.querySelector(`[data-roster-event-id="${id}"]`)
    ?.closest<HTMLElement>(".fc-timegrid-event-harness"))?.style.right;
  await vi.waitFor(() => expect(mounted).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(eventRight("one")).toBe("50%"));
  mounted.mockClear();
  const expanded = [...base, { id: "three", start: "2026-10-28T10:00:00Z", end: "2026-10-28T13:00:00Z" }];
  view.rerender(<CalendarWithManagedColumns events={expanded} onMount={mounted} />);
  await vi.waitFor(() => expect(mounted).toHaveBeenCalled());
  expect(mounted.mock.calls.map((call) => call[0])).toEqual(["three"]);
  await vi.waitFor(() => expect(eventRight("one")).toBe("66.66666666666666%"));
  expect(eventRight("three")).toBe("0%");
  view.rerender(<CalendarWithManagedColumns events={base} onMount={mounted} />);
  await vi.waitFor(() => expect(eventRight("one")).toBe("50%"));
});
