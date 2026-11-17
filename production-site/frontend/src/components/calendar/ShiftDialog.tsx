import { CalendarDays, Check, CircleAlert, Clock3, Search, UsersRound, X } from "lucide-react";
import { DateTime } from "luxon";
import { useMemo, useRef, useState } from "react";
import { formatElapsedDuration, formatShiftTimeRange } from "../../lib/dateTime";
import { availabilityRowsForShift } from "../../lib/calendarAvailability";
import { breakMinuteOptions } from "../../lib/breakMinuteOptions";
import { addCalendarDays, DEFAULT_STORE_TIMEZONE, storeDateTimeCandidates, storeParts } from "../../lib/storeTime";
import { availabilityWarning, conflictingEmployeeIds, filterEmployees, filterEmployeesByFormalPosition, filterEmployeesByRoles, rangesOverlap } from "../../lib/scheduling";
import { schedulingFeedback } from "../../lib/schedulingFeedback";
import { roleColorStyle } from "../../lib/roleColor";
import type { EmployeeAvailability, Shift, ShiftRole, ShiftTemplate } from "../../types/roster";
import type { RosterEmployee } from "../../types/workforce";
import { AppSelect } from "../ui/AppSelect";
import { Dialog } from "../ui/Dialog";
import { InlineSpinner } from "../ui/ToastProvider";
import { RoleChipSelector } from "./RoleChipSelector";
import { StaffRoleFilter } from "./StaffRoleFilter";

export type ShiftDraft = { date: string; start: Date; end: Date; employeeId?: string };

type SaveValue = {
  date: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  shiftRoleId: string;
  employeeIds: string[];
  publicNote: string;
  internalNote: string;
};
type OccurrenceChoice = { date: string; time: string; index: number };
const NO_RELATED_SHIFT_IDS: string[] = [];

function initialOccurrenceChoice(instant: Date, timezone: string): OccurrenceChoice {
  const { date, time } = storeParts(instant, timezone);
  const index = storeDateTimeCandidates(date, time, timezone).findIndex((candidate) => candidate.getTime() === instant.getTime());
  return { date, time, index: Math.max(0, index) };
}

function occurrenceOptions(candidates: Date[], time: string, timezone: string) {
  return candidates.map((candidate, index) => ({ value: String(index),
    label: `${index === 0 ? "第一次" : "第二次"} ${time}（UTC${DateTime.fromJSDate(candidate, { zone: timezone }).toFormat("ZZ")}）` }));
}

export function ShiftDialog({ draft, existingShift, copySourceShift, relatedShiftIds = NO_RELATED_SHIFT_IDS, roles, templates, employees, availability, existingShifts, workforceGeneratedAt, saving, saveLabel = "保存班次", staleVersion = false, snapshotUnavailable = false, snapshotUnavailableReason, onRetryContext, defaultBreakMinutes = 0, minimumShiftMinutes = 0, slotIntervalMinutes = 30, timezone = DEFAULT_STORE_TIMEZONE, onClose, onSave, onDelete, onCopy, onRepeat, onCopyDateChange }: {
  draft: ShiftDraft;
  existingShift?: Shift | null;
  copySourceShift?: Shift | null;
  relatedShiftIds?: string[];
  roles: ShiftRole[];
  templates: ShiftTemplate[];
  employees: RosterEmployee[];
  availability: EmployeeAvailability[];
  existingShifts: Shift[];
  workforceGeneratedAt: string | null;
  saving: boolean;
  saveLabel?: string;
  staleVersion?: boolean;
  snapshotUnavailable?: boolean;
  snapshotUnavailableReason?: string;
  onRetryContext?: () => void;
  defaultBreakMinutes?: number;
  minimumShiftMinutes?: number;
  slotIntervalMinutes?: number;
  timezone?: string;
  onClose: () => void;
  onSave: (value: SaveValue) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCopy?: () => void;
  onRepeat?: () => void;
  onCopyDateChange?: (date: string) => void;
}) {
  const sourceShift = existingShift ?? copySourceShift;
  const [roleId, setRoleId] = useState(sourceShift?.shiftRoleId ?? "");
  const [startTime, setStartTime] = useState(storeParts(draft.start, timezone).time);
  const [endTime, setEndTime] = useState(storeParts(draft.end, timezone).time);
  const [endNextDay, setEndNextDay] = useState(storeParts(draft.end, timezone).date !== storeParts(draft.start, timezone).date);
  const [startOccurrence, setStartOccurrence] = useState<OccurrenceChoice>(() => initialOccurrenceChoice(draft.start, timezone));
  const [endOccurrence, setEndOccurrence] = useState<OccurrenceChoice>(() => initialOccurrenceChoice(draft.end, timezone));
  const [breakMinutes, setBreakMinutes] = useState(sourceShift?.breakMinutes ?? defaultBreakMinutes);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(sourceShift?.assignments.map((assignment) => assignment.employeeId) ?? (draft.employeeId ? [draft.employeeId] : []));
  const [initiallySelectedEmployeeIds] = useState(() => new Set(selectedEmployeeIds));
  const [search, setSearch] = useState("");
  const [employeeType, setEmployeeType] = useState("ALL");
  const [tier, setTier] = useState("ALL");
  const [formalPositionId, setFormalPositionId] = useState("ALL");
  const [staffRoleIds, setStaffRoleIds] = useState<string[]>([]);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [visibleCount, setVisibleCount] = useState(60);
  const [publicNote, setPublicNote] = useState(sourceShift?.publicNote ?? "");
  const [internalNote, setInternalNote] = useState(sourceShift?.internalNote ?? "");
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [exitAction, setExitAction] = useState<"close" | "copy" | "repeat">("close");
  const secondaryActionsRef = useRef<HTMLDetailsElement>(null);

  const { start, end, startCandidates, endCandidates, startIndex, endIndex, timeStructureError } = useMemo(() => {
    try {
      const endDate = endNextDay ? addCalendarDays(draft.date, 1) : draft.date;
      const startCandidates = storeDateTimeCandidates(draft.date, startTime, timezone);
      const endCandidates = storeDateTimeCandidates(endDate, endTime, timezone);
      const startIndex = startOccurrence.time === startTime && (startOccurrence.date === draft.date || copySourceShift) ? startOccurrence.index : 0;
      const endIndex = endOccurrence.time === endTime && (endOccurrence.date === endDate || copySourceShift) ? endOccurrence.index : 0;
      return {
        start: startCandidates[startIndex] ?? startCandidates[0],
        end: endCandidates[endIndex] ?? endCandidates[0],
        startCandidates, endCandidates, startIndex, endIndex,
        timeStructureError: "",
      };
    } catch (cause) {
      return {
        start: new Date(Number.NaN),
        end: new Date(Number.NaN),
        startCandidates: [] as Date[], endCandidates: [] as Date[], startIndex: 0, endIndex: 0,
        timeStructureError: cause instanceof Error ? cause.message : "班次时间无效",
      };
    }
  }, [copySourceShift, draft.date, startTime, endTime, endNextDay, startOccurrence, endOccurrence, timezone]);
  const validTimeRange = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime());
  const originalEmployeeIds = new Set(existingShift?.assignments.map((assignment) => assignment.employeeId) ?? []);
  const hasUnsavedChanges = Boolean(existingShift && (
    draft.date !== existingShift.date || roleId !== existingShift.shiftRoleId
    || start.getTime() !== new Date(existingShift.startAt).getTime()
    || end.getTime() !== new Date(existingShift.endAt).getTime()
    || breakMinutes !== existingShift.breakMinutes
    || publicNote !== (existingShift.publicNote ?? "")
    || internalNote !== (existingShift.internalNote ?? "")
    || selectedEmployeeIds.length !== originalEmployeeIds.size
    || selectedEmployeeIds.some((employeeId) => !originalEmployeeIds.has(employeeId))
  ));

  function requestClose() {
    if (saving) return;
    if (confirmingExit) { setConfirmingExit(false); return; }
    if (existingShift && hasUnsavedChanges) { setExitAction("close"); setConfirmingExit(true); return; }
    onClose();
  }

  function requestSwitch(action: "copy" | "repeat") {
    if (saving) return;
    if (hasUnsavedChanges) { setExitAction(action); setConfirmingExit(true); return; }
    if (action === "copy") onCopy?.();
    else onRepeat?.();
  }

  function confirmExit() {
    if (exitAction === "copy") onCopy?.();
    else if (exitAction === "repeat") onRepeat?.();
    else onClose();
  }
  const offsetChanged = validTimeRange && start < end && DateTime.fromJSDate(start, { zone: timezone }).offset !== DateTime.fromJSDate(end, { zone: timezone }).offset;
  const role = roles.find((item) => item.id === roleId) ?? null;
  const unverifiedSelectedRole = Boolean(roleId && !role);
  const title = useMemo(
    () => new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date(`${draft.date}T12:00:00`)),
    [draft.date],
  );
  const formalPositionOptions = useMemo(() => {
    const positions = new Map<string, string>();
    for (const employee of employees) for (const position of employee.positions ?? []) positions.set(position.id, position.name);
    return [{ value: "ALL", label: "全部正式岗位" },
      ...[...positions].sort((left, right) => left[1].localeCompare(right[1], "zh-CN"))
        .map(([value, label]) => ({ value, label })),
      { value: "UNCONFIRMED", label: "正式岗位未确认" }];
  }, [employees]);
  const filteredEmployees = useMemo(
    () => filterEmployeesByRoles(filterEmployeesByFormalPosition(filterEmployees(employees, search, employeeType, tier), formalPositionId), roles, staffRoleIds),
    [employeeType, employees, formalPositionId, roles, search, staffRoleIds, tier],
  );
  const filteredEmployeeIds = useMemo(() => new Set(filteredEmployees.map((employee) => employee.id)), [filteredEmployees]);
  const currentEmployeeIds = useMemo(() => new Set(employees.map((employee) => employee.id)), [employees]);
  const unavailableSelectedIds = selectedEmployeeIds.filter((employeeId) => !currentEmployeeIds.has(employeeId));
  const hiddenSelectedCount = selectedEmployeeIds.filter((employeeId) => currentEmployeeIds.has(employeeId) && !filteredEmployeeIds.has(employeeId)).length;

  const relatedShiftIdSet = useMemo(() => new Set([existingShift?.id, ...relatedShiftIds].filter((id): id is string => Boolean(id))), [existingShift?.id, relatedShiftIds]);
  const otherShifts = useMemo(() => existingShifts.filter((shift) => !relatedShiftIdSet.has(shift.id)), [existingShifts, relatedShiftIdSet]);
  const conflictIds = useMemo(() => validTimeRange ? conflictingEmployeeIds(otherShifts, start, end) : new Set<string>(), [end, otherShifts, start, validTimeRange]);
  const availabilityByEmployee = useMemo(() => {
    const rows = new Map<string, EmployeeAvailability[]>();
    for (const row of availability) {
      const employeeRows = rows.get(row.employeeId) ?? [];
      employeeRows.push(row);
      rows.set(row.employeeId, employeeRows);
    }
    return rows;
  }, [availability]);
  const selectedConflict = employees.find((employee) => selectedEmployeeIds.includes(employee.id) && conflictIds.has(employee.id));
  const conflictingShiftFor = (employeeId: string) => otherShifts.find((shift) => shift.assignments.some((assignment) => assignment.employeeId === employeeId) && rangesOverlap(new Date(shift.startAt), new Date(shift.endAt), start, end));
  const availabilityFor = (employeeId: string) => availabilityRowsForShift(availabilityByEmployee.get(employeeId) ?? [], draft.date, start, end);
  const formalJobId = role?.formalJobId;
  const selectedFormalMismatch = formalJobId ? employees.find((employee) => selectedEmployeeIds.includes(employee.id)
    && !employee.positions?.some((position) => position.id === formalJobId)) : undefined;
  const verifiedJobCatalog = roles.length > 0 && roles.every((item) => Boolean(item.formalJobId));
  const showPickerControls = Boolean(roleId || selectedEmployeeIds.length || showAllCandidates || !verifiedJobCatalog);
  const candidateScopeActive = (!roleId && verifiedJobCatalog) || Boolean(formalJobId && validTimeRange && start < end && !snapshotUnavailable);
  const formalCandidateIds = !formalJobId ? new Set<string>()
    : new Set(filteredEmployees.filter((employee) => employee.positions?.some((position) => position.id === formalJobId))
      .map((employee) => employee.id));
  const eligibleCandidateIds = !candidateScopeActive || !formalJobId ? new Set<string>()
    : new Set(filteredEmployees.filter((employee) => formalCandidateIds.has(employee.id) && !conflictIds.has(employee.id)
      && !availabilityWarning(availabilityRowsForShift(availabilityByEmployee.get(employee.id) ?? [], draft.date, start, end), start, end))
      .map((employee) => employee.id));
  const orderedFilteredEmployees = [...filteredEmployees].sort((left, right) =>
    Number(eligibleCandidateIds.has(right.id)) - Number(eligibleCandidateIds.has(left.id))
    || Number(initiallySelectedEmployeeIds.has(right.id)) - Number(initiallySelectedEmployeeIds.has(left.id))
    || left.displayName.localeCompare(right.displayName, "zh-CN"));
  const visibleEmployees = candidateScopeActive && !showAllCandidates
    ? orderedFilteredEmployees.filter((employee) => selectedEmployeeIds.includes(employee.id) || formalCandidateIds.has(employee.id))
    : orderedFilteredEmployees;

  function toggleEmployee(employeeId: string) {
    if (!selectedEmployeeIds.includes(employeeId)) {
      const employeeRows = availabilityFor(employeeId);
      const employee = employees.find((item) => item.id === employeeId);
      if ((!roleId && verifiedJobCatalog) || (formalJobId && !employee?.positions?.some((position) => position.id === formalJobId))
        || conflictIds.has(employeeId) || availabilityWarning(employeeRows, start, end)) return;
    }
    setSelectedEmployeeIds((current) => current.includes(employeeId)
      ? current.filter((id) => id !== employeeId)
      : [...current, employeeId]);
    setError("");
  }

  async function save() {
    if (snapshotUnavailable) return setError(snapshotUnavailableReason ?? "排班数据暂时无法确认。请先刷新日历，再保存班次。");
    if (staleVersion) return setError("班次已被其他人修改或删除。请关闭后核对已刷新的日历。");
    if (!roleId) return setError("请选择班次岗位");
    if (!roles.some((item) => item.id === roleId)) return setError("请选择 Evaluate 当前门店清单中的岗位；旧班次岗位不能继续用于新排班。");
    if (timeStructureError) return setError(timeStructureError);
    if (!(start < end)) return setError("结束时间必须晚于开始时间");
    if ((end.getTime() - start.getTime()) / 60_000 < minimumShiftMinutes) return setError(`班次不能短于 ${minimumShiftMinutes} 分钟`);
    if (breakMinutes * 60_000 >= end.getTime() - start.getTime()) return setError("休息时间必须短于班次时长");
    if (!selectedEmployeeIds.length) return setError("请至少选择一名员工");
    if (unavailableSelectedIds.length) return setError("已选员工不在当前门店可排班名单中。请先移除并重新选择员工。");
    if (selectedFormalMismatch) return setError(`${selectedFormalMismatch.displayName} 未取得${role?.nameZh ?? "当前班次岗位"}的正式岗位授权。请移除或更换员工。`);
    const unavailableEmployee = employees.find((employee) => selectedEmployeeIds.includes(employee.id) && availabilityWarning(availabilityFor(employee.id), start, end));
    if (unavailableEmployee) return setError(schedulingFeedback({ code: "EMPLOYEE_UNAVAILABLE", severity: "BLOCKING_ERROR", employeeId: unavailableEmployee.id, employeeName: unavailableEmployee.displayName, start: start.toISOString(), end: end.toISOString(), message: "" }, "员工不可用", timezone));
    const conflictingEmployee = selectedConflict;
    if (conflictingEmployee) {
      const conflict = conflictingShiftFor(conflictingEmployee.id);
      return setError(schedulingFeedback({ code: "SHIFT_OVERLAP", severity: "BLOCKING_ERROR", employeeId: conflictingEmployee.id, employeeName: conflictingEmployee.displayName, start: conflict?.startAt, end: conflict?.endAt, message: "" }, "班次重叠", timezone));
    }
    setError("");
    await onSave({ date: draft.date, startAt: start.toISOString(), endAt: end.toISOString(), breakMinutes, shiftRoleId: roleId, employeeIds: selectedEmployeeIds, publicNote, internalNote });
  }

  return (
    <Dialog titleId="shift-dialog-title" onClose={requestClose} closeDisabled={saving} className="shift-dialog-panel relative rounded-[20px] bg-white shadow-lift">
      <div className="shift-dialog-body" inert={confirmingExit} aria-hidden={confirmingExit}>
      <header className="z-10 flex shrink-0 items-center justify-between border-b border-graphite-200 bg-white px-5 py-3 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h2 id="shift-dialog-title" className="text-xl font-semibold text-graphite-950">{existingShift ? "编辑班次" : copySourceShift ? "复制班次" : "新增班次"}</h2><p className="text-sm font-semibold text-brand-700">{title}</p></div>
        <button type="button" onClick={requestClose} disabled={saving} className="grid h-11 w-11 place-items-center rounded-xl bg-graphite-100 text-graphite-700 hover:bg-graphite-200" aria-label={`关闭${existingShift ? "编辑" : "新增"}班次`}><X className="h-4 w-4" /></button>
      </header>

      <div className="shift-dialog-main grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(320px,.66fr)_minmax(0,1.34fr)]">
        <section className="shift-dialog-settings min-w-0">
          <h3 className="text-sm font-semibold text-graphite-950">班次设置</h3>
          {copySourceShift ? <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-graphite-700">复制到日期</span><input className="native-input" type="date" value={draft.date} onInput={(event) => { setError(""); onCopyDateChange?.(event.currentTarget.value); }} onChange={(event) => { setError(""); onCopyDateChange?.(event.target.value); }} /></label> : null}
          {templates.length ? <label className="mt-3 block"><span className="mb-1.5 block text-sm font-semibold text-graphite-700">套用预设班次</span><select className="native-input" defaultValue="" onChange={(event) => {
            const template = templates.find((item) => item.id === event.currentTarget.value);
            event.currentTarget.value = "";
            if (!template) return;
            setError("");
            setStartTime(template.startTime);
            setEndTime(template.endTime);
            setEndNextDay(template.endTime < template.startTime);
            setStartOccurrence({ date: draft.date, time: template.startTime, index: 0 });
            setEndOccurrence({ date: template.endTime < template.startTime ? addCalendarDays(draft.date, 1) : draft.date, time: template.endTime, index: 0 });
            setBreakMinutes(template.breakMinutes);
            if (template.shiftRoleId) setRoleId(template.shiftRoleId);
          }}><option value="">选择预设班次</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.startTime}-{template.endTime}{template.endTime < template.startTime ? "（次日）" : ""}</option>)}</select></label> : null}
          <div className="mt-4">
            <RoleChipSelector roles={roles} value={roleId} onChange={(nextRoleId) => { setRoleId(nextRoleId); setShowAllCandidates(false); setError(""); }} />
            {unverifiedSelectedRole ? <p className="mt-2 text-sm text-amber-800" role="status">此班次使用的旧岗位已不在 Evaluate 正式清单中。请先选择当前岗位再保存。</p> : null}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <AppSelect label="休息" value={String(breakMinutes)} onValueChange={(value) => setBreakMinutes(Number(value))} options={breakMinuteOptions(breakMinutes).map((value) => ({ value: String(value), label: value ? `${value} 分钟` : "不休息" }))} />
            <TimeField label="开始时间" value={startTime} stepMinutes={slotIntervalMinutes} onChange={(value) => { setStartTime(value); setStartOccurrence({ date: draft.date, time: value, index: 0 }); setError(""); }} />
            <TimeField label="结束时间" value={endTime} stepMinutes={slotIntervalMinutes} onChange={(value) => { setEndTime(value); setEndOccurrence({ date: endNextDay ? addCalendarDays(draft.date, 1) : draft.date, time: value, index: 0 }); setError(""); }} />
          </div>
          {startCandidates.length > 1 ? <div className="mt-3"><AppSelect label="开始时间出现两次" value={String(startIndex)} onValueChange={(value) => { setStartOccurrence({ date: draft.date, time: startTime, index: Number(value) }); setError(""); }} options={occurrenceOptions(startCandidates, startTime, timezone)} /></div> : null}
          {endCandidates.length > 1 ? <div className="mt-3"><AppSelect label="结束时间出现两次" value={String(endIndex)} onValueChange={(value) => { setEndOccurrence({ date: endNextDay ? addCalendarDays(draft.date, 1) : draft.date, time: endTime, index: Number(value) }); setError(""); }} options={occurrenceOptions(endCandidates, endTime, timezone)} /></div> : null}
          <label className="mt-3 flex items-center gap-2 text-sm font-medium text-graphite-700"><input type="checkbox" checked={endNextDay} onChange={(event) => { setEndNextDay(event.target.checked); setEndOccurrence({ date: event.target.checked ? addCalendarDays(draft.date, 1) : draft.date, time: endTime, index: 0 }); }} />次日结束</label>
          <div className="mt-4 rounded-2xl bg-graphite-50 p-4">
            {validTimeRange && start < end ? <p className="text-sm font-semibold text-graphite-950" role="status">实际经过 {formatElapsedDuration((end.getTime() - start.getTime()) / 60_000)} · {formatShiftTimeRange(start.toISOString(), end.toISOString(), timezone)}</p> : null}
            {offsetChanged ? <p className="mt-2 text-xs font-medium text-amber-800">跨越夏令时切换，网格的墙上时间与实际时长可能不同。请核对首次／第二次时间。</p> : null}
            <p className="flex items-center gap-2 text-sm font-semibold text-graphite-950"><CalendarDays className="h-4 w-4 text-brand-700" />{startTime || "--:--"} - {endTime || "--:--"}{endNextDay ? "（次日）" : ""} · {timezone}</p>
            <p className="mt-2 flex items-center gap-2 text-xs text-graphite-600"><Clock3 className="h-3.5 w-3.5" />{saveLabel === "保存班次" ? "保存后才会写入排班" : "暂存后仍需统一提交才会写入排班"}</p>
            {timeStructureError ? <p className="mt-2 text-sm font-medium text-red-800" role="alert">{timeStructureError}</p> : null}
          </div>
          <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-graphite-700">公开备注</span><textarea className="native-input min-h-20 py-3" value={publicNote} onChange={(event) => setPublicNote(event.target.value)} maxLength={500} /></label>
          <label className="mt-4 block"><span className="mb-1.5 block text-sm font-semibold text-graphite-700">内部备注</span><textarea className="native-input min-h-20 py-3" value={internalNote} onChange={(event) => setInternalNote(event.target.value)} maxLength={1000} /></label>
        </section>

        <section className="shift-dialog-picker min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 className="flex items-center gap-2 text-sm font-semibold text-graphite-950"><UsersRound className="h-4 w-4 text-brand-700" />选择员工 <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{selectedEmployeeIds.length}</span></h3><p className="mt-1 text-xs text-graphite-600">{role ? `按「${role.nameZh}」岗位排班，优先显示当前时段可排员工。` : "先在左侧选择班次岗位。"}评分来自 Evaluate Molly；保存时再次核验。</p></div>
            {workforceGeneratedAt ? <p className="text-xs text-graphite-500">更新于 {new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date(workforceGeneratedAt))}</p> : null}
          </div>
          {showPickerControls ? <><div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem]">
            <label className="relative"><span className="sr-only">搜索员工</span><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-graphite-500" /><input className="native-input pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setVisibleCount(60); }} placeholder="搜索员工姓名" /></label>
            <AppSelect value={employeeType} onValueChange={setEmployeeType} options={[{ value: "ALL", label: "全部类型" }, { value: "REGULAR", label: "正式员工" }, { value: "TRAINING", label: "培训员工" }]} />
            <AppSelect value={tier} onValueChange={setTier} options={[{ value: "ALL", label: "全部 Tier" }, ...[1, 2, 3, 4, 5].map((value) => ({ value: `T${value}`, label: `T${value}` }))]} />
          </div>

          <details className="mt-3 rounded-xl border border-graphite-200 bg-graphite-50 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-graphite-700">更多员工筛选{formalPositionId !== "ALL" || staffRoleIds.length ? " · 已启用" : ""}</summary>
            <div className="mt-3"><AppSelect label="筛选正式岗位" value={formalPositionId} onValueChange={(value) => { setFormalPositionId(value); setVisibleCount(60); }} options={formalPositionOptions} /></div>
            <div className="mt-3"><StaffRoleFilter roles={roles} values={staffRoleIds} onChange={(roleIds) => { setStaffRoleIds(roleIds); setVisibleCount(60); }} /></div>
          </details></> : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-graphite-600" aria-live="polite">
            <span>{candidateScopeActive && !showAllCandidates ? `当前岗位 ${formalCandidateIds.size} · 可排 ${eligibleCandidateIds.size} / 筛选 ${filteredEmployees.length} 人` : `显示 ${filteredEmployees.length} / ${employees.length} 人`}</span>
            {candidateScopeActive ? <button type="button" className="calendar-text-button" aria-pressed={showAllCandidates} onClick={() => setShowAllCandidates((value) => !value)}>{showAllCandidates ? "只看当前岗位" : "显示全部员工"}</button> : null}
            {hiddenSelectedCount ? <span className="font-semibold text-amber-800">另有 {hiddenSelectedCount} 名已选员工被当前筛选隐藏</span> : null}
          </div>

          {unavailableSelectedIds.length ? <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
            <p className="font-semibold">以下原分配员工已不在当前门店可排班名单中。请移除并选择当前员工后保存。</p>
            <div className="mt-2 flex flex-wrap gap-2">{unavailableSelectedIds.map((employeeId) => <button key={employeeId} type="button" className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-amber-100" onClick={() => { setSelectedEmployeeIds((current) => current.filter((id) => id !== employeeId)); setError(""); }}>
              移除 {sourceShift?.assignments.find((assignment) => assignment.employeeId === employeeId)?.employeeNameSnapshot ?? employeeId}
            </button>)}</div>
          </div> : null}

          <div className="shift-dialog-staff-list mt-2" aria-label="员工列表">
            {visibleEmployees.slice(0, visibleCount).map((employee) => {
              const selected = selectedEmployeeIds.includes(employee.id);
              const conflict = conflictIds.has(employee.id);
              const hasFormalPosition = Boolean(role?.formalJobId && employee.positions?.some((position) => position.id === role.formalJobId));
              const employeeAvailabilityWarning = availabilityWarning(availabilityFor(employee.id), start, end);
              const employeeRoles = roles.filter((candidateRole) => candidateRole.formalJobId
                && employee.positions?.some((position) => position.id === candidateRole.formalJobId))
                .sort((left, right) => Number(right.id === roleId) - Number(left.id === roleId));
              const available = eligibleCandidateIds.has(employee.id);
              const unavailableReason = !roleId ? "请先选择岗位"
                : formalJobId && !hasFormalPosition ? "当前班次正式岗位资格未确认"
                  : conflict ? "时间冲突" : employeeAvailabilityWarning ?? "岗位资格待核对";
              return (
                <button key={employee.id} type="button" onClick={() => toggleEmployee(employee.id)} disabled={!selected && (conflict || Boolean(employeeAvailabilityWarning) || (!roleId && verifiedJobCatalog) || (Boolean(formalJobId) && !hasFormalPosition))} aria-pressed={selected} aria-label={`${employee.displayName}，${employeeRoles.map((employeeRole) => employeeRole.nameZh).join("、") || "岗位未确认"}，${employee.officialScore ? `${employee.officialScore.tier} ${employee.officialScore.score.toFixed(1)} 分` : "暂无正式评分"}，${available ? "可排" : `不可排：${unavailableReason}`}`} data-availability={available ? "available" : "unavailable"} style={role ? roleColorStyle(role) : undefined} className={`shift-staff-card${available ? " shift-staff-card--role" : ""}${selected ? " shift-staff-card--selected" : ""}`}>
                  <span className="shift-staff-card-top">
                    <strong className="shift-staff-card-name">{employee.displayName}</strong>
                    <span className="shift-staff-card-check" aria-hidden="true"><Check className="h-3.5 w-3.5" /></span>
                  </span>
                  <span className="shift-staff-card-roles">
                    {employeeRoles.length ? employeeRoles.map((employeeRole) => <span key={employeeRole.id} className={`shift-staff-card-role${employeeRole.id === roleId ? " shift-staff-card-role--current" : ""}`} style={roleColorStyle(employeeRole)}>{employeeRole.nameZh}</span>)
                      : <span className="shift-staff-card-role">{employee.positions?.length ? "无当前岗位" : "岗位未确认"}</span>}
                  </span>
                  <span className="shift-staff-card-bottom">
                    <span className="shift-staff-card-score">{employee.officialScore ? `${employee.officialScore.tier} · ${employee.officialScore.score.toFixed(1)}` : "暂无正式评分"}</span>
                    {!available ? <span className="shift-staff-card-unavailable">不可排</span> : null}
                  </span>
                </button>
              );
            })}
            {!visibleEmployees.length ? <div className="rounded-2xl border border-dashed border-graphite-300 p-8 text-center text-sm text-graphite-600">{!roleId && !showAllCandidates ? "请先选择班次岗位，再核对当前可排员工。" : candidateScopeActive && !showAllCandidates ? "当前筛选中没有取得该正式岗位授权的员工。可显示全部员工核对原因。" : "没有符合筛选条件的员工"}</div> : null}
          </div>
          {visibleEmployees.length > visibleCount ? <button type="button" className="mt-3 min-h-11 w-full rounded-xl border border-graphite-200 text-sm font-semibold text-graphite-700 hover:bg-graphite-50" onClick={() => setVisibleCount((count) => count + 60)}>加载更多（剩余 {visibleEmployees.length - visibleCount}）</button> : null}
        </section>
      </div>

      {staleVersion ? <p className="mx-5 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="alert">班次已被其他人修改或删除。你的输入尚未保存；请关闭窗口后核对已刷新的日历。</p> : null}
      {snapshotUnavailable ? <div className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900" role="alert"><span>{snapshotUnavailableReason ?? "排班数据暂时无法确认。你的输入仍保留；请刷新日历后再保存。"}</span>{onRetryContext ? <button type="button" className="calendar-text-button" onClick={onRetryContext}>重试员工与可用时间</button> : null}</div> : null}
      {error ? <p className="mx-5 mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert"><CircleAlert className="h-4 w-4" />{error}</p> : null}
      {selectedConflict ? <p className="mx-5 mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert">{selectedConflict.displayName} 在该时间已有班次，请调整时间或移除该员工。</p> : null}
      {selectedFormalMismatch ? <p className="mx-5 mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert">{selectedFormalMismatch.displayName} 未取得{role?.nameZh ?? "当前班次岗位"}的正式岗位授权。请移除或更换员工。</p> : null}
      <footer className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-graphite-200 bg-white px-5 py-4 sm:px-6">
        {existingShift && (onCopy || onRepeat) ? <details ref={secondaryActionsRef} className="calendar-more-actions calendar-more-actions--footer mr-auto">
          <summary className="calendar-text-button" role="button" tabIndex={0} aria-label="其他班次操作" aria-disabled={saving} onClick={(event) => { if (saving) event.preventDefault(); }}>其他操作</summary>
          <div className="calendar-more-actions-panel" aria-label="其他班次操作">
            {onCopy ? <button type="button" disabled={saving} onClick={() => { secondaryActionsRef.current?.removeAttribute("open"); requestSwitch("copy"); }}>复制班次</button> : null}
            {onRepeat ? <button type="button" disabled={saving} onClick={() => { secondaryActionsRef.current?.removeAttribute("open"); requestSwitch("repeat"); }}>重复班次</button> : null}
          </div>
        </details> : null}
        {existingShift && onDelete ? <div className="mr-auto flex items-center gap-2">{confirmingDelete ? <><span className="text-sm font-semibold text-red-800">确认删除？</span><button type="button" onClick={() => void onDelete()} disabled={saving || staleVersion} className="min-h-11 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">确认删除</button><button type="button" onClick={() => setConfirmingDelete(false)} disabled={saving} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-graphite-700">返回</button></> : <button type="button" onClick={() => setConfirmingDelete(true)} disabled={saving || staleVersion} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-red-700 hover:bg-red-50">删除班次</button>}</div> : null}
        <button type="button" onClick={requestClose} disabled={saving} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-graphite-700 hover:bg-graphite-100">取消</button><button type="button" onClick={() => void save()} disabled={saving || staleVersion || snapshotUnavailable || Boolean(timeStructureError) || Boolean(selectedConflict) || Boolean(selectedFormalMismatch) || unverifiedSelectedRole || !roles.length || !employees.length} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-graphite-950 px-5 text-sm font-semibold text-white hover:bg-graphite-800 disabled:opacity-60">{saving ? <InlineSpinner /> : null}{saving ? "正在保存" : `${saveLabel}${selectedEmployeeIds.length ? `（${selectedEmployeeIds.length}人）` : ""}`}</button>
      </footer>
      </div>
      {confirmingExit ? <div className="absolute inset-0 z-30 flex items-center justify-center bg-graphite-950/45 p-4">
        <section role="alertdialog" aria-labelledby="shift-exit-title" aria-describedby="shift-exit-description" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-lift">
          <h2 id="shift-exit-title" className="text-lg font-semibold text-graphite-950">{exitAction === "close" ? "放弃未保存的修改？" : exitAction === "copy" ? "放弃当前修改并复制班次？" : "放弃当前修改并重复班次？"}</h2>
          <p id="shift-exit-description" className="mt-2 text-sm text-graphite-700">{exitAction === "close" ? "退出后，本次编辑内容将丢失。班次不会因此改变。" : "将使用已保存的班次内容；本次未保存的修改不会带入。"}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button autoFocus type="button" className="calendar-text-button" onClick={() => setConfirmingExit(false)}>继续编辑</button>
            <button type="button" className="calendar-primary-button" onClick={confirmExit}>{exitAction === "close" ? "放弃修改" : exitAction === "copy" ? "放弃修改并复制" : "放弃修改并重复"}</button>
          </div>
        </section>
      </div> : null}
    </Dialog>
  );
}

function TimeField({ label, value, stepMinutes, onChange }: { label: string; value: string; stepMinutes: number; onChange: (value: string) => void }) {
  return <label><span className="mb-1.5 block text-sm font-semibold text-graphite-700">{label}</span><input className="native-input" type="time" step={stepMinutes * 60} value={value} onInput={(event) => onChange(event.currentTarget.value)} onChange={(event) => onChange(event.target.value)} /></label>;
}
