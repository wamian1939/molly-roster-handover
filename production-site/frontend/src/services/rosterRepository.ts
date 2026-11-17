import { apiRequest } from "../lib/apiClient";
import { assertCalendarResponse } from "../lib/calendarResponse";
import { assertSavedShiftResponse } from "../lib/shiftMutationResponse";
import { assertDraftCommitResponse } from "../lib/draftCommitResponse";
import { assertCopyPeriodPreview, assertCopyPeriodResponse } from "../lib/copyPeriodResponse";
import { assertCopyDayPreview } from "../lib/copyDayResponse";
import { assertAvailabilityRows, assertSavedAvailabilityRows } from "../lib/availabilityResponse";
import { assertPresetScriptCommit, assertPresetScriptPreview } from "../lib/presetScriptResponse";
import { assertPublishedPeriod, assertReopenedPeriod } from "../lib/publicationMutationResponse";
import { assertBatchMutationCount, assertRepeatPreview } from "../lib/rosterBatchResponse";
import type { CalendarDraftQueue } from "../lib/calendarDraftQueue";
import type { AvailabilityStatus, AvailabilityTemplate, PeriodSummary, PublicationDetail, PublicationSummary, RosterPeriod, RosterStoreSettings, Shift, ShiftRole, ShiftTemplate } from "../types/roster";

export type CopyPeriodPreview = { policy: "ALL_OR_NOTHING"; shiftCount: number; readyShifts: number; availableAssignments: number; blockedAssignments: number; unavailableAssignments: number; conflictingAssignments: number; issues: Array<{ shiftDate: string; shiftId?: string; employeeId?: string; employeeName: string; code: string; severity: "BLOCKING_ERROR"; reason: string }>; canCopy: boolean; targetStartDate: string; sourcePeriodVersion: number };
export type CopyDayPreview = Omit<CopyPeriodPreview, "targetStartDate" | "sourcePeriodVersion"> & { sourceDate: string; targetDate: string; sourcePeriodVersion: number | null; targetPeriodVersion: number | null };
export type RepeatPreview = { policy: "ALL_OR_NOTHING"; shiftCount: number; readyShifts: number; availableAssignments: number; blockedAssignments: number; issues: CopyPeriodPreview["issues"]; canCopy: boolean; targetDates: string[]; sourcePeriodVersion: number | null; targetPeriodVersions: Array<{ date: string; version: number | null }> };
export type DraftRoleUsage = { id: string; code: string; nameZh: string; isActive: boolean; shiftCount: number; firstDate: string };
export type PresetScriptShortcut = { code: string; startTime: string; endTime: string };
export type PresetShortcutConfiguration = { storeId: string; shortcuts: PresetScriptShortcut[]; version: number };
export type PresetScriptInput = { storeId: string; week: "CURRENT" | "NEXT"; script: string; expectedShortcutsVersion?: number; employeeMappings?: Array<{ nickname: string; employeeId: string }> };
export type PresetScriptPreview = { weekStart: string; timezone: string; previewHash: string; slotStatusHash: string;
  slots: Array<{ employeeId: string; employeeName: string; date: string; startAt: string; endAt: string; shortcut: string; line: number; status: "CREATE" | "UNCHANGED" | "CONFLICT" }>;
  issues: Array<{ line: number; code: string; message: string; nickname?: string }>;
  summary: { create: number; unchanged: number; conflict: number }; canCommit: boolean };

function query(input: Record<string, string>) { return new URLSearchParams(input).toString(); }

export const rosterRepository = {
  calendar(storeId: string, from: string, to: string) {
    return apiRequest<unknown>(`/roster/calendar?${query({ storeId, from, to })}`)
      .then((response) => assertCalendarResponse(response, storeId, from, to));
  },
  roles(storeId: string, options?: { includeInactive?: boolean }) {
    return apiRequest<ShiftRole[]>(`/roster/roles?${query({ storeId, ...(options?.includeInactive ? { includeInactive: "true" } : {}) })}`);
  },
  draftRoleUsage(storeId: string) { return apiRequest<DraftRoleUsage[]>(`/roster/roles/draft-usage?${query({ storeId })}`); },
  createRole(input: { storeId: string; code: string; nameZh: string; colorToken: string; requiredSkillCodes: string[]; displayOrder?: number }) {
    return apiRequest<ShiftRole>("/roster/roles", { method: "POST", body: JSON.stringify(input) });
  },
  updateRole(roleId: string, input: { storeId: string; nameZh: string; colorToken: string; requiredSkillCodes: string[]; isActive: boolean; displayOrder: number; version: number }) {
    return apiRequest<ShiftRole>(`/roster/roles/${encodeURIComponent(roleId)}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  templates(storeId: string) { return apiRequest<ShiftTemplate[]>(`/roster/templates?${query({ storeId })}`); },
  createTemplate(input: { storeId: string; name: string; startTime: string; endTime: string; breakMinutes: number; shiftRoleId?: string | null; displayOrder?: number }) {
    return apiRequest<ShiftTemplate>("/roster/templates", { method: "POST", body: JSON.stringify(input) });
  },
  updateTemplate(templateId: string, input: { storeId: string; name: string; startTime: string; endTime: string; breakMinutes: number; shiftRoleId?: string | null; isActive: boolean; displayOrder: number; version: number }) {
    return apiRequest<ShiftTemplate>(`/roster/templates/${encodeURIComponent(templateId)}`, { method: "PATCH", body: JSON.stringify(input) });
  },
  availabilityTemplates(storeId: string) { return apiRequest<AvailabilityTemplate[]>(`/roster/availability-templates?${query({ storeId })}`); },
  presetShortcuts(storeId: string) { return apiRequest<{ configuration: PresetShortcutConfiguration | null }>(`/roster/availability-script/shortcuts?${query({ storeId })}`); },
  savePresetShortcuts(input: { storeId: string; shortcuts: PresetScriptShortcut[]; version?: number }) {
    return apiRequest<PresetShortcutConfiguration>("/roster/availability-script/shortcuts", { method: "PUT", body: JSON.stringify(input) });
  },
  previewPresetScript(input: PresetScriptInput) {
    return apiRequest<unknown>("/roster/availability-script/preview", { method: "POST", body: JSON.stringify(input) })
      .then(assertPresetScriptPreview);
  },
  commitPresetScript(input: PresetScriptInput & { previewHash: string; expectedSlotStatusHash: string; expectedCreateCount: number; expectedUnchangedCount: number }) {
    return apiRequest<unknown>("/roster/availability-script/commit", { method: "POST", body: JSON.stringify(input) })
      .then((response) => assertPresetScriptCommit(response, input));
  },
  createAvailabilityTemplate(input: { storeId: string; name: string; slots: AvailabilityTemplate["slots"]; displayOrder?: number }) { return apiRequest<AvailabilityTemplate>("/roster/availability-templates", { method: "POST", body: JSON.stringify(input) }); },
  updateAvailabilityTemplate(templateId: string, input: { storeId: string; name: string; slots: AvailabilityTemplate["slots"]; isActive: boolean; displayOrder: number; version: number }) { return apiRequest<AvailabilityTemplate>(`/roster/availability-templates/${encodeURIComponent(templateId)}`, { method: "PATCH", body: JSON.stringify(input) }); },
  settings(storeId: string) { return apiRequest<{ settings: RosterStoreSettings | null }>(`/roster/settings?${query({ storeId })}`); },
  saveSettings(storeId: string, input: RosterStoreSettings) { return apiRequest<RosterStoreSettings>(`/roster/settings/${encodeURIComponent(storeId)}`, { method: "PUT", body: JSON.stringify(input) }); },
  createPeriod(input: { storeId: string; startDate: string; endDate: string; cycleType: "WEEK" | "FORTNIGHT" }) {
    return apiRequest<RosterPeriod>("/roster/periods", { method: "POST", body: JSON.stringify(input) });
  },
  periods(storeId: string, from: string, to: string) { return apiRequest<RosterPeriod[]>(`/roster/periods?${query({ storeId, from, to })}`); },
  period(storeId: string, periodId: string) { return apiRequest<Pick<RosterPeriod, "status" | "version">>(`/roster/periods/${encodeURIComponent(periodId)}?${query({ storeId })}`); },
  createShift(input: { storeId: string; rosterPeriodId: string; date: string; startAt: string; endAt: string; breakMinutes: number; shiftRoleId: string; employeeIds: string[]; publicNote?: string; internalNote?: string }) {
    return apiRequest<unknown>("/roster/shifts", { method: "POST", body: JSON.stringify(input) })
      .then((response) => assertSavedShiftResponse(response, input, undefined, input.rosterPeriodId));
  },
  createShiftWithPeriod(input: { storeId: string; targetStartDate: string; targetEndDate: string; date: string; startAt: string; endAt: string; breakMinutes: number; shiftRoleId: string; employeeIds: string[]; publicNote?: string; internalNote?: string; clientShiftId?: string }) {
    return apiRequest<unknown>("/roster/shifts/with-period", { method: "POST", body: JSON.stringify(input) })
      .then((response) => assertSavedShiftResponse(response, input, input.clientShiftId));
  },
  commitDraftPeriod(rosterPeriodId: string, queue: CalendarDraftQueue) {
    if (queue.changes.some((change) => change.kind !== "create" && change.basePeriodId !== rosterPeriodId)) {
      throw new Error("待提交班次不属于同一排班周期");
    }
    const changes = queue.changes.map((change) => change.kind === "create"
      ? { kind: change.kind, clientShiftId: change.clientShiftId, value: change.value }
      : change.kind === "update"
        ? { kind: change.kind, shiftId: change.shiftId, baseVersion: change.baseVersion, value: change.value }
        : { kind: change.kind, shiftId: change.shiftId, baseVersion: change.baseVersion });
    return apiRequest<unknown>("/roster/shifts/draft-commit", {
      method: "POST", body: JSON.stringify({ storeId: queue.storeId, rosterPeriodId, changes }),
    }).then((response) => assertDraftCommitResponse(response, rosterPeriodId, queue));
  },
  updateShift(shiftId: string, input: { storeId: string; rosterPeriodId: string; date: string; startAt: string; endAt: string; breakMinutes: number; shiftRoleId: string; employeeIds: string[]; publicNote?: string; internalNote?: string; version: number }) {
    return apiRequest<unknown>(`/roster/shifts/${encodeURIComponent(shiftId)}`, { method: "PATCH", body: JSON.stringify(input) })
      .then((response) => assertSavedShiftResponse(response, input, shiftId, input.rosterPeriodId, input.version));
  },
  shift(storeId: string, shiftId: string) {
    return apiRequest<Shift>(`/roster/shifts/${encodeURIComponent(shiftId)}?${query({ storeId })}`);
  },
  repositionShift(shiftId: string, input: { storeId: string; date: string; startAt: string; endAt: string; targetStartDate: string; targetEndDate: string; version: number; sourceEmployeeId?: string; targetEmployeeId?: string }) {
    return apiRequest<Shift>(`/roster/shifts/${encodeURIComponent(shiftId)}/reposition`, { method: "PATCH", body: JSON.stringify(input) });
  },
  deleteShift(shiftId: string, storeId: string, version: number) {
    return apiRequest<void>(`/roster/shifts/${encodeURIComponent(shiftId)}?${query({ storeId, version: String(version) })}`, { method: "DELETE" });
  },
  availability(storeId: string, from: string, to: string, employeeId?: string) {
    return apiRequest<unknown>(`/roster/availability?${query({ storeId, from, to, ...(employeeId ? { employeeId } : {}) })}`)
      .then((response) => assertAvailabilityRows(response, storeId, from, to, employeeId));
  },
  replaceAvailability(input: { storeId: string; employeeId: string; dates: string[]; expectedRows: Array<{ id: string; version: number }>; entries: Array<{ date: string; status: AvailabilityStatus; startAt: string | null; endAt: string | null; note?: string; source?: "MANUAL" | "TEMPLATE" }> }) {
    return apiRequest<unknown>("/roster/availability", { method: "PUT", body: JSON.stringify(input) })
      .then((response) => assertSavedAvailabilityRows(response, input));
  },
  periodSummary(storeId: string, periodId: string) { return apiRequest<PeriodSummary>(`/roster/periods/${encodeURIComponent(periodId)}/summary?${query({ storeId })}`); },
  publishPeriod(storeId: string, periodId: string, version: number, previous: RosterPeriod) {
    return apiRequest<unknown>(`/roster/periods/${encodeURIComponent(periodId)}/publish`, { method: "POST", body: JSON.stringify({ storeId, version }) })
      .then((response) => assertPublishedPeriod(response, previous));
  },
  publications(storeId: string, periodId: string) { return apiRequest<PublicationSummary[]>(`/roster/periods/${encodeURIComponent(periodId)}/publications?${query({ storeId })}`); },
  publication(storeId: string, publicationId: string, audience: "employee" | "manager" = "employee") { return apiRequest<PublicationDetail>(`/roster/publications/${encodeURIComponent(publicationId)}?${query({ storeId, audience })}`); },
  reopenPeriod(storeId: string, periodId: string, version: number, previous: RosterPeriod) {
    return apiRequest<unknown>(`/roster/periods/${encodeURIComponent(periodId)}/reopen`, { method: "POST", body: JSON.stringify({ storeId, version }) })
      .then((response) => assertReopenedPeriod(response, previous));
  },
  copyPeriod(input: { storeId: string; sourcePeriodId: string; targetStartDate: string; expectedSourcePeriodVersion: number },
    expected: { endDate: string; cycleType: RosterPeriod["cycleType"]; preview: CopyPeriodPreview }) {
    return apiRequest<unknown>("/roster/batch/copy", { method: "POST", body: JSON.stringify(input) })
      .then((response) => assertCopyPeriodResponse(response, input.storeId, input.sourcePeriodId,
        { startDate: input.targetStartDate, endDate: expected.endDate, cycleType: expected.cycleType }, expected.preview));
  },
  previewCopyPeriod(input: { storeId: string; sourcePeriodId: string; targetStartDate: string }) {
    return apiRequest<unknown>("/roster/batch/copy/preview", { method: "POST", body: JSON.stringify(input) })
      .then((response) => assertCopyPeriodPreview(response, input.targetStartDate));
  },
  previewCopyDay(input: { storeId: string; sourceDate: string; targetDate: string }) {
    return apiRequest<unknown>("/roster/batch/copy-day/preview", { method: "POST", body: JSON.stringify(input) })
      .then((response) => assertCopyDayPreview(response, input.sourceDate, input.targetDate));
  },
  copyDay(input: { storeId: string; sourceDate: string; targetDate: string; expectedSourcePeriodVersion: number | null; expectedTargetPeriodVersion: number | null }) { return apiRequest<{ created: number; period: RosterPeriod }>("/roster/batch/copy-day", { method: "POST", body: JSON.stringify(input) }); },
  previewRepeatShift(input: { storeId: string; sourceShiftId: string; targetDates: string[] }) {
    return apiRequest<unknown>("/roster/batch/repeat/preview", { method: "POST", body: JSON.stringify(input) })
      .then((response) => assertRepeatPreview(response, input.targetDates));
  },
  repeatShift(input: { storeId: string; sourceShiftId: string; targetDates: string[]; expectedSourcePeriodVersion: number | null; expectedTargetPeriodVersions: RepeatPreview["targetPeriodVersions"] }) {
    return apiRequest<unknown>("/roster/batch/repeat", { method: "POST", body: JSON.stringify(input) })
      .then((response) => assertBatchMutationCount(response, "created", input.targetDates.length));
  },
  batchUpdateRole(storeId: string, items: Array<{ id: string; version: number }>, shiftRoleId: string) {
    return apiRequest<unknown>("/roster/batch/update", { method: "POST", body: JSON.stringify({ storeId, items, patch: { shiftRoleId } }) })
      .then((response) => assertBatchMutationCount(response, "updated", items.length));
  },
  batchDelete(storeId: string, items: Array<{ id: string; version: number }>) {
    return apiRequest<unknown>("/roster/batch/delete", { method: "POST", body: JSON.stringify({ storeId, items }) })
      .then((response) => assertBatchMutationCount(response, "deleted", items.length));
  },
};
