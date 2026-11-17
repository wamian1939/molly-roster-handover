import { describe, expect, it } from "vitest";
import { schedulingFeedback } from "./schedulingFeedback";

describe("calendar validation feedback", () => {
  it("identifies employee, time and reason for unavailable assignments", () => {
    const message = schedulingFeedback({ code: "EMPLOYEE_UNAVAILABLE", severity: "BLOCKING_ERROR", message: "", employeeId: "employee-1", employeeName: "Alex", start: "2026-10-07T03:00:00.000Z", end: "2026-10-07T06:00:00.000Z" }, "fallback");
    expect(message).toContain("Alex");
    expect(message).toContain("可用时间");
    expect(message).toContain("14:00");
  });

  it("uses validation codes rather than parsing server text", () => {
    expect(schedulingFeedback({ code: "PERIOD_PUBLISHED", severity: "BLOCKING_ERROR", message: "opaque" }, "fallback")).toContain("重新打开");
    expect(schedulingFeedback({ code: "INVALID_SLOT_ALIGNMENT", severity: "BLOCKING_ERROR", message: "opaque", metadata: { slotIntervalMinutes: 30 } }, "fallback")).toContain("30 分钟");
  });

  it("explains formal Job authorization without treating skills as grants", () => {
    expect(schedulingFeedback({ code: "UNQUALIFIED_EMPLOYEE_ROLE", severity: "BLOCKING_ERROR", message: "opaque", employeeName: "HandoverEmployee006" }, "fallback"))
      .toContain("HandoverEmployee006 尚未获得该正式岗位授权");
  });

  it("formats the conflict in the selected store timezone", () => {
    const issue = { code: "SHIFT_OVERLAP", severity: "BLOCKING_ERROR" as const, message: "", employeeName: "Alex", start: "2026-10-07T03:00:00.000Z", end: "2026-10-07T06:00:00.000Z" };
    expect(schedulingFeedback(issue, "fallback", "Australia/Sydney")).toContain("14:00");
    expect(schedulingFeedback(issue, "fallback", "America/New_York")).toContain("23:00");
  });
});
