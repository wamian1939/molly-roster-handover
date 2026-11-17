import type { Shift } from "../types/roster";
import { ApiRequestError } from "./apiClient";

/** A 404 for every concrete Shift ID is the only confirmed group deletion. */
export async function findRemainingShiftAfterUncertainDelete(
  storeId: string,
  shiftIds: readonly string[],
  readShift: (storeId: string, shiftId: string) => Promise<Shift>,
): Promise<Shift | null> {
  if (!shiftIds.length) throw new Error("没有可核对的班次 ID");
  for (const shiftId of new Set(shiftIds)) {
    try {
      const shift = await readShift(storeId, shiftId);
      const date = typeof shift?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(shift.date)
        ? new Date(`${shift.date}T00:00:00.000Z`) : null;
      if (!shift || shift.id !== shiftId || shift.storeId !== storeId
        || !date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== shift.date) {
        throw new ApiRequestError("班次查询结果与请求不一致，删除结果尚未确认。", 0);
      }
      return shift;
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 404) continue;
      throw cause;
    }
  }
  return null;
}
