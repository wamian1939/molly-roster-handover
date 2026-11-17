import type { DraftChange } from "./calendarDraftQueue";
import { findMatchingShift } from "./mutationReconciliation";
import type { Shift } from "../types/roster";

export type DraftReadbackState = "committed" | "unchanged" | "unknown";

/** Classify one authoritative Shift read without assuming its period from its ID. */
export function draftChangeReadbackState(change: DraftChange, current: Shift | null,
  storeId: string, periodId: string): DraftReadbackState {
  if (!current) return change.kind === "delete" ? "committed" : change.kind === "create" ? "unchanged" : "unknown";

  const id = change.kind === "create" ? change.clientShiftId : change.shiftId;
  if (current.id !== id || current.storeId !== storeId || current.rosterPeriodId !== periodId
    || !Number.isInteger(current.version) || current.version < 1) return "unknown";

  if (change.kind === "delete") return current.version === change.baseVersion ? "unchanged" : "unknown";
  if (findMatchingShift([current], change.value, id, undefined,
    change.kind === "update" ? change.baseVersion : undefined)) return "committed";
  return change.kind === "update" && current.version === change.baseVersion ? "unchanged" : "unknown";
}
