import { describe, expect, it } from "vitest";
import type { Shift } from "../types/roster";
import { calendarShiftGroupId, formatBreakHours, groupShiftsForCalendar, mergedShiftForCalendarGroup } from "./calendarGrouping";
import { layoutCalendarShiftGroups } from "./calendarOverlap";

function shift({ id, ...overrides }: Partial<Shift> & Pick<Shift, "id">): Shift {
  const employeeNumber = id.replace(/\D/g, "") || id;
  return {
    id,
    rosterPeriodId: "period-1",
    storeId: "store-1",
    date: "2026-09-07",
    startAt: "2026-09-06T23:00:00.000Z",
    endAt: "2026-09-07T07:00:00.000Z",
    breakMinutes: 60,
    shiftRoleId: "role-front",
    roleNameSnapshot: "前场",
    roleColorSnapshot: "#2563eb",
    publicNote: null,
    internalNote: null,
    version: 1,
    shiftRole: { id: "role-front", storeId: "store-1", code: "front", nameZh: "前场", colorToken: "#2563eb", requiredSkillCodes: [] },
    assignments: [{ id: `assignment-${id}`, employeeId: `employee-${employeeNumber}`, employeeNameSnapshot: `员工 ${employeeNumber}`, employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }],
    ...overrides,
  };
}

describe("groupShiftsForCalendar", () => {
  it("shows current names in draft display without changing saved or published snapshots", () => {
    const draft = shift({ id: "draft", rosterPeriodId: "draft-period", assignments: [{ id: "draft-assignment", employeeId: "employee-1", employeeNameSnapshot: "Old Name", employeeTypeSnapshot: "REGULAR", officialScoreSnapshot: null, tierSnapshot: null }] });
    const published = shift({ id: "published", rosterPeriodId: "published-period", assignments: [{ ...draft.assignments[0], id: "published-assignment" }] });
    const resolveName = (source: Shift) => source.rosterPeriodId === "draft-period" ? "New Name" : undefined;

    const draftGroup = groupShiftsForCalendar([draft], resolveName)[0];
    const publishedGroup = groupShiftsForCalendar([published], resolveName)[0];
    expect(draftGroup.assignments[0].employeeName).toBe("New Name");
    expect(draftGroup.sourceShifts[0].assignments[0].employeeNameSnapshot).toBe("Old Name");
    expect(publishedGroup.assignments[0].employeeName).toBe("Old Name");
  });

  it("merges employees when date, time, and role match", () => {
    const groups = groupShiftsForCalendar([
      shift({ id: "shift-2", startAt: "2026-09-07T09:00:00.000+10:00", endAt: "2026-09-07T17:00:00.000+10:00" }),
      shift({ id: "shift-1" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].sourceShifts.map((item) => item.id)).toEqual(["shift-1", "shift-2"]);
    expect(groups[0].assignments.map((item) => item.employeeName)).toEqual(["员工 1", "员工 2"]);
    expect(groups[0].shiftIds).toEqual(["shift-1", "shift-2"]);
  });

  it("opens a merged group with all assignments and notes without changing source rows", () => {
    const group = groupShiftsForCalendar([
      shift({ id: "shift-1", publicNote: "第一批备注" }),
      shift({ id: "shift-2", publicNote: "第二批备注" }),
    ])[0];
    const merged = mergedShiftForCalendarGroup(group);
    expect(merged.id).toBe("shift-1");
    expect(merged.assignments.map((assignment) => assignment.employeeId)).toEqual(["employee-1", "employee-2"]);
    expect(merged.publicNote).toBe("第一批备注\n\n第二批备注");
    expect(group.sourceShifts[0].assignments).toHaveLength(1);
  });

  it.each([
    ["different role", { shiftRoleId: "role-bar", roleNameSnapshot: "水吧" }],
    ["different start time", { startAt: "2026-09-07T00:00:00.000Z" }],
    ["different end time", { endAt: "2026-09-07T08:00:00.000Z" }],
    ["different date", { date: "2026-09-08" }],
  ])("keeps %s as an independent visual block", (_label, overrides) => {
    expect(groupShiftsForCalendar([shift({ id: "shift-1" }), shift({ id: "shift-2", ...overrides })])).toHaveLength(2);
  });

  it("keeps one visual group when breaks differ while preserving each source value", () => {
    const groups = groupShiftsForCalendar([
      shift({ id: "shift-1", breakMinutes: 30 }),
      shift({ id: "shift-2", breakMinutes: 60 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].mixedBreakMinutes).toBe(true);
    expect(groups[0].sourceShifts.map((source) => source.breakMinutes)).toEqual([30, 60]);
    expect(() => mergedShiftForCalendarGroup(groups[0])).toThrow("请先选择一条真实班次");
  });

  it("keeps three overlapping but non-identical shifts as three stable groups", () => {
    const groups = groupShiftsForCalendar([
      shift({ id: "shift-3", shiftRoleId: "role-bar", roleNameSnapshot: "水吧" }),
      shift({ id: "shift-2", startAt: "2026-09-07T00:00:00.000Z", endAt: "2026-09-07T06:00:00.000Z" }),
      shift({ id: "shift-1" }),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups.map((group) => group.sourceShifts[0].id)).toEqual(["shift-1", "shift-3", "shift-2"]);
  });

  it("keeps a different-role employee visible beside two merged time groups", () => {
    const long = shift({ id: "long", assignments: [{ ...shift({ id: "long" }).assignments[0], employeeNameSnapshot: "Bob" }] });
    const early = shift({ id: "early", endAt: "2026-09-07T06:00:00.000Z",
      assignments: [{ ...shift({ id: "early" }).assignments[0], employeeNameSnapshot: "HandoverEmployee009" }] });
    const maomao = shift({ id: "maomao", startAt: "2026-09-07T00:00:00.000Z", endAt: "2026-09-07T06:00:00.000Z",
      shiftRoleId: "role-all", roleNameSnapshot: "全岗", assignments: [{ ...shift({ id: "maomao" }).assignments[0], employeeNameSnapshot: "HandoverEmployee007" }] });
    const groups = groupShiftsForCalendar([long, early, maomao]);
    expect(groups).toHaveLength(3);
    const placement = layoutCalendarShiftGroups(groups).find((item) => item.group.assignments.some((assignment) => assignment.employeeName === "HandoverEmployee007"));
    expect(placement).toMatchObject({ columnCount: 3, columnSpan: 1 });
  });

  it("uses a stable composite group id independent of source order", () => {
    const first = groupShiftsForCalendar([shift({ id: "shift-2" }), shift({ id: "shift-1" })])[0];
    const second = groupShiftsForCalendar([shift({ id: "shift-1" }), shift({ id: "shift-2" })])[0];

    expect(first.id).toBe(second.id);
    expect(first.id).toBe(calendarShiftGroupId(first.groupKey));
    expect(first.id).not.toBe("shift-1");
  });

  it("normalizes a missing assignments field to an empty array", () => {
    const shiftWithoutAssignments = { ...shift({ id: "shift-empty" }), assignments: undefined };
    const groups = groupShiftsForCalendar([shiftWithoutAssignments]);

    expect(groups).toHaveLength(1);
    expect(groups[0].assignments).toEqual([]);
    expect(groups[0].sourceShifts[0].assignments).toEqual([]);
  });

  it("uses current database role display data and retains snapshots as fallback", () => {
    const current = groupShiftsForCalendar([shift({ id: "shift-current", roleNameSnapshot: "旧前场", roleColorSnapshot: "#111111", shiftRole: { id: "role-front", storeId: "store-1", code: "front", nameZh: "新前场", colorToken: "#ABCDEF", requiredSkillCodes: [] } })])[0];
    expect(current.role).toMatchObject({ id: "role-front", code: "front", name: "新前场", colorToken: "#abcdef" });

    const historical = { ...shift({ id: "shift-history", roleNameSnapshot: "历史岗位", roleColorSnapshot: "#123456" }), shiftRole: undefined };
    expect(groupShiftsForCalendar([historical])[0].role).toMatchObject({ name: "历史岗位", colorToken: "#123456" });
  });

  it("shows a verified formal job name without rewriting the source Shift snapshot", () => {
    const source = shift({ id: "shift-formal-name", roleNameSnapshot: "Old Shift Name", shiftRole: { id: "role-front", storeId: "store-1", code: "front", nameZh: "Local Role Name", colorToken: "#ABCDEF", requiredSkillCodes: [] } });
    const group = groupShiftsForCalendar([source], undefined, new Map([["role-front", "Official Role Name"]]))[0];
    expect(group.role.name).toBe("Official Role Name");
    expect(group.sourceShifts[0].roleNameSnapshot).toBe("Old Shift Name");
    expect(group.sourceShifts[0].shiftRole.nameZh).toBe("Local Role Name");
  });

  it("shows the current Evaluate color on published and draft cards while keeping the stored historical snapshot", () => {
    const currentRole = { id: "role-front", storeId: "store-1", code: "front", nameZh: "Current Local Name", colorToken: "#abcdef", requiredSkillCodes: [] };
    const published = shift({ id: "published-role", rosterPeriodId: "published-period", roleNameSnapshot: "Published Name", roleColorSnapshot: "#123456", shiftRole: currentRole });
    const draft = shift({ id: "draft-role", rosterPeriodId: "draft-period", date: "2026-09-08", startAt: "2026-09-07T23:00:00.000Z", endAt: "2026-09-08T07:00:00.000Z", roleNameSnapshot: "Draft Name", shiftRole: currentRole });
    const names = new Map([["role-front", "New Official Name"]]);
    const groups = groupShiftsForCalendar([published, draft], undefined, names, new Set(["published-period"]), new Map([["role-front", "#9f1239"]]));
    expect(groups.find((group) => group.sourceShifts[0].id === "published-role")?.role).toMatchObject({ name: "Published Name", colorToken: "#9f1239" });
    expect(groups.find((group) => group.sourceShifts[0].id === "published-role")?.sourceShifts[0].roleColorSnapshot).toBe("#123456");
    expect(groups.find((group) => group.sourceShifts[0].id === "draft-role")?.role).toMatchObject({ name: "New Official Name", colorToken: "#9f1239" });
  });

  it("merges published shifts by role ID while retaining distinct historical snapshots", () => {
    const published = [
      shift({ id: "historical-a", rosterPeriodId: "published-period", roleNameSnapshot: "Old Name", roleColorSnapshot: "#123456" }),
      shift({ id: "historical-b", rosterPeriodId: "published-period", roleNameSnapshot: "New Name", roleColorSnapshot: "#123456" }),
      shift({ id: "historical-c", rosterPeriodId: "published-period", roleNameSnapshot: "New Name", roleColorSnapshot: "#abcdef" }),
    ];
    const groups = groupShiftsForCalendar(published, undefined, new Map([["role-front", "Current Official Name"]]), new Set(["published-period"]));
    expect(groups).toHaveLength(1);
    expect(groups[0].role.name).toBe("Current Official Name");
    expect(groups[0].mixedRoleSnapshots).toBe(true);
    expect(groups[0].sourceShifts.map((source) => [source.roleNameSnapshot, source.roleColorSnapshot])).toEqual([
      ["Old Name", "#123456"], ["New Name", "#123456"], ["New Name", "#abcdef"],
    ]);
    expect(groups.flatMap((group) => group.sourceShifts.map((source) => source.id)).sort()).toEqual(published.map((source) => source.id).sort());
  });

  it("marks a saved legacy role when the current formal catalog has no match", () => {
    const source = { ...shift({ id: "shift-legacy", roleNameSnapshot: "验收岗" }), shiftRole: undefined };
    const group = groupShiftsForCalendar([source], undefined, new Map())[0];
    expect(group.role.name).toBe("旧岗位：验收岗");
    expect(group.sourceShifts[0].roleNameSnapshot).toBe("验收岗");
  });

  it("uses a deterministic role colour when persisted data is invalid", () => {
    const invalid = shift({ id: "shift-invalid", roleColorSnapshot: "broken", shiftRole: { id: "role-front", storeId: null, code: "front", nameZh: "前场", colorToken: "also-broken", requiredSkillCodes: [] } });
    const first = groupShiftsForCalendar([invalid])[0].role.colorToken;
    const second = groupShiftsForCalendar([{ ...invalid, id: "another-source-id" }])[0].role.colorToken;
    expect(first).toMatch(/^#[0-9a-f]{6}$/);
    expect(second).toBe(first);
  });

  it("ignores an incomplete optimistic-shaped object instead of creating a broken event", () => {
    expect(groupShiftsForCalendar([{ id: "temporary", start: "2026-09-07T09:00:00Z", end: "2026-09-07T10:00:00Z" }])).toEqual([]);
  });

  it("formats break values in calendar-friendly hours", () => {
    expect([0, 30, 45, 60, 90].map(formatBreakHours)).toEqual(["0h", "0.5h", "0.75h", "1h", "1.5h"]);
  });
});
