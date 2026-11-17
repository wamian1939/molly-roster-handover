import { describe, expect, it } from "vitest";
import type { Shift, ShiftRole } from "../types/roster";
import type { RosterEmployee } from "../types/workforce";
import { calendarPublishBlockers } from "./calendarPublish";

const role = { id: "formal-role", storeId: "hurstville", nameZh: "全岗", isActive: true } as ShiftRole;
const employee = { id: "employee-a", storeId: "hurstville", isActive: true } as RosterEmployee;
const shift = {
  id: "shift-a", date: "2026-10-06", shiftRoleId: role.id, roleNameSnapshot: role.nameZh,
  assignments: [{ employeeId: employee.id, employeeNameSnapshot: "员工 A" }],
} as Shift;

describe("Calendar publish preflight", () => {
  it("allows a draft with a current formal role and active employee", () => {
    expect(calendarPublishBlockers([shift], [role], [employee], "hurstville")).toEqual([]);
  });

  it("points to the legacy role without changing the saved shift", () => {
    const legacy = { ...shift, shiftRoleId: "legacy-role", roleNameSnapshot: "验收岗" };
    expect(calendarPublishBlockers([legacy], [role], [employee], "hurstville"))
      .toEqual(["2026-10-06 · 岗位「验收岗」不在当前门店正式岗位清单中，请编辑班次更换岗位"]);
    expect(legacy.shiftRoleId).toBe("legacy-role");
  });

  it("also blocks unassigned shifts and inactive or cross-store employees", () => {
    const unassigned = { ...shift, assignments: [] };
    expect(calendarPublishBlockers([unassigned], [role], [employee], "hurstville")).toHaveLength(1);
    expect(calendarPublishBlockers([shift], [role], [{ ...employee, isActive: false }], "hurstville")[0])
      .toContain("已不在当前门店在职名单");
    expect(calendarPublishBlockers([shift], [role], [{ ...employee, storeId: "other" }], "hurstville")[0])
      .toContain("已不在当前门店在职名单");
  });
});
