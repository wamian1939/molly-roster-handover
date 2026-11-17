import { describe, expect, it } from "vitest";
import { firstSchedulingIssue, intervalsOverlap, type SchedulingIssue } from "../src/schedulingIssue.js";

describe("scheduling decision model", () => {
  it("treats touching intervals as non-overlapping", () => {
    const at = (time: string) => new Date(`2037-10-07T${time}:00.000Z`);
    expect(intervalsOverlap(at("09:00"), at("12:00"), at("12:00"), at("15:00"))).toBe(false);
    expect(intervalsOverlap(at("09:00"), at("12:01"), at("12:00"), at("15:00"))).toBe(true);
    expect(intervalsOverlap(at("23:00"), new Date("2037-10-08T02:00:00.000Z"), new Date("2037-10-08T01:00:00.000Z"), new Date("2037-10-08T04:00:00.000Z"))).toBe(true);
  });

  it("chooses lock and structure errors before availability and overlap", () => {
    const issue = (code: SchedulingIssue["code"]): SchedulingIssue => ({ code, severity: "BLOCKING_ERROR", message: code });
    expect(firstSchedulingIssue([issue("SHIFT_OVERLAP"), issue("EMPLOYEE_UNAVAILABLE"), issue("PERIOD_PUBLISHED")])?.code).toBe("PERIOD_PUBLISHED");
    expect(firstSchedulingIssue([issue("SHIFT_OVERLAP"), issue("INVALID_TIME_RANGE")])?.code).toBe("INVALID_TIME_RANGE");
  });
});
