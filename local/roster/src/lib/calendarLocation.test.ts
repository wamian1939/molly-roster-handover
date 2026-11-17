import { describe, expect, it } from "vitest";
import { calendarDateFromQuery, calendarQueryWithContext, calendarViewFromQuery } from "./calendarLocation";

describe("Calendar URL context", () => {
  it("restores only supported views and real calendar dates", () => {
    expect(calendarViewFromQuery("dayGridMonth", "timeGridWeek")).toBe("dayGridMonth");
    expect(calendarViewFromQuery("unknown", "timeGridDay")).toBe("timeGridDay");
    expect(calendarDateFromQuery("2026-11-09")).toBe("2026-11-09");
    expect(calendarDateFromQuery("2026-02-30")).toBeUndefined();
    expect(calendarDateFromQuery("not-a-date")).toBeUndefined();
  });

  it("replaces navigation context while retaining unrelated query values", () => {
    const query = calendarQueryWithContext(new URLSearchParams("x=1&store=old&view=timeGridDay"),
      { storeId: "browser-store", view: "dayGridMonth", date: "2026-11-01" });
    expect(query.toString()).toContain("x=1");
    expect(query.get("store")).toBe("browser-store");
    expect(query.get("view")).toBe("dayGridMonth");
    expect(query.get("date")).toBe("2026-11-01");
  });
});
