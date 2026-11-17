import { describe, expect, it } from "vitest";
import type { Shift } from "../types/roster";
import { findMatchingShift } from "./mutationReconciliation";

const input = {
  date: "2026-10-07", startAt: "2026-10-06T22:00:00.000Z", endAt: "2026-10-07T06:00:00.000Z",
  breakMinutes: 30, shiftRoleId: "role-1", employeeIds: ["employee-2", "employee-1"],
  publicNote: "front", internalNote: "manager",
};
const shift: Shift = {
  id: "shift-1", rosterPeriodId: "period-1", storeId: "store-1", date: input.date,
  startAt: input.startAt, endAt: input.endAt, breakMinutes: input.breakMinutes,
  shiftRoleId: input.shiftRoleId, roleNameSnapshot: "Front", roleColorSnapshot: "blue",
  publicNote: input.publicNote, internalNote: input.internalNote, version: 1,
  shiftRole: { id: "role-1", storeId: "store-1", code: "front", nameZh: "Front", colorToken: "blue", requiredSkillCodes: [], isActive: true, displayOrder: 0, version: 1 },
  assignments: ["employee-1", "employee-2"].map((employeeId) => ({ id: employeeId, employeeId, employeeNameSnapshot: employeeId, employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null })),
};

describe("uncertain mutation reconciliation", () => {
  it("recognizes an exact authoritative shift independent of assignment order", () => {
    expect(findMatchingShift([shift], input)).toBe(shift);
    expect(findMatchingShift([shift], input, "shift-1")).toBe(shift);
  });

  it("does not mistake a similar but different assignment or note for a saved shift", () => {
    expect(findMatchingShift([shift], { ...input, employeeIds: ["employee-1"] })).toBeNull();
    expect(findMatchingShift([shift], { ...input, internalNote: "other" })).toBeNull();
    expect(findMatchingShift([shift], input, "shift-2")).toBeNull();
  });

  it("does not treat an existing identical shift or an unchanged edit as this attempt's success", () => {
    expect(findMatchingShift([shift], input, undefined, new Set(["shift-1"]))).toBeNull();
    expect(findMatchingShift([shift], input, "shift-1", undefined, 1)).toBeNull();
    expect(findMatchingShift([{ ...shift, id: "shift-2" }], input, undefined, new Set(["shift-1"]))).not.toBeNull();
    expect(findMatchingShift([{ ...shift, version: 2 }], input, "shift-1", undefined, 1)).not.toBeNull();
  });
});
