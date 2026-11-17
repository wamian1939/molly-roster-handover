import { describe, expect, it } from "vitest";
import { isCoveredByAvailability } from "../src/rosterService.js";

const at = (hour: number) => new Date(`2026-10-07T${String(hour).padStart(2, "0")}:00:00.000Z`);
const slot = (status: "AVAILABLE" | "UNAVAILABLE" | "UNKNOWN", start: number, end: number) => ({ status, startAt: at(start), endAt: at(end) });

describe("strict shift availability", () => {
  it("rejects missing and unknown availability", () => {
    expect(isCoveredByAvailability([], at(10), at(12))).toBe(false);
    expect(isCoveredByAvailability([slot("UNKNOWN", 9, 17)], at(10), at(12))).toBe(false);
  });

  it("accepts a fully covered interval, including adjacent available slots", () => {
    expect(isCoveredByAvailability([slot("AVAILABLE", 9, 13)], at(10), at(12))).toBe(true);
    expect(isCoveredByAvailability([slot("AVAILABLE", 13, 17), slot("AVAILABLE", 9, 13)], at(10), at(17))).toBe(true);
  });

  it("rejects gaps, boundaries and explicit unavailable overlap", () => {
    expect(isCoveredByAvailability([slot("AVAILABLE", 9, 13), slot("AVAILABLE", 14, 17)], at(10), at(16))).toBe(false);
    expect(isCoveredByAvailability([slot("AVAILABLE", 9, 17)], at(8), at(12))).toBe(false);
    expect(isCoveredByAvailability([slot("AVAILABLE", 9, 17), slot("UNAVAILABLE", 12, 13)], at(10), at(15))).toBe(false);
  });

  it("uses exact minute boundaries with half-open coverage", () => {
    const available = [slot("AVAILABLE", 9, 17)];
    expect(isCoveredByAvailability(available, at(9), at(17))).toBe(true);
    expect(isCoveredByAvailability(available, new Date(at(9).getTime() - 60_000), at(17))).toBe(false);
    expect(isCoveredByAvailability(available, at(9), new Date(at(17).getTime() + 60_000))).toBe(false);
    expect(isCoveredByAvailability([...available, slot("UNAVAILABLE", 17, 18)], at(9), at(17))).toBe(true);
  });
});
