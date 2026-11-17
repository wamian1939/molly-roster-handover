import { describe, expect, it } from "vitest";
import { capacitySignal, reportingHeadcount } from "../src/employeeCapacity.js";

describe("employee capacity signals", () => {
  it("uses the agreed 100% and exact 120% boundaries", () => {
    expect(capacitySignal(5, 4)).toBe("GREEN");
    expect(capacitySignal(5, 5)).toBe("YELLOW");
    expect(capacitySignal(5, 6)).toBe("RED");
    expect(capacitySignal(3, 3)).toBe("YELLOW");
    expect(capacitySignal(3, 4)).toBe("RED");
    expect(capacitySignal(0, 0)).toBe("RED");
  });
  it("counts each person once, merges adjacent slots, excludes gaps and boundary-only overlap", () => {
    const people = [
      [{ start: "10:00", end: "10:30" }, { start: "10:30", end: "12:00" }],
      [{ start: "10:00", end: "10:30" }, { start: "11:00", end: "12:00" }],
      [{ start: "11:00", end: "12:00" }],
      [{ start: "09:00", end: "10:00" }],
    ];
    expect(reportingHeadcount(people, "10:00", "11:00")).toBe(1);
    expect(reportingHeadcount(people, "11:00", "11:30")).toBe(3);
  });
});
