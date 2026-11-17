import type { Shift } from "../types/roster";
import { ApiRequestError } from "./apiClient";
import { findMatchingShift } from "./mutationReconciliation";

type SubmittedShift = {
  storeId: string;
  date: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  shiftRoleId: string;
  employeeIds: string[];
  publicNote?: string;
  internalNote?: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unconfirmed(): never {
  throw new ApiRequestError("服务器返回的班次与本次保存不一致，结果尚未确认；请核对日历后再重试。", 0);
}

/** A successful HTTP status is not proof that the intended Shift was saved. */
export function assertSavedShiftResponse(value: unknown, input: SubmittedShift,
  expectedId?: string, expectedPeriodId?: string, previousVersion?: number): Shift {
  if (!record(value) || typeof value.id !== "string" || !value.id
    || typeof value.rosterPeriodId !== "string" || !value.rosterPeriodId
    || value.storeId !== input.storeId
    || !Number.isInteger(value.version) || Number(value.version) < 1
    || (previousVersion !== undefined && Number(value.version) <= previousVersion)
    || (expectedPeriodId !== undefined && value.rosterPeriodId !== expectedPeriodId)
    || !Array.isArray(value.assignments) || value.assignments.length === 0
    || !value.assignments.every((assignment: unknown) => record(assignment)
      && typeof assignment.employeeId === "string" && assignment.employeeId.length > 0)) unconfirmed();

  const submitted = { ...input, publicNote: input.publicNote ?? "", internalNote: input.internalNote ?? "" };
  if (!findMatchingShift([value as Shift], submitted, expectedId, undefined, previousVersion)) unconfirmed();
  return value as Shift;
}
