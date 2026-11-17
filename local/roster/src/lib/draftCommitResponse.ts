import type { CalendarDraftQueue } from "./calendarDraftQueue";
import { ApiRequestError } from "./apiClient";
import { assertSavedShiftResponse } from "./shiftMutationResponse";
import type { Shift } from "../types/roster";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unconfirmed(): never {
  throw new ApiRequestError("服务器返回的批量提交结果与暂存内容不一致，结果尚未确认；请先核对提交结果。", 0);
}

/** Confirm every requested write before the Calendar discards its local draft queue. */
export function assertDraftCommitResponse(value: unknown, periodId: string,
  queue: CalendarDraftQueue): { saved: Shift[]; deletedIds: string[] } {
  if (!record(value) || !Array.isArray(value.saved) || !Array.isArray(value.deletedIds)) unconfirmed();

  const writes = queue.changes.filter((change) => change.kind !== "delete");
  const expectedDeleted = queue.changes.filter((change) => change.kind === "delete").map((change) => change.shiftId);
  const deletedIds = value.deletedIds;
  if (value.saved.length !== writes.length || deletedIds.length !== expectedDeleted.length
    || !deletedIds.every((id: unknown) => typeof id === "string" && id.length > 0)
    || new Set(deletedIds).size !== deletedIds.length
    || expectedDeleted.some((id) => !deletedIds.includes(id))) unconfirmed();

  const saved = value.saved as Shift[];
  const savedById = new Map<string, Shift>();
  for (const item of saved) {
    if (!record(item) || typeof item.id !== "string" || !item.id || savedById.has(item.id)) unconfirmed();
    savedById.set(item.id, item as Shift);
  }
  for (const change of writes) {
    const id = change.kind === "create" ? change.clientShiftId : change.shiftId;
    const item = savedById.get(id);
    if (!item || deletedIds.includes(id)) unconfirmed();
    assertSavedShiftResponse(item, { ...change.value, storeId: queue.storeId }, id, periodId,
      change.kind === "update" ? change.baseVersion : undefined);
  }
  return { saved, deletedIds: deletedIds as string[] };
}
