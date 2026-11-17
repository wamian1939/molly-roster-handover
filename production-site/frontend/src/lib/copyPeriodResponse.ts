import { ApiRequestError } from "./apiClient";
import type { CopyPeriodPreview } from "../services/rosterRepository";
import type { RosterPeriod } from "../types/roster";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

function count(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

/** A malformed preview must not enable a copy request or enter the dialog state. */
export function assertCopyPeriodPreview(value: unknown, targetStartDate: string): CopyPeriodPreview {
  if (!record(value) || value.policy !== "ALL_OR_NOTHING"
    || !calendarDate(value.targetStartDate) || value.targetStartDate !== targetStartDate
    || !Number.isInteger(value.sourcePeriodVersion) || Number(value.sourcePeriodVersion) < 1
    || !count(value.shiftCount) || !count(value.readyShifts) || value.readyShifts > value.shiftCount
    || !count(value.availableAssignments) || !count(value.blockedAssignments)
    || !count(value.unavailableAssignments) || !count(value.conflictingAssignments)
    || typeof value.canCopy !== "boolean" || !Array.isArray(value.issues)
    || !value.issues.every((issue: unknown) => record(issue)
      && typeof issue.shiftDate === "string" && calendarDate(issue.shiftDate)
      && typeof issue.employeeName === "string" && typeof issue.code === "string"
      && issue.severity === "BLOCKING_ERROR" && typeof issue.reason === "string")
    || (value.canCopy && (value.shiftCount === 0 || value.readyShifts !== value.shiftCount
      || value.blockedAssignments !== 0 || value.issues.length !== 0))) {
    throw new ApiRequestError("复制预览响应不完整；请刷新日历后重新检查。", 200);
  }
  return value as CopyPeriodPreview;
}

/** Copy Period creates a new draft period, so every returned period field is known. */
export function assertCopyPeriodResponse(value: unknown, storeId: string, sourcePeriodId: string,
  target: Pick<RosterPeriod, "startDate" | "endDate" | "cycleType">, preview: CopyPeriodPreview): RosterPeriod {
  if (!preview.canCopy || preview.targetStartDate !== target.startDate
    || preview.shiftCount < 1 || preview.readyShifts !== preview.shiftCount
    || !record(value) || typeof value.id !== "string" || !value.id || value.id === sourcePeriodId
    || value.storeId !== storeId || value.status !== "DRAFT"
    || !calendarDate(value.startDate) || value.startDate !== target.startDate
    || !calendarDate(value.endDate) || value.endDate !== target.endDate
    || value.cycleType !== target.cycleType || value.version !== 1 || value.publishedAt !== null) {
    throw new ApiRequestError("服务器返回的周期与复制预览不一致，结果尚未确认；请检查目标日期的排班。", 0);
  }
  return value as RosterPeriod;
}
