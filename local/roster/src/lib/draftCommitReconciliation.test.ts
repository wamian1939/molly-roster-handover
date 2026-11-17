import { describe, expect, it } from "vitest";
import type { DraftChange } from "./calendarDraftQueue";
import { draftChangeReadbackState } from "./draftCommitReconciliation";
import type { Shift } from "../types/roster";

const value = { date: "2026-10-27", startAt: "2026-10-26T23:00:00.000Z",
  endAt: "2026-10-27T06:00:00.000Z", breakMinutes: 30, shiftRoleId: "role-1",
  employeeIds: ["employee-1"], publicNote: "", internalNote: "" };
const created: DraftChange = { kind: "create", clientShiftId: "created-1", value };
const updated: DraftChange = { kind: "update", shiftId: "updated-1", baseVersion: 2, basePeriodId: "period-1", value };
const deleted: DraftChange = { kind: "delete", shiftId: "deleted-1", baseVersion: 3, basePeriodId: "period-1" };
function shift(id: string, version: number): Shift {
  return { ...value, id, version, storeId: "store-1", rosterPeriodId: "period-1",
    roleNameSnapshot: "服务", roleColorSnapshot: "rose", shiftRole: {} as Shift["shiftRole"],
    assignments: [{ id: `assignment-${id}`, employeeId: "employee-1", employeeNameSnapshot: "Employee",
      employeeTypeSnapshot: "PartTime", officialScoreSnapshot: null, tierSnapshot: null }] };
}
const state = (change: DraftChange, current: Shift | null) =>
  draftChangeReadbackState(change, current, "store-1", "period-1");

describe("draft commit readback", () => {
  it("confirms only exact created and version-advanced updated shifts", () => {
    expect(state(created, shift("created-1", 1))).toBe("committed");
    expect(state(updated, shift("updated-1", 3))).toBe("committed");
    expect(state(updated, shift("updated-1", 2))).toBe("unchanged");
    expect(state(updated, { ...shift("updated-1", 3), breakMinutes: 0 })).toBe("unknown");
  });

  it("does not confirm a matching Shift moved into another period or store", () => {
    expect(state(created, { ...shift("created-1", 1), rosterPeriodId: "other-period" })).toBe("unknown");
    expect(state(updated, { ...shift("updated-1", 3), rosterPeriodId: "other-period" })).toBe("unknown");
    expect(state(updated, { ...shift("updated-1", 3), storeId: "other-store" })).toBe("unknown");
    expect(state(created, shift("other-id", 1))).toBe("unknown");
  });

  it("distinguishes absent, unchanged and changed rows without guessing", () => {
    expect(state(created, null)).toBe("unchanged");
    expect(state(updated, null)).toBe("unknown");
    expect(state(deleted, null)).toBe("committed");
    expect(state(deleted, shift("deleted-1", 3))).toBe("unchanged");
    expect(state(deleted, shift("deleted-1", 4))).toBe("unknown");
    expect(state(deleted, { ...shift("deleted-1", 3), rosterPeriodId: "other-period" })).toBe("unknown");
  });
});
