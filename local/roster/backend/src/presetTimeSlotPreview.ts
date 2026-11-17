import { createHash } from "node:crypto";
import type { ScriptIssue, ScriptSlot } from "./presetTimeSlotScript.js";
import { overlappingScriptSlotIndexes, type PresetSlotReview } from "./presetTimeSlotReview.js";
import { isCoveredByAvailability } from "./rosterService.js";

export type ExistingAvailability = {
  id: string;
  employeeId: string;
  date: string;
  status: string;
  startAt: string | null;
  endAt: string | null;
  version: number;
};

export type ExistingShiftAssignment = {
  employeeId: string;
  date: string;
  startAt: string;
  endAt: string;
};

export function presetTimeSlotFingerprint(storeId: string, weekStart: string, timezone: string, slots: ScriptSlot[]) {
  const canonical = slots.map(({ employeeId, date, startAt, endAt }) => ({ employeeId, date, startAt, endAt }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256").update(JSON.stringify({ storeId, weekStart, timezone, slots: canonical })).digest("hex");
}

/** Preview identity includes the workforce the manager reviewed; the import's source hash stays stable for idempotency. */
export function presetTimeSlotPreviewFingerprint(sourceHash: string, workforceRevision: string | null, slots: ScriptSlot[],
  settingsVersion: number | null, shortcutsVersion: number, expectedCreateCount: number, expectedUnchangedCount: number,
  expectedSlotStatusHash: string) {
  const employees = [...new Map(slots.map((slot) => [slot.employeeId, slot.employeeName])).entries()]
    .sort(([left], [right]) => left.localeCompare(right));
  return createHash("sha256").update(JSON.stringify({ sourceHash, workforceRevision, employees,
    settingsVersion, shortcutsVersion, expectedCreateCount, expectedUnchangedCount, expectedSlotStatusHash })).digest("hex");
}

// Preview is deliberately read only. A recorded date is never silently
// replaced; identical rows are reported as unchanged so a repeated paste is
// recognizable before a future guarded commit.
export function previewPresetTimeSlots(slots: ScriptSlot[], existing: ExistingAvailability[], assignments: ExistingShiftAssignment[] = []) {
  const rowsByDay = new Map<string, ExistingAvailability[]>();
  for (const row of existing) {
    const key = `${row.employeeId}:${row.date}`;
    rowsByDay.set(key, [...(rowsByDay.get(key) ?? []), row]);
  }
  const issues: ScriptIssue[] = [];
  const overlapsProposed = overlappingScriptSlotIndexes(slots);
  const proposedDayLines = new Map<string, number[]>();
  const reportedDuplicateDays = new Set<string>();
  for (const slot of slots) {
    const key = `${slot.employeeId}:${slot.date}`;
    proposedDayLines.set(key, [...(proposedDayLines.get(key) ?? []), slot.line]);
  }
  const preview = slots.map((slot, index) => {
    const prior = rowsByDay.get(`${slot.employeeId}:${slot.date}`) ?? [];
    const unchanged = prior.length === 1 && prior[0]!.status === "AVAILABLE"
      && prior[0]!.startAt === slot.startAt && prior[0]!.endAt === slot.endAt;
    const overlapping = prior.length === 0 && existing.some((row) => row.employeeId === slot.employeeId
      && row.startAt && row.endAt && row.startAt < slot.endAt && row.endAt > slot.startAt);
    const dayKey = `${slot.employeeId}:${slot.date}`;
    const duplicateLines = proposedDayLines.get(dayKey) ?? [];
    const duplicateDay = duplicateLines.length > 1;
    const status: PresetSlotReview["status"] = duplicateDay || overlapsProposed.has(index) ? "CONFLICT"
      : prior.length === 0 && !overlapping ? "CREATE" : unchanged ? "UNCHANGED" : "CONFLICT";
    if (duplicateDay) {
      if (!reportedDuplicateDays.has(dayKey)) {
        reportedDuplicateDays.add(dayKey);
        issues.push({ line: duplicateLines[1] ?? slot.line, code: "DUPLICATE_DAY",
          message: `${slot.employeeName} ${slot.date} 在同次导入中出现多个时段；每天只允许一条` });
      }
    } else if (overlapsProposed.has(index)) issues.push({ line: slot.line, code: "SCRIPT_WINDOW_OVERLAP",
      message: `${slot.employeeName} ${slot.date} 与同次导入的另一时段重叠，请调整快捷码` });
    else if (status === "CONFLICT") issues.push({ line: slot.line, code: "ALREADY_RECORDED",
      message: `${slot.employeeName} ${slot.date} 已有或跨日重叠可用时间；默认追加不会覆盖` });
    return { ...slot, status, existingRows: prior.map(({ id, version }) => ({ id, version })) };
  });
  const creates = preview.filter((slot) => slot.status === "CREATE");
  for (const assignment of assignments) {
    const affected = creates.filter((slot) => slot.employeeId === assignment.employeeId
      && (assignment.date === slot.date || (assignment.startAt < slot.endAt && assignment.endAt > slot.startAt)));
    if (!affected.length) continue;
    const windows = [
      ...existing.filter((row) => row.employeeId === assignment.employeeId).map((row) => ({
        status: row.status === "AVAILABLE" ? "AVAILABLE" as const : "UNAVAILABLE" as const,
        startAt: row.startAt ? new Date(row.startAt) : null, endAt: row.endAt ? new Date(row.endAt) : null,
      })),
      ...creates.filter((slot) => slot.employeeId === assignment.employeeId).map((slot) => ({
        status: "AVAILABLE" as const, startAt: new Date(slot.startAt), endAt: new Date(slot.endAt),
      })),
    ];
    if (isCoveredByAvailability(windows, new Date(assignment.startAt), new Date(assignment.endAt))) continue;
    for (const slot of affected) {
      if (slot.status === "CONFLICT") continue;
      slot.status = "CONFLICT";
      issues.push({ line: slot.line, code: "SHIFT_OUTSIDE_AVAILABILITY",
        message: `${slot.employeeName} ${slot.date} 已有班次不在导入后的可用时间内` });
    }
  }
  return { slots: preview, issues, summary: {
    create: preview.filter((row) => row.status === "CREATE").length,
    unchanged: preview.filter((row) => row.status === "UNCHANGED").length,
    conflict: preview.filter((row) => row.status === "CONFLICT").length,
  } };
}
