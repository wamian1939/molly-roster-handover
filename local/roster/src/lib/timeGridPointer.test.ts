import { describe, expect, it, vi } from "vitest";
import { createCalendarPointerOwner, timeGridPointerRange, timeGridPointerSlot, upwardTimeGridSelectionEnd } from "./timeGridPointer";

describe("calendar pointer ownership", () => {
  it("keeps the first pointer until it ends or is cancelled", () => {
    const owner = createCalendarPointerOwner();
    expect(owner.begin(1)).toBe(true);
    expect(owner.begin(2)).toBe(false);
    expect(owner.owns(1)).toBe(true);
    expect(owner.owns(2)).toBe(false);
    expect(owner.end(2)).toBe(false);
    expect(owner.owns(1)).toBe(true);
    expect(owner.end(1)).toBe(true);
    expect(owner.begin(2)).toBe(true);
    owner.cancel();
    expect(owner.begin(3)).toBe(true);
  });
});

describe("visible time-grid pointer times", () => {
  it("uses the first slot boundary as the exclusive end of an upward selection", () => {
    const first = { date: "2026-10-20", time: "09:30" };
    const start = new Date("2026-10-19T21:00:00.000Z");
    const end = new Date("2026-10-19T23:00:00.000Z");
    expect(upwardTimeGridSelectionEnd(first, start, end, 30, "Australia/Sydney")?.toISOString()).toBe("2026-10-19T22:30:00.000Z");
    expect(upwardTimeGridSelectionEnd({ date: first.date, time: "08:00" }, start, end, 30, "Australia/Sydney")).toBeNull();
    expect(upwardTimeGridSelectionEnd(first, start, end, 15, "Australia/Sydney")).toBeNull();
  });
  it("reads the labeled slot and store date under the pointer", () => {
    const lane = document.createElement("td");
    lane.className = "fc-timegrid-slot-lane";
    lane.dataset.time = "03:30:00";
    const column = document.createElement("td");
    column.className = "fc-timegrid-col";
    column.dataset.date = "2026-10-04";
    const elementsFromPoint = vi.fn().mockReturnValue([lane, column]);
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: elementsFromPoint });
    expect(timeGridPointerSlot({ clientX: 10, clientY: 20 })).toEqual({ date: "2026-10-04", time: "03:30" });
    Reflect.deleteProperty(document, "elementsFromPoint");
  });

  it("reads touch-end coordinates and ignores events without finite coordinates", () => {
    const lane = document.createElement("td");
    lane.className = "fc-timegrid-slot-lane";
    lane.dataset.time = "10:30:00";
    const column = document.createElement("td");
    column.className = "fc-timegrid-col";
    column.dataset.date = "2026-10-21";
    const elementsFromPoint = vi.fn().mockReturnValue([lane, column]);
    Object.defineProperty(document, "elementsFromPoint", { configurable: true, value: elementsFromPoint });
    expect(timeGridPointerSlot({ changedTouches: [{ clientX: 100, clientY: 200 }] })).toEqual({ date: "2026-10-21", time: "10:30" });
    expect(elementsFromPoint).toHaveBeenCalledWith(100, 200);
    expect(timeGridPointerSlot({ changedTouches: [], touches: [] })).toBeNull();
    expect(timeGridPointerSlot({ clientX: Number.NaN, clientY: 200 })).toBeNull();
    expect(elementsFromPoint).toHaveBeenCalledTimes(1);
    Reflect.deleteProperty(document, "elementsFromPoint");
  });

  it("uses wall-clock slots across spring-forward and refuses nonexistent endpoints", () => {
    // BHS Day on 4 October shows 02:00/02:30 rows. A blank 01:30-to-04:00-slot
    // drag opens 01:30–04:30; the elapsed time is two hours after the jump.
    const crossing = timeGridPointerRange({ date: "2026-10-04", time: "01:30" }, { date: "2026-10-04", time: "04:00" }, 30, "Australia/Sydney");
    expect(crossing?.start.toISOString()).toBe("2026-10-03T15:30:00.000Z");
    expect(crossing?.end.toISOString()).toBe("2026-10-03T17:30:00.000Z");
    const valid = timeGridPointerRange({ date: "2026-10-04", time: "03:30" }, { date: "2026-10-04", time: "04:00" }, 30, "Australia/Sydney");
    expect(valid?.start.toISOString()).toBe("2026-10-03T16:30:00.000Z");
    expect(valid?.end.toISOString()).toBe("2026-10-03T17:30:00.000Z");
    expect(() => timeGridPointerRange({ date: "2026-10-04", time: "02:30" }, { date: "2026-10-04", time: "03:00" }, 30, "Australia/Sydney")).toThrow(/不存在/);
  });

  it("retains the earlier fall-back occurrence and rejects another date column", () => {
    const range = timeGridPointerRange({ date: "2026-04-05", time: "02:00" }, { date: "2026-04-05", time: "02:30" }, 30, "Australia/Sydney");
    expect(range?.start.toISOString()).toBe("2026-04-04T15:00:00.000Z");
    expect(range?.end.toISOString()).toBe("2026-04-04T17:00:00.000Z");
    expect(timeGridPointerRange({ date: "2026-10-04", time: "23:00" }, { date: "2026-10-05", time: "00:00" }, 30, "Australia/Sydney")).toBeNull();
  });

  it("uses the initial slot as the exclusive end of an upward DST-day drag", () => {
    const spring = timeGridPointerRange({ date: "2026-10-04", time: "04:00" }, { date: "2026-10-04", time: "03:30" }, 30, "Australia/Sydney");
    expect(spring?.start.toISOString()).toBe("2026-10-03T16:30:00.000Z");
    expect(spring?.end.toISOString()).toBe("2026-10-03T17:00:00.000Z");
    const autumn = timeGridPointerRange({ date: "2026-04-05", time: "03:30" }, { date: "2026-04-05", time: "02:00" }, 30, "Australia/Sydney");
    expect(autumn?.start.toISOString()).toBe("2026-04-04T15:00:00.000Z");
    expect(autumn?.end.toISOString()).toBe("2026-04-04T17:30:00.000Z");
  });
});
