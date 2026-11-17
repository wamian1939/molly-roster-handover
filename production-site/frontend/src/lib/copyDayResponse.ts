import { ApiRequestError } from "./apiClient";
import type { CopyDayPreview } from "../services/rosterRepository";
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

function periodVersion(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && Number(value) >= 1);
}

/** Validate the HTTP body before Calendar reads issue and count fields. */
export function assertCopyDayPreview(value: unknown, sourceDate: string, targetDate: string): CopyDayPreview {
  if (!record(value) || value.policy !== "ALL_OR_NOTHING"
    || !calendarDate(value.sourceDate) || value.sourceDate !== sourceDate
    || !calendarDate(value.targetDate) || value.targetDate !== targetDate
    || !periodVersion(value.sourcePeriodVersion) || !periodVersion(value.targetPeriodVersion)
    || !count(value.shiftCount) || !count(value.readyShifts) || value.readyShifts > value.shiftCount
    || !count(value.availableAssignments) || !count(value.blockedAssignments)
    || !count(value.unavailableAssignments) || !count(value.conflictingAssignments)
    || value.blockedAssignments < value.unavailableAssignments + value.conflictingAssignments
    || typeof value.canCopy !== "boolean" || !Array.isArray(value.issues)
    || !value.issues.every((issue: unknown) => record(issue) && calendarDate(issue.shiftDate)
      && typeof issue.employeeName === "string" && typeof issue.code === "string"
      && issue.severity === "BLOCKING_ERROR" && typeof issue.reason === "string")
    || (value.canCopy ? (value.shiftCount === 0 || value.sourcePeriodVersion === null
      || value.readyShifts !== value.shiftCount || value.blockedAssignments !== 0 || value.issues.length !== 0)
      : value.issues.length === 0)) {
    throw new ApiRequestError("复制一天预览响应不完整；请刷新日历后重新检查。", 200);
  }
  return value as CopyDayPreview;
}

/** Confirm that a successful Copy Day response represents the previewed target. */
export function assertCopyDayResponse(value: unknown, storeId: string, preview: CopyDayPreview):
  { created: number; period: RosterPeriod } {
  const period = record(value) ? value.period : null;
  if (!preview.canCopy || preview.shiftCount < 1 || preview.readyShifts !== preview.shiftCount
    || !record(value) || !Number.isInteger(value.created) || value.created !== preview.shiftCount
    || !record(period) || typeof period.id !== "string" || !period.id
    || period.storeId !== storeId || period.status !== "DRAFT"
    || !calendarDate(period.startDate) || !calendarDate(period.endDate)
    || period.startDate > preview.targetDate || period.endDate < preview.targetDate
    || period.version !== (preview.targetPeriodVersion ?? 1) + 1) {
    throw new ApiRequestError("服务器返回的复制结果与预览不一致，结果尚未确认；请检查目标日期的排班。", 0);
  }
  return value as { created: number; period: RosterPeriod };
}
