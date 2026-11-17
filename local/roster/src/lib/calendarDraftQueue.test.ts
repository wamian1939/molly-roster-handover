import { describe, expect, it } from "vitest";
import type { Shift } from "../types/roster";
import {
  discardExistingChange,
  discardNewShift,
  emptyCalendarDraftQueue,
  findDraftConflicts,
  projectCalendarDrafts,
  reviseNewShift,
  stageDeleteShift,
  stageExistingShift,
  stageMergedShiftDelete,
  stageMergedShiftUpdate,
  stageNewShift,
  type DraftShiftValue,
} from "./calendarDraftQueue";

const value: DraftShiftValue = {
  date: "2026-10-20",
  startAt: "2026-10-19T23:00:00.000Z",
  endAt: "2026-10-20T01:00:00.000Z",
  breakMinutes: 0,
  shiftRoleId: "role-1",
  employeeIds: ["employee-1"],
  publicNote: "",
  internalNote: "",
};

const shift = {
  id: "shift-1",
  storeId: "store-1",
  rosterPeriodId: "period-1",
  date: value.date,
  startAt: value.startAt,
  endAt: value.endAt,
  breakMinutes: value.breakMinutes,
  shiftRoleId: value.shiftRoleId,
  roleNameSnapshot: "前场",
  roleColorSnapshot: "#2563eb",
  version: 3,
} as Shift;

describe("calendarDraftQueue", () => {
  it("stages a new shift without mutating the supplied value or making a network request", () => {
    const input = { ...value, employeeIds: ["employee-1"] };
    const queue = stageNewShift(emptyCalendarDraftQueue("store-1"), "request-1", input);
    input.employeeIds.push("employee-2");
    expect(queue.changes).toEqual([{ kind: "create", clientShiftId: "request-1", value }]);
    expect(discardNewShift(queue, "request-1").changes).toEqual([]);
  });

  it("revises one unsaved creation in place and refuses duplicate IDs", () => {
    const queue = stageNewShift(emptyCalendarDraftQueue("store-1"), "request-1", value);
    const revised = reviseNewShift(queue, "request-1", { ...value, breakMinutes: 30 });
    expect(revised.changes).toHaveLength(1);
    expect(revised.changes[0]).toMatchObject({ kind: "create", value: { breakMinutes: 30 } });
    expect(() => stageNewShift(revised, "request-1", value)).toThrow("重复");
  });

  it("coalesces repeated edits while preserving the original server version", () => {
    const first = stageExistingShift(emptyCalendarDraftQueue("store-1"), shift, value);
    const newerSnapshot = { ...shift, version: 4 } as Shift;
    const second = stageExistingShift(first, newerSnapshot, { ...value, breakMinutes: 30 });
    expect(second.changes).toEqual([{
      kind: "update", shiftId: "shift-1", baseVersion: 3, basePeriodId: "period-1",
      value: { ...value, breakMinutes: 30 },
    }]);
    expect(discardExistingChange(second, "shift-1").changes).toEqual([]);
  });

  it("turns a staged edit into one delete and prevents further edits", () => {
    const edited = stageExistingShift(emptyCalendarDraftQueue("store-1"), shift, value);
    const deleted = stageDeleteShift(edited, { ...shift, version: 4 } as Shift);
    expect(deleted.changes).toEqual([{ kind: "delete", shiftId: "shift-1", baseVersion: 3, basePeriodId: "period-1" }]);
    expect(() => stageExistingShift(deleted, shift, value)).toThrow("待删除");
  });

  it("commits merged shift edits as one update plus deletes for the other source rows", () => {
    const second = { ...shift, id: "shift-2", version: 7,
      startAt: "2026-10-20T10:00:00+11:00", endAt: "2026-10-20T12:00:00+11:00" } as Shift;
    const merged = stageMergedShiftUpdate(emptyCalendarDraftQueue("store-1"), [shift, second], { ...value, employeeIds: ["employee-1", "employee-2"] });
    expect(merged.changes).toEqual([
      { kind: "update", shiftId: "shift-1", baseVersion: 3, basePeriodId: "period-1", value: { ...value, employeeIds: ["employee-1", "employee-2"] } },
      { kind: "delete", shiftId: "shift-2", baseVersion: 7, basePeriodId: "period-1" },
    ]);
    expect(stageMergedShiftDelete(emptyCalendarDraftQueue("store-1"), [shift, second]).changes.map((change) => change.kind)).toEqual(["delete", "delete"]);
    expect(() => stageMergedShiftUpdate(emptyCalendarDraftQueue("store-1"), [shift, { ...second, rosterPeriodId: "period-2" }], value)).toThrow("跨排班周期");
  });

  it.each([
    ["休息", { breakMinutes: 30 }],
    ["岗位", { shiftRoleId: "role-2" }],
    ["时间", { endAt: "2026-10-20T02:00:00.000Z" }],
    ["岗位快照", { roleNameSnapshot: "旧前场" }],
    ["班次 ID", { id: "shift-1" }],
  ])("rejects a destructive bulk merge when %s differs", (_label, override) => {
    const sources = [shift, { ...shift, id: "shift-2", ...override } as Shift];
    expect(() => stageMergedShiftUpdate(emptyCalendarDraftQueue("store-1"), sources, value)).toThrow("不能整体编辑或删除");
    expect(() => stageMergedShiftDelete(emptyCalendarDraftQueue("store-1"), sources)).toThrow("不能整体编辑或删除");
  });

  it("rejects a shift from another store", () => {
    const queue = emptyCalendarDraftQueue("store-1");
    const other = { ...shift, storeId: "store-2" } as Shift;
    expect(() => stageExistingShift(queue, other, value)).toThrow("其他门店");
    expect(() => stageDeleteShift(queue, other)).toThrow("其他门店");
  });

  it("previews the final calendar after staged edits and deletions", () => {
    const saved = [
      { ...shift, ...value, assignments: [{ employeeId: "employee-1" }] },
      { ...shift, id: "shift-2", ...value, assignments: [{ employeeId: "employee-2" }] },
    ] as unknown as Shift[];
    const edited = stageExistingShift(emptyCalendarDraftQueue("store-1"), saved[0]!, { ...value, employeeIds: ["employee-3"] });
    const deleted = stageDeleteShift(edited, saved[1]!);
    const queue = stageNewShift(deleted, "request-1", { ...value, employeeIds: ["employee-4"] });
    expect(projectCalendarDrafts(queue, saved).map((item) => [item.id, item.employeeIds, item.staged])).toEqual([
      ["shift-1", ["employee-3"], true],
      ["request-1", ["employee-4"], true],
    ]);
  });

  it("flags employee overlap but allows touching shift endpoints", () => {
    const first = { id: "a", staged: true, ...value };
    const overlap = { id: "b", staged: true, ...value, startAt: "2026-10-20T00:30:00.000Z" };
    const touching = { id: "c", staged: true, ...value, startAt: value.endAt, endAt: "2026-10-20T03:00:00.000Z" };
    expect(findDraftConflicts([first, overlap, touching])).toEqual([{ firstId: "a", secondId: "b", employeeId: "employee-1" }]);
  });
});
