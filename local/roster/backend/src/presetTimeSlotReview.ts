import { createHash } from "node:crypto";
import type { ScriptSlot } from "./presetTimeSlotScript.js";

export type PresetSlotReview = Pick<ScriptSlot, "employeeId" | "date" | "startAt" | "endAt"> & {
  status: "CREATE" | "UNCHANGED" | "CONFLICT";
  existingRows: Array<{ id: string; version: number }>;
};

/** Detect overlaps among the proposed rows themselves, including overnight carryover. */
export function overlappingScriptSlotIndexes(slots: ScriptSlot[]): Set<number> {
  const byEmployee = new Map<string, number[]>();
  slots.forEach((slot, index) => {
    const indexes = byEmployee.get(slot.employeeId);
    if (indexes) indexes.push(index);
    else byEmployee.set(slot.employeeId, [index]);
  });
  const overlapping = new Set<number>();
  for (const indexes of byEmployee.values()) {
    indexes.sort((left, right) => Date.parse(slots[left]!.startAt) - Date.parse(slots[right]!.startAt));
    let activeIndex: number | null = null;
    let activeEnd = -Infinity;
    for (const index of indexes) {
      const start = Date.parse(slots[index]!.startAt);
      const end = Date.parse(slots[index]!.endAt);
      if (activeIndex !== null && start < activeEnd) {
        overlapping.add(activeIndex);
        overlapping.add(index);
      }
      if (end > activeEnd) { activeEnd = end; activeIndex = index; }
    }
  }
  return overlapping;
}

/** Binds the exact reviewed write set and any existing-row versions, not just summary counts. */
export function presetTimeSlotReviewFingerprint(slots: PresetSlotReview[]) {
  const canonical = slots.map(({ employeeId, date, startAt, endAt, status, existingRows }) => ({
    employeeId, date, startAt, endAt, status,
    existingRows: existingRows.map(({ id, version }) => ({ id, version })).sort((a, b) => a.id.localeCompare(b.id)),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}
