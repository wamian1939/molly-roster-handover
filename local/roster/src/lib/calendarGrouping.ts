import type { Shift, ShiftAssignment, ShiftRole } from "../types/roster";
import { normalizeRoleColor } from "./roleColor";

export type CalendarShiftAssignment = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeType: string;
  score: number | null;
  tier: string | null;
};

export type CalendarShiftGroup = {
  id: string;
  groupKey: string;
  shiftIds: string[];
  date: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  mixedBreakMinutes: boolean;
  mixedRoleSnapshots: boolean;
  role: { id: string; code: string; name: string; colorToken: string };
  assignments: CalendarShiftAssignment[];
  sourceShifts: Shift[];
};

type NormalizedShift = {
  sourceShift: Shift;
  date: string;
  startAt: string;
  endAt: string;
  startTimestamp: number;
  endTimestamp: number;
  breakMinutes: number;
  role: CalendarShiftGroup["role"];
  assignments: CalendarShiftAssignment[];
};

export type CalendarAssignmentNameResolver = (shift: Shift, assignment: ShiftAssignment) => string | undefined;

export function groupShiftsForCalendar(shifts: readonly unknown[], resolveAssignmentName?: CalendarAssignmentNameResolver, formalRoleNames?: ReadonlyMap<string, string>, publishedPeriodIds?: ReadonlySet<string>, formalRoleColors?: ReadonlyMap<string, string>): CalendarShiftGroup[] {
  const normalizedShifts = shifts.map((shift) => normalizeShiftForCalendar(shift, resolveAssignmentName)).filter(isNormalizedShift)
    .map((shift) => {
      if (publishedPeriodIds?.has(shift.sourceShift.rosterPeriodId)) {
        return { ...shift, role: { ...shift.role, name: shift.sourceShift.roleNameSnapshot,
          colorToken: formalRoleColors?.get(shift.role.id) ?? shift.sourceShift.roleColorSnapshot } };
      }
      if (!formalRoleNames) return shift;
      const name = formalRoleNames.get(shift.role.id);
      return { ...shift, role: { ...shift.role, name: name ?? `旧岗位：${shift.sourceShift.roleNameSnapshot}`,
        colorToken: formalRoleColors?.get(shift.role.id) ?? shift.role.colorToken } };
    });
  const grouped = new Map<string, NormalizedShift[]>();

  for (const shift of normalizedShifts) {
    const key = shiftGroupKey(shift);
    const existing = grouped.get(key);
    if (existing) existing.push(shift);
    else grouped.set(key, [shift]);
  }

  return [...grouped.entries()]
    .map(([groupKey, matchingShifts]) => {
      const sortedShifts = [...matchingShifts].sort((left, right) => left.sourceShift.id.localeCompare(right.sourceShift.id));
      const first = sortedShifts[0];
      const mixedBreakMinutes = sortedShifts.some((shift) => shift.breakMinutes !== first.breakMinutes);
      const mixedRoleSnapshots = sortedShifts.some((shift) =>
        shift.sourceShift.roleNameSnapshot !== first.sourceShift.roleNameSnapshot
        || shift.sourceShift.roleColorSnapshot !== first.sourceShift.roleColorSnapshot);
      const uniqueAssignments = new Map<string, CalendarShiftAssignment>();

      for (const shift of sortedShifts) {
        for (const assignment of shift.assignments) {
          if (!uniqueAssignments.has(assignment.employeeId)) uniqueAssignments.set(assignment.employeeId, assignment);
        }
      }

      return {
        id: calendarShiftGroupId(groupKey),
        groupKey,
        shiftIds: sortedShifts.map((shift) => shift.sourceShift.id),
        date: first.date,
        startAt: first.startAt,
        endAt: first.endAt,
        breakMinutes: first.breakMinutes,
        mixedBreakMinutes,
        mixedRoleSnapshots,
        role: mixedRoleSnapshots ? { ...first.role, name: formalRoleNames?.get(first.role.id) ?? first.role.name,
          colorToken: formalRoleColors?.get(first.role.id) ?? first.role.colorToken } : first.role,
        assignments: [...uniqueAssignments.values()].sort((left, right) => left.employeeName.localeCompare(right.employeeName, "zh-CN")),
        sourceShifts: sortedShifts.map((shift) => shift.sourceShift),
      };
    })
    .map((group) => ({
      group,
      startTimestamp: new Date(group.startAt).getTime(),
      endTimestamp: new Date(group.endAt).getTime(),
    }))
    .sort((left, right) => compareGroups(left.group, right.group, left.startTimestamp, right.startTimestamp, left.endTimestamp, right.endTimestamp))
    .map(({ group }) => group);
}

export function isCalendarShiftGroup(value: unknown): value is CalendarShiftGroup {
  if (!isRecord(value) || !isRecord(value.role)) return false;
  return typeof value.id === "string"
    && typeof value.groupKey === "string"
    && Array.isArray(value.shiftIds)
    && value.shiftIds.every(isString)
    && typeof value.date === "string"
    && typeof value.startAt === "string"
    && typeof value.endAt === "string"
    && typeof value.breakMinutes === "number"
    && Number.isFinite(value.breakMinutes)
    && typeof value.mixedBreakMinutes === "boolean"
    && typeof value.mixedRoleSnapshots === "boolean"
    && typeof value.role.id === "string"
    && typeof value.role.code === "string"
    && typeof value.role.name === "string"
    && typeof value.role.colorToken === "string"
    && Array.isArray(value.assignments)
    && value.assignments.every(isCalendarAssignment)
    && Array.isArray(value.sourceShifts)
    && value.sourceShifts.every((shift) => isRecord(shift) && typeof shift.id === "string" && Array.isArray(shift.assignments));
}

export function calendarShiftGroupId(groupKey: string) {
  return `calendar-shift-group:${encodeURIComponent(groupKey)}`;
}

/** One calendar block is one editing unit even when older saves produced several shift rows. */
export function mergedShiftForCalendarGroup(group: CalendarShiftGroup): Shift {
  const first = group.sourceShifts[0];
  if (!first) throw new Error("班次组没有可编辑的记录");
  if (group.mixedBreakMinutes || group.mixedRoleSnapshots
    || group.sourceShifts.some((shift) => shift.rosterPeriodId !== first.rosterPeriodId)) {
    throw new Error("班次详情不同，请先选择一条真实班次");
  }
  const assignments = new Map<string, ShiftAssignment>();
  for (const shift of group.sourceShifts) for (const assignment of shift.assignments) {
    if (!assignments.has(assignment.employeeId)) assignments.set(assignment.employeeId, assignment);
  }
  const mergeNotes = (field: "publicNote" | "internalNote") => {
    const notes = [...new Set(group.sourceShifts.map((shift) => shift[field]?.trim()).filter((note): note is string => Boolean(note)))];
    return notes.length ? notes.join("\n\n") : null;
  };
  return { ...first, assignments: [...assignments.values()], publicNote: mergeNotes("publicNote"), internalNote: mergeNotes("internalNote") };
}

export function formatBreakHours(minutes: number) {
  if (minutes === 0) return "0h";
  const hours = minutes / 60;
  return `${Number(hours.toFixed(2))}h`;
}

function normalizeShiftForCalendar(value: unknown, resolveAssignmentName?: CalendarAssignmentNameResolver): NormalizedShift | null {
  if (!isRecord(value)) return null;

  const id = readRequiredString(value.id);
  const rosterPeriodId = readRequiredString(value.rosterPeriodId);
  const storeId = readRequiredString(value.storeId);
  const date = normalizeDate(value.date);
  const startAt = readRequiredString(value.startAt);
  const endAt = readRequiredString(value.endAt);
  const shiftRoleId = readRequiredString(value.shiftRoleId);
  const startTimestamp = startAt ? new Date(startAt).getTime() : Number.NaN;
  const endTimestamp = endAt ? new Date(endAt).getTime() : Number.NaN;
  const breakMinutes = typeof value.breakMinutes === "number" ? value.breakMinutes : Number.NaN;

  if (!id || !rosterPeriodId || !storeId || !date || !startAt || !endAt || !shiftRoleId
    || !Number.isFinite(startTimestamp) || !Number.isFinite(endTimestamp) || endTimestamp <= startTimestamp
    || !Number.isFinite(breakMinutes) || breakMinutes < 0) return null;

  const nestedRole = isRecord(value.shiftRole) && readRequiredString(value.shiftRole.id) === shiftRoleId ? value.shiftRole : null;
  const roleName = readNestedString(nestedRole, "nameZh") || readRequiredString(value.roleNameSnapshot) || "未命名岗位";
  const roleCode = readNestedString(nestedRole, "code") || shiftRoleId;
  const roleColor = normalizeRoleColor(readNestedString(nestedRole, "colorToken") || readRequiredString(value.roleColorSnapshot), roleCode);
  const sourceAssignments = Array.isArray(value.assignments) ? value.assignments.map(normalizeAssignment).filter(isShiftAssignment) : [];
  const sourceRole = normalizeShiftRole(nestedRole, shiftRoleId, roleName, roleColor);
  const version = typeof value.version === "number" && Number.isFinite(value.version) ? value.version : 1;

  const sourceShift: Shift = {
    id,
    rosterPeriodId,
    storeId,
    date,
    startAt,
    endAt,
    breakMinutes,
    shiftRoleId,
    roleNameSnapshot: readRequiredString(value.roleNameSnapshot) || roleName,
    roleColorSnapshot: normalizeRoleColor(readRequiredString(value.roleColorSnapshot), roleCode),
    publicNote: readNullableString(value.publicNote),
    internalNote: readNullableString(value.internalNote),
    version,
    shiftRole: sourceRole,
    assignments: sourceAssignments,
    ...(value.agentPreview===true?{agentPreview:true,agentPattern:readRequiredString(value.agentPattern)}:{}),
  };

  return {
    sourceShift,
    date,
    startAt,
    endAt,
    startTimestamp,
    endTimestamp,
    breakMinutes,
    role: { id: shiftRoleId, code: roleCode, name: roleName, colorToken: roleColor },
    assignments: sourceAssignments.map((assignment) => toCalendarAssignment(assignment, resolveAssignmentName?.(sourceShift, assignment))),
  };
}

function normalizeAssignment(value: unknown): ShiftAssignment | null {
  if (!isRecord(value)) return null;
  const id = readRequiredString(value.id);
  const employeeId = readRequiredString(value.employeeId);
  if (!id || !employeeId) return null;
  return {
    id,
    employeeId,
    employeeNameSnapshot: readRequiredString(value.employeeNameSnapshot) || "未命名员工",
    employeeTypeSnapshot: readRequiredString(value.employeeTypeSnapshot) || "UNKNOWN",
    officialScoreSnapshot: value.officialScoreSnapshot === null || value.officialScoreSnapshot === undefined ? null : String(value.officialScoreSnapshot),
    tierSnapshot: readNullableString(value.tierSnapshot),
  };
}

function toCalendarAssignment(assignment: ShiftAssignment, currentName?: string): CalendarShiftAssignment {
  const parsedScore = assignment.officialScoreSnapshot === null ? Number.NaN : Number(assignment.officialScoreSnapshot);
  return {
    id: assignment.id,
    employeeId: assignment.employeeId,
    employeeName: currentName?.trim() || assignment.employeeNameSnapshot,
    employeeType: assignment.employeeTypeSnapshot,
    score: Number.isFinite(parsedScore) ? parsedScore : null,
    tier: assignment.tierSnapshot,
  };
}

function normalizeShiftRole(value: unknown, id: string, name: string, colorToken: string): ShiftRole {
  const record = isRecord(value) ? value : {};
  const requiredSkillCodes = Array.isArray(record.requiredSkillCodes) ? record.requiredSkillCodes.filter(isString) : [];
  return {
    id,
    storeId: typeof record.storeId === "string" ? record.storeId : null,
    code: readRequiredString(record.code) || id,
    nameZh: readRequiredString(record.nameZh) || name,
    colorToken: readRequiredString(record.colorToken) || colorToken,
    requiredSkillCodes,
  };
}

function shiftGroupKey(shift: NormalizedShift) {
  const key=[shift.sourceShift.storeId, shift.date, shift.startTimestamp, shift.endTimestamp, shift.role.id];
  if(shift.sourceShift.agentPreview)key.push('agent-preview');
  return JSON.stringify(key);
}

function compareGroups(left: CalendarShiftGroup, right: CalendarShiftGroup, leftStart: number, rightStart: number, leftEnd: number, rightEnd: number) {
  return left.date.localeCompare(right.date)
    || leftStart - rightStart
    || leftEnd - rightEnd
    || left.role.name.localeCompare(right.role.name, "zh-CN")
    || left.breakMinutes - right.breakMinutes
    || left.groupKey.localeCompare(right.groupKey);
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string") return "";
  const match = /^\d{4}-\d{2}-\d{2}/.exec(value);
  return match?.[0] ?? "";
}

function readRequiredString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readNestedString(value: unknown, key: string) {
  return isRecord(value) ? readRequiredString(value[key]) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isShiftAssignment(value: ShiftAssignment | null): value is ShiftAssignment {
  return value !== null;
}

function isNormalizedShift(value: NormalizedShift | null): value is NormalizedShift {
  return value !== null;
}

function isCalendarAssignment(value: unknown): value is CalendarShiftAssignment {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.employeeId === "string"
    && typeof value.employeeName === "string"
    && typeof value.employeeType === "string"
    && (value.score === null || typeof value.score === "number")
    && (value.tier === null || typeof value.tier === "string");
}
