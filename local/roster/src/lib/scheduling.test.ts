import { describe, expect, it } from "vitest";
import { availabilityWarning, conflictingEmployeeIds, dateBelongsToRange, filterEmployees, filterEmployeesByFormalPosition, filterEmployeesByRoles, missingRoleSkills, rangesOverlap, scoreLabel, weeklyHours, workRuleIssues, workRuleWarnings } from "./scheduling";
import type { EmployeeAvailability, Shift, ShiftRole } from "../types/roster";
import type { RosterEmployee } from "../types/workforce";

describe("scheduling rules", () => {
  it("treats touching ranges as non-overlapping", () => expect(rangesOverlap(new Date("2026-09-07T09:00:00Z"), new Date("2026-09-07T10:00:00Z"), new Date("2026-09-07T10:00:00Z"), new Date("2026-09-07T11:00:00Z"))).toBe(false));
  it("detects partial overlap", () => expect(rangesOverlap(new Date("2026-09-07T09:00:00Z"), new Date("2026-09-07T10:30:00Z"), new Date("2026-09-07T10:00:00Z"), new Date("2026-09-07T11:00:00Z"))).toBe(true));
  it("finds assigned employee conflicts", () => expect(conflictingEmployeeIds([shift()], new Date("2026-09-07T09:30:00Z"), new Date("2026-09-07T10:30:00Z")).has("employee-1")).toBe(true));
  it("excludes the shift being edited", () => expect(conflictingEmployeeIds([shift()], new Date("2026-09-07T09:30:00Z"), new Date("2026-09-07T10:30:00Z"), "shift-1").size).toBe(0));
  it("keeps unknown availability explicit", () => expect(availabilityWarning(undefined, new Date(), new Date())).toBe("可用时间未知"));
  it("warns when a shift exceeds all available slots", () => expect(availabilityWarning([availability("AVAILABLE")], new Date("2026-09-07T16:30:00Z"), new Date("2026-09-07T18:00:00Z"))).toBe("超出可用时段"));
  it("allows a shift fully inside the first available slot", () => expect(availabilityWarning([availability("AVAILABLE")], new Date("2026-09-07T10:00:00Z"), new Date("2026-09-07T12:00:00Z"))).toBeNull());
  it("allows a shift fully inside the second available slot", () => expect(availabilityWarning([availability("AVAILABLE"), availability("AVAILABLE", "17:00", "22:00", "a2")], new Date("2026-09-07T18:00:00Z"), new Date("2026-09-07T20:00:00Z"))).toBeNull());
  it("warns when a shift falls between available slots", () => expect(availabilityWarning([availability("AVAILABLE", "09:00", "13:00"), availability("AVAILABLE", "17:00", "22:00", "a2")], new Date("2026-09-07T14:00:00Z"), new Date("2026-09-07T15:00:00Z"))).toBe("超出可用时段"));
  it("warns on an unavailable overlap", () => expect(availabilityWarning([availability("UNAVAILABLE")], new Date("2026-09-07T10:00:00Z"), new Date("2026-09-07T11:00:00Z"))).toBe("标记为不可用"));
  it("does not treat unrelated unavailable time as available time", () => expect(availabilityWarning([availability("UNAVAILABLE", "17:00", "22:00")], new Date("2026-09-07T10:00:00Z"), new Date("2026-09-07T11:00:00Z"))).toBe("没有已登记的可用时间"));
  it("accepts adjacent available slots", () => expect(availabilityWarning([availability("AVAILABLE", "09:00", "13:00"), availability("AVAILABLE", "13:00", "17:00", "a2")], new Date("2026-09-07T10:00:00Z"), new Date("2026-09-07T16:00:00Z"))).toBeNull());
  it("reports missing role skills", () => expect(missingRoleSkills(role(), employee())).toEqual(["order-taking"]));
  it("matches front and water-bar roles using Evaluate's canonical skill codes", () => {
    const qualified = { ...employee(), skillSummary: { ...employee().skillSummary, qualifiedSkillCodes: [
      "transfer-station", "delivery-packing", "drink-dispatch", "order-taking",
      "cup-labeling", "code-scanning", "ice-adding", "cup-spinning",
    ] } };
    const front = { ...role(), requiredSkillCodes: ["transfer-station", "delivery-packing", "drink-dispatch", "order-taking"] };
    const water = { ...role(), requiredSkillCodes: ["cup-labeling", "code-scanning", "ice-adding", "cup-spinning"] };
    expect(missingRoleSkills(front, qualified)).toEqual([]);
    expect(missingRoleSkills(water, qualified)).toEqual([]);
    expect(missingRoleSkills(front, employee())).toContain("transfer-station");
  });
  it("calculates weekly net hours with breaks", () => expect(weeklyHours([shift()], "2026-09-07").get("employee-1")).toBe(0.5));
  it("groups weekly hours by the roster date even when the UTC instant is on the prior day", () => {
    const sydneyMonday = { ...shift(), date: "2026-10-05", startAt: "2026-10-04T22:00:00.000Z", endAt: "2026-10-05T06:00:00.000Z" };
    expect(weeklyHours([sydneyMonday], "2026-10-05").get("employee-1")).toBe(7.5);
    expect(weeklyHours([sydneyMonday], "2026-09-28").has("employee-1")).toBe(false);
  });
  it("maps official score and Tier for display", () => expect(scoreLabel(employee())).toBe("T2 · 82.4"));
  it("does not synthesize a score label", () => expect(scoreLabel({ officialScore: null })).toBe("暂无正式评分"));
  it("uses inclusive date range boundaries", () => { expect(dateBelongsToRange("2026-09-07", "2026-09-07", "2026-09-13")).toBe(true); expect(dateBelongsToRange("2026-09-14", "2026-09-07", "2026-09-13")).toBe(false); });
  it("filters a 500-employee synthetic directory without truncating matches", () => { const employees = Array.from({ length: 500 }, (_, index) => ({ ...employee(), id: `employee-${index}`, displayName: `Team ${index}` })); expect(filterEmployees(employees, "Team 49", "ALL", "ALL")).toHaveLength(11); expect(filterEmployees(employees, "", "REGULAR", "T2")).toHaveLength(500); });
  it("filters employees by one qualified role", () => {
    const qualified = { ...employee(), skillSummary: { ...employee().skillSummary, qualifiedSkillCodes: ["cup-labeling", "order-taking"] } };
    const unqualified = { ...employee(), id: "employee-2", skillSummary: { ...employee().skillSummary, qualifiedSkillCodes: [] } };
    expect(filterEmployeesByRoles([qualified, unqualified], [role()], ["role-1"]).map((item) => item.id)).toEqual(["employee-1"]);
  });
  it("filters Evaluate formal positions independently of Shift Role skills", () => {
    const formallyAssigned = { ...employee(), positions: [{ id: "job-water", code: "WATER", name: "水吧" }] };
    const skillOnly = { ...employee(), id: "employee-2", positions: [],
      skillSummary: { ...employee().skillSummary, qualifiedSkillCodes: ["cup-labeling", "order-taking"] } };
    expect(filterEmployeesByFormalPosition([formallyAssigned, skillOnly], "job-water").map((item) => item.id)).toEqual(["employee-1"]);
    expect(filterEmployeesByFormalPosition([formallyAssigned, skillOnly], "UNCONFIRMED").map((item) => item.id)).toEqual(["employee-2"]);
    expect(filterEmployeesByRoles([skillOnly], [role()], ["role-1"])).toHaveLength(1);
  });
  it("uses OR semantics for multiple role filters and clears back to all employees", () => {
    const front = { ...employee(), skillSummary: { ...employee().skillSummary, qualifiedSkillCodes: ["cup-labeling", "order-taking"] } };
    const bar = { ...employee(), id: "employee-2", skillSummary: { ...employee().skillSummary, qualifiedSkillCodes: ["drink-making"] } };
    const roles = [role(), { ...role(), id: "role-2", code: "bar", nameZh: "水吧", requiredSkillCodes: ["drink-making"] }];
    expect(filterEmployeesByRoles([front, bar], roles, ["role-1", "role-2"])).toHaveLength(2);
    expect(filterEmployeesByRoles([front, bar], roles, [])).toHaveLength(2);
  });
  it("applies daily, configured-week and break warnings without treating a fortnight as one week", () => {
    const longShift = { ...shift(), endAt: "2026-09-07T21:30:00.000Z", breakMinutes: 0 };
    const secondWeek = { ...longShift, id: "shift-2", date: "2026-09-14", startAt: "2026-09-14T09:00:00.000Z", endAt: "2026-09-14T21:30:00.000Z" };
    const warnings = workRuleWarnings([longShift, secondWeek], { dailyHourWarning: 10, weeklyHourWarning: 20, defaultBreakMinutes: 30, weekStartsOn: 1 });
    expect(warnings.filter((warning) => warning.includes("每日 10 小时"))).toHaveLength(2);
    expect(warnings.some((warning) => warning.includes("休息少于门店默认 30 分钟"))).toBe(true);
    expect(warnings.some((warning) => warning.includes("每周 20 小时"))).toBe(false);
  });
  it("returns nonblocking warning codes with affected shift and employee metadata", () => {
    const longShift = { ...shift(), endAt: "2026-09-07T21:30:00.000Z", breakMinutes: 0 };
    const issues = workRuleIssues([longShift], { dailyHourWarning: 10, weeklyHourWarning: 10, defaultBreakMinutes: 30, weekStartsOn: 1 });
    expect(issues.map((issue) => issue.code)).toEqual(["BREAK_WARNING", "DAILY_HOURS_WARNING", "WEEKLY_HOURS_WARNING"]);
    expect(issues.every((issue) => issue.severity === "WARNING")).toBe(true);
    expect(issues[0]).toMatchObject({ shiftId: "shift-1", storeId: "store-1", metadata: { date: "2026-09-07", breakMinutes: 0, recommendedBreakMinutes: 30 } });
    expect(issues[1]).toMatchObject({ employeeId: "employee-1", employeeName: "HandoverEmployee006", metadata: { hours: 12.5, threshold: 10 } });
  });
});

function shift(): Shift { return { id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: "2026-09-07", startAt: "2026-09-07T09:00:00.000Z", endAt: "2026-09-07T10:00:00.000Z", breakMinutes: 30, shiftRoleId: "role-1", roleNameSnapshot: "前场", roleColorSnapshot: "#2563eb", publicNote: null, internalNote: null, version: 1, shiftRole: role(), assignments: [{ id: "assignment-1", employeeId: "employee-1", employeeNameSnapshot: "HandoverEmployee006", employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: "82.4", tierSnapshot: "T2" }] }; }
function availability(status: "AVAILABLE" | "UNAVAILABLE", start = "09:00", end = "17:00", id = "a1"): EmployeeAvailability { return { id, employeeId: "employee-1", storeId: "store-1", date: "2026-09-07", status, startAt: `2026-09-07T${start}:00.000Z`, endAt: `2026-09-07T${end}:00.000Z`, note: null, source: "MANUAL", version: 1 }; }
function role(): ShiftRole { return { id: "role-1", storeId: null, code: "front", nameZh: "前场", colorToken: "#2563eb", requiredSkillCodes: ["cup-labeling", "order-taking"] }; }
function employee(): RosterEmployee { return { id: "employee-1", displayName: "HandoverEmployee006", employeeType: "REGULAR", employmentType: "PartTime", storeId: "store-1", storeName: "Hurstville", isActive: true, officialScore: { score: 82.4, tier: "T2", roundId: "round-1", closedAt: "2026-09-01T00:00:00Z" }, skillSummary: { overallPercent: 50, backOfHousePercent: 20, waterBarPercent: 50, frontOfHousePercent: 80, qualifiedSkillCodes: ["cup-labeling"], skills: [], operations: { opening: "UNKNOWN", closing: "CAN_DO", weeklyCleaning: "CANNOT_DO" } } }; }
