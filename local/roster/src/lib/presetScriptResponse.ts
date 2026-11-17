import { ApiRequestError } from "./apiClient";
import type { PresetScriptPreview } from "../services/rosterRepository";

type CommitRequest = { expectedCreateCount: number; expectedUnchangedCount: number };
type CommitResult = { importId: string; alreadyImported: boolean; created: number; unchanged: number };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const instant = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
}

function instant(value: unknown): number | null {
  if (typeof value !== "string" || !/T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; }
  catch { return false; }
}

/** Preview must be complete before any of its arrays, clocks or counts enter the dialog. */
export function assertPresetScriptPreview(value: unknown): PresetScriptPreview {
  if (!record(value) || !calendarDate(value.weekStart) || new Date(`${value.weekStart}T00:00:00.000Z`).getUTCDay() !== 1
    || !validTimezone(value.timezone)
    || typeof value.previewHash !== "string" || !/^[0-9a-f]{64}$/.test(value.previewHash)
    || typeof value.slotStatusHash !== "string" || !/^[0-9a-f]{64}$/.test(value.slotStatusHash)
    || !Array.isArray(value.slots) || !Array.isArray(value.issues) || !record(value.summary)
    || !count(value.summary.create) || !count(value.summary.unchanged) || !count(value.summary.conflict)
    || typeof value.canCommit !== "boolean") throw invalidPreview();
  const lastDate = new Date(`${value.weekStart}T00:00:00.000Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() + 6);
  const weekEnd = lastDate.toISOString().slice(0, 10);
  const statuses = { CREATE: 0, UNCHANGED: 0, CONFLICT: 0 };
  for (const slot of value.slots) {
    if (!record(slot) || typeof slot.employeeId !== "string" || !slot.employeeId
      || typeof slot.employeeName !== "string" || !slot.employeeName
      || !calendarDate(slot.date) || slot.date < value.weekStart || slot.date > weekEnd
      || typeof slot.shortcut !== "string" || !slot.shortcut
      || !Number.isInteger(slot.line) || Number(slot.line) < 1
      || !["CREATE", "UNCHANGED", "CONFLICT"].includes(String(slot.status))) throw invalidPreview();
    const start = instant(slot.startAt);
    const end = instant(slot.endAt);
    if (start === null || end === null || start >= end) throw invalidPreview();
    statuses[slot.status as keyof typeof statuses] += 1;
  }
  for (const issue of value.issues) {
    if (!record(issue) || !Number.isInteger(issue.line) || Number(issue.line) < 0
      || typeof issue.code !== "string" || !issue.code
      || typeof issue.message !== "string" || !issue.message
      || (issue.nickname !== undefined && typeof issue.nickname !== "string")) throw invalidPreview();
  }
  if (statuses.CREATE !== value.summary.create || statuses.UNCHANGED !== value.summary.unchanged
    || statuses.CONFLICT !== value.summary.conflict
    || value.canCommit !== (value.issues.length === 0 && statuses.CONFLICT === 0 && statuses.CREATE > 0)) throw invalidPreview();
  return value as PresetScriptPreview;
}

/** The import transaction records exactly the reviewed new and unchanged slot counts. */
export function assertPresetScriptCommit(value: unknown, request: CommitRequest): CommitResult {
  if (!record(value) || typeof value.importId !== "string" || !value.importId
    || typeof value.alreadyImported !== "boolean"
    || value.created !== request.expectedCreateCount || value.unchanged !== request.expectedUnchangedCount) {
    throw new ApiRequestError("脚本导入响应与预览人数不一致，结果尚未确认；请重新加载核对。", 0);
  }
  return value as CommitResult;
}

function invalidPreview(): ApiRequestError {
  return new ApiRequestError("脚本预览响应不完整；请重新转换后核对。", 200);
}
