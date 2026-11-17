import { describe, expect, it } from "vitest";
import { copyShiftWallClock, zonedClockToDate, zonedLocalParts } from "../src/zonedCopy.js";

const zone = "Australia/Sydney";
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("calendar date copy across Sydney daylight saving", () => {
  it("keeps 09:00–17:00 local clock time across the October transition", () => {
    const copied = copyShiftWallClock({ date: date("2026-09-28"), startAt: zonedClockToDate("2026-09-28", "09:00", zone), endAt: zonedClockToDate("2026-09-28", "17:00", zone) }, 7, zone);
    expect(copied.date).toBe("2026-10-05");
    expect(zonedLocalParts(copied.startAt, zone)).toEqual({ date: "2026-10-05", time: "09:00" });
    expect(zonedLocalParts(copied.endAt, zone)).toEqual({ date: "2026-10-05", time: "17:00" });
    expect(copied.endAt.getTime() - copied.startAt.getTime()).toBe(8 * 3_600_000);
  });

  it("keeps an overnight local end date across the April transition", () => {
    const copied = copyShiftWallClock({ date: date("2026-03-28"), startAt: zonedClockToDate("2026-03-28", "23:00", zone), endAt: zonedClockToDate("2026-03-29", "02:00", zone) }, 7, zone);
    expect(zonedLocalParts(copied.startAt, zone)).toEqual({ date: "2026-04-04", time: "23:00" });
    expect(zonedLocalParts(copied.endAt, zone)).toEqual({ date: "2026-04-05", time: "02:00" });
  });

  it("rejects nonexistent spring clock times and resolves repeated fall times deterministically", () => {
    expect(() => zonedClockToDate("2026-10-04", "02:30", zone)).toThrow(/does not exist/);
    expect(zonedClockToDate("2026-04-05", "02:30", zone).toISOString()).toBe("2026-04-04T15:30:00.000Z");
  });

  it("preserves first-to-second repeated clock occurrences when copying to another fall-back date", () => {
    const copied = copyShiftWallClock({ date: date("2026-04-05"), startAt: new Date("2026-04-04T15:30:00.000Z"),
      endAt: new Date("2026-04-04T16:30:00.000Z") }, 364, zone);
    expect(copied.date).toBe("2027-04-04");
    expect(copied.startAt.toISOString()).toBe("2027-04-03T15:30:00.000Z");
    expect(copied.endAt.toISOString()).toBe("2027-04-03T16:30:00.000Z");
    expect(copied.endAt.getTime() - copied.startAt.getTime()).toBe(3_600_000);
  });

  it("rejects a copied repeated-clock shift on a target date with no elapsed duration", () => {
    expect(() => copyShiftWallClock({ date: date("2026-04-05"), startAt: new Date("2026-04-04T15:30:00.000Z"),
      endAt: new Date("2026-04-04T16:30:00.000Z") }, 7, zone)).toThrow(/结束时间必须晚于开始时间/);
  });
});
