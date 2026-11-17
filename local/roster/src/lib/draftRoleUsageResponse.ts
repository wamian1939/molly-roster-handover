import type { DraftRoleUsage } from "../services/rosterRepository";

function calendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function assertDraftRoleUsageResponse(value: unknown): DraftRoleUsage[] {
  if (!Array.isArray(value)) throw new Error("待核对草稿岗位响应不完整，请重新读取");
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)
      || typeof item.id !== "string" || !item.id || seen.has(item.id)
      || typeof item.code !== "string" || !item.code
      || typeof item.nameZh !== "string" || !item.nameZh
      || typeof item.isActive !== "boolean"
      || !Number.isInteger(item.shiftCount) || item.shiftCount < 1
      || !calendarDate(item.firstDate)) {
      throw new Error("待核对草稿岗位响应不完整，请重新读取");
    }
    seen.add(item.id);
  }
  return value as DraftRoleUsage[];
}
