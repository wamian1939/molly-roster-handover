import type { Shift } from "../types/roster";

type ShiftInput = {
  date: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  shiftRoleId: string;
  employeeIds: string[];
  publicNote: string;
  internalNote: string;
};

export function findMatchingShift(shifts: Shift[], input: ShiftInput, existingShiftId?: string, preexistingShiftIds?: ReadonlySet<string>, minimumVersionExclusive?: number) {
  const expectedEmployees = [...input.employeeIds].sort().join("\u0000");
  return shifts.find((shift) => {
    if (existingShiftId && shift.id !== existingShiftId) return false;
    if (preexistingShiftIds?.has(shift.id)) return false;
    if (minimumVersionExclusive !== undefined && shift.version <= minimumVersionExclusive) return false;
    return shift.date === input.date
      && shift.startAt === input.startAt
      && shift.endAt === input.endAt
      && shift.breakMinutes === input.breakMinutes
      && shift.shiftRoleId === input.shiftRoleId
      && (shift.publicNote ?? "") === input.publicNote.trim()
      && (shift.internalNote ?? "") === input.internalNote.trim()
      && shift.assignments.map((assignment) => assignment.employeeId).sort().join("\u0000") === expectedEmployees;
  }) ?? null;
}
