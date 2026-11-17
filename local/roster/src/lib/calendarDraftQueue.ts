import type { Shift } from "../types/roster";

export type DraftShiftValue = {
  date: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  shiftRoleId: string;
  employeeIds: string[];
  publicNote: string;
  internalNote: string;
};

export type DraftCreate = {
  kind: "create";
  clientShiftId: string;
  value: DraftShiftValue;
};

export type DraftUpdate = {
  kind: "update";
  shiftId: string;
  baseVersion: number;
  basePeriodId: string;
  value: DraftShiftValue;
};

export type DraftDelete = {
  kind: "delete";
  shiftId: string;
  baseVersion: number;
  basePeriodId: string;
};

export type DraftChange = DraftCreate | DraftUpdate | DraftDelete;
export type CalendarDraftQueue = { storeId: string; changes: DraftChange[] };
export type ProjectedShift = DraftShiftValue & { id: string; staged: boolean };
export type DraftConflict = { firstId: string; secondId: string; employeeId: string };

export function emptyCalendarDraftQueue(storeId: string): CalendarDraftQueue {
  return { storeId, changes: [] };
}

export function stageNewShift(queue: CalendarDraftQueue, clientShiftId: string, value: DraftShiftValue): CalendarDraftQueue {
  if (!clientShiftId || queue.changes.some((change) => change.kind === "create" && change.clientShiftId === clientShiftId)) {
    throw new Error("待提交班次 ID 缺失或重复");
  }
  return { ...queue, changes: [...queue.changes, { kind: "create", clientShiftId, value: copyValue(value) }] };
}

export function reviseNewShift(queue: CalendarDraftQueue, clientShiftId: string, value: DraftShiftValue): CalendarDraftQueue {
  const index = queue.changes.findIndex((change) => change.kind === "create" && change.clientShiftId === clientShiftId);
  if (index < 0) throw new Error("未找到待提交的新增班次");
  return replace(queue, index, { kind: "create", clientShiftId, value: copyValue(value) });
}

export function discardNewShift(queue: CalendarDraftQueue, clientShiftId: string): CalendarDraftQueue {
  return { ...queue, changes: queue.changes.filter((change) => change.kind !== "create" || change.clientShiftId !== clientShiftId) };
}

export function stageExistingShift(queue: CalendarDraftQueue, shift: Shift, value: DraftShiftValue): CalendarDraftQueue {
  assertSameStore(queue, shift);
  const index = queue.changes.findIndex((change) => change.kind !== "create" && change.shiftId === shift.id);
  if (index >= 0 && queue.changes[index]?.kind === "delete") throw new Error("待删除班次不能继续编辑");
  const prior = index >= 0 ? queue.changes[index] as DraftUpdate : null;
  const change: DraftUpdate = {
    kind: "update",
    shiftId: shift.id,
    baseVersion: prior?.baseVersion ?? shift.version,
    basePeriodId: prior?.basePeriodId ?? shift.rosterPeriodId,
    value: copyValue(value),
  };
  return index >= 0 ? replace(queue, index, change) : { ...queue, changes: [...queue.changes, change] };
}

/** Replace several visually merged source rows with one updated row in a single commit. */
export function stageMergedShiftUpdate(queue: CalendarDraftQueue, shifts: Shift[], value: DraftShiftValue): CalendarDraftQueue {
  const first = assertMergeableShifts(queue, shifts);
  let next = stageExistingShift(queue, first, value);
  for (const shift of shifts.slice(1)) next = stageDeleteShift(next, shift);
  return next;
}

export function stageMergedShiftDelete(queue: CalendarDraftQueue, shifts: Shift[]): CalendarDraftQueue {
  assertMergeableShifts(queue, shifts);
  let next = queue;
  for (const shift of shifts) next = stageDeleteShift(next, shift);
  return next;
}

function assertMergeableShifts(queue: CalendarDraftQueue, shifts: Shift[]): Shift {
  const first = shifts[0];
  if (!first) throw new Error("班次组没有可编辑的记录");
  for (const shift of shifts) assertSameStore(queue, shift);
  if (shifts.some((shift) => shift.rosterPeriodId !== first.rosterPeriodId)) throw new Error("合并班次不能跨排班周期");
  if (new Set(shifts.map((shift) => shift.id)).size !== shifts.length || shifts.some((shift) =>
    shift.date !== first.date
    || Date.parse(shift.startAt) !== Date.parse(first.startAt)
    || Date.parse(shift.endAt) !== Date.parse(first.endAt)
    || shift.shiftRoleId !== first.shiftRoleId
    || shift.breakMinutes !== first.breakMinutes
    || shift.roleNameSnapshot !== first.roleNameSnapshot
    || shift.roleColorSnapshot !== first.roleColorSnapshot)) {
    throw new Error("班次详情不同，不能整体编辑或删除；请先选择一条真实班次");
  }
  return first;
}

export function stageDeleteShift(queue: CalendarDraftQueue, shift: Shift): CalendarDraftQueue {
  assertSameStore(queue, shift);
  const index = queue.changes.findIndex((change) => change.kind !== "create" && change.shiftId === shift.id);
  const prior = index >= 0 ? queue.changes[index] as DraftUpdate | DraftDelete : null;
  const change: DraftDelete = {
    kind: "delete",
    shiftId: shift.id,
    baseVersion: prior?.baseVersion ?? shift.version,
    basePeriodId: prior?.basePeriodId ?? shift.rosterPeriodId,
  };
  return index >= 0 ? replace(queue, index, change) : { ...queue, changes: [...queue.changes, change] };
}

export function discardExistingChange(queue: CalendarDraftQueue, shiftId: string): CalendarDraftQueue {
  return { ...queue, changes: queue.changes.filter((change) => change.kind === "create" || change.shiftId !== shiftId) };
}

/** A preview only: the server must revalidate every change inside one transaction. */
export function projectCalendarDrafts(queue: CalendarDraftQueue, saved: Shift[]): ProjectedShift[] {
  const existingChanges = new Map(queue.changes.filter((change) => change.kind !== "create").map((change) => [change.shiftId, change]));
  const projected = saved.filter((shift) => shift.storeId === queue.storeId).flatMap((shift): ProjectedShift[] => {
    const change = existingChanges.get(shift.id);
    if (change?.kind === "delete") return [];
    const value = change?.kind === "update" ? change.value : shiftValue(shift);
    return [{ id: shift.id, staged: change?.kind === "update", ...copyValue(value) }];
  });
  for (const change of queue.changes) {
    if (change.kind === "create") projected.push({ id: change.clientShiftId, staged: true, ...copyValue(change.value) });
  }
  return projected;
}

export function findDraftConflicts(shifts: ProjectedShift[]): DraftConflict[] {
  const conflicts: DraftConflict[] = [];
  for (let i = 0; i < shifts.length; i++) {
    const first = shifts[i]!;
    for (let j = i + 1; j < shifts.length; j++) {
      const second = shifts[j]!;
      if (first.id === second.id || !(Date.parse(first.startAt) < Date.parse(second.endAt) && Date.parse(second.startAt) < Date.parse(first.endAt))) continue;
      for (const employeeId of first.employeeIds) {
        if (second.employeeIds.includes(employeeId)) conflicts.push({ firstId: first.id, secondId: second.id, employeeId });
      }
    }
  }
  return conflicts;
}

function assertSameStore(queue: CalendarDraftQueue, shift: Shift): void {
  if (queue.storeId !== shift.storeId) throw new Error("不能将其他门店的班次加入待提交队列");
}

function copyValue(value: DraftShiftValue): DraftShiftValue {
  return { ...value, employeeIds: [...value.employeeIds] };
}

function shiftValue(shift: Shift): DraftShiftValue {
  return {
    date: shift.date,
    startAt: shift.startAt,
    endAt: shift.endAt,
    breakMinutes: shift.breakMinutes,
    shiftRoleId: shift.shiftRoleId,
    employeeIds: shift.assignments.map((assignment) => assignment.employeeId),
    publicNote: shift.publicNote ?? "",
    internalNote: shift.internalNote ?? "",
  };
}

function replace(queue: CalendarDraftQueue, index: number, change: DraftChange): CalendarDraftQueue {
  const changes = [...queue.changes];
  changes[index] = change;
  return { ...queue, changes };
}
