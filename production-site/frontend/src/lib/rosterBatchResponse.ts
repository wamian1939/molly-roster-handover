import { ApiRequestError } from "./apiClient";
import type { RepeatPreview } from "../services/rosterRepository";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

/** The server previews exactly one source Shift for each requested target date. */
export function assertRepeatPreview(value: unknown, targetDates: string[]): RepeatPreview {
  if (!record(value) || value.policy !== "ALL_OR_NOTHING"
    || !Array.isArray(value.targetDates) || value.targetDates.length !== targetDates.length
    || value.targetDates.some((date, index) => !calendarDate(date) || date !== targetDates[index])
    || (value.sourcePeriodVersion === null ? value.canCopy !== false
      : !Number.isInteger(value.sourcePeriodVersion) || Number(value.sourcePeriodVersion) < 1)
    || !Array.isArray(value.targetPeriodVersions) || value.targetPeriodVersions.length !== targetDates.length
    || value.targetPeriodVersions.some((item, index) => !record(item) || item.date !== targetDates[index]
      || (item.version !== null && (!Number.isInteger(item.version) || Number(item.version) < 1)))
    || !nonnegativeInteger(value.shiftCount) || value.shiftCount !== targetDates.length
    || !nonnegativeInteger(value.readyShifts) || value.readyShifts > value.shiftCount
    || !nonnegativeInteger(value.availableAssignments) || !nonnegativeInteger(value.blockedAssignments)
    || typeof value.canCopy !== "boolean" || !Array.isArray(value.issues)
    || !value.issues.every((issue: unknown) => record(issue) && calendarDate(issue.shiftDate)
      && typeof issue.employeeName === "string" && typeof issue.code === "string"
      && issue.severity === "BLOCKING_ERROR" && typeof issue.reason === "string")
    || (value.canCopy && (value.shiftCount === 0 || value.readyShifts !== value.shiftCount
      || value.blockedAssignments !== 0 || value.issues.length !== 0))) {
    throw new ApiRequestError("重复班次预览响应不完整；请重新检查冲突。", 200);
  }
  return value as RepeatPreview;
}

/** A successful all-or-nothing batch must report the exact submitted count. */
export function assertBatchMutationCount<K extends "created" | "updated" | "deleted">(
  value: unknown, key: K, expected: number): Record<K, number> {
  if (!Number.isInteger(expected) || expected < 1 || !record(value) || value[key] !== expected) {
    throw new ApiRequestError("服务器返回的批量处理数量与请求不一致，结果尚未确认；请刷新日历核对。", 0);
  }
  return value as Record<K, number>;
}
