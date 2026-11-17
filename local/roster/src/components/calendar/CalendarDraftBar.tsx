import { findDraftConflicts, projectCalendarDrafts, type CalendarDraftQueue, type DraftChange } from "../../lib/calendarDraftQueue";
import { formatTime } from "../../lib/dateTime";
import type { Shift, ShiftRole } from "../../types/roster";
import type { RosterEmployee } from "../../types/workforce";

export function CalendarDraftBar({ queue, savedShifts, roles, employees, timezone, busy, uncertain, onRemove, onDiscard, onSubmit, onReconcile }: {
  queue: CalendarDraftQueue;
  savedShifts: Shift[];
  roles: ShiftRole[];
  employees: RosterEmployee[];
  timezone: string;
  busy: boolean;
  uncertain: boolean;
  onRemove: (change: DraftChange) => void;
  onDiscard: () => void;
  onSubmit: () => void;
  onReconcile: () => void;
}) {
  const projected = projectCalendarDrafts(queue, savedShifts);
  const stagedIds = new Set(projected.filter((shift) => shift.staged).map((shift) => shift.id));
  const conflicts = findDraftConflicts(projected).filter((conflict) => stagedIds.has(conflict.firstId) || stagedIds.has(conflict.secondId));
  const roleNames = new Map(roles.map((role) => [role.id, role.nameZh]));
  const employeeNames = new Map(employees.map((employee) => [employee.id, employee.displayName]));
  const currentById = new Map(savedShifts.map((shift) => [shift.id, shift]));
  const label = (change: DraftChange) => change.kind === "create" ? "新增" : change.kind === "update" ? "修改" : "删除";
  const value = (change: DraftChange) => change.kind === "delete" ? currentById.get(change.shiftId) : change.value;

  return <section aria-label="待提交排班" className="mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-panel">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold text-graphite-950">待提交排班 · {queue.changes.length} 项</h2>
        <p className="mt-1 text-sm text-graphite-700">目前只保存在本页，提交前不会写入排班；离开页面会丢失这些暂存修改。</p></div>
      <div className="flex flex-wrap gap-2">
        {uncertain ? <button type="button" className="calendar-primary-button" disabled={busy} onClick={onReconcile}>核对提交结果</button>
          : <button type="button" className="calendar-primary-button" disabled={busy || !queue.changes.length || conflicts.length > 0} onClick={onSubmit}>统一提交</button>}
        <button type="button" className="calendar-text-button" disabled={busy || uncertain} onClick={onDiscard}>{queue.changes.length ? "放弃暂存" : "退出暂存模式"}</button>
      </div>
    </div>
    {uncertain ? <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">提交结果暂不确定。请先核对服务器状态，不要重复提交。</p> : null}
    {conflicts.length ? <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">待提交排班存在 {conflicts.length} 处员工时间重叠，请逐项调整或移除。服务端提交时也会再次检查。</p> : null}
    {queue.changes.length ? <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {queue.changes.map((change) => {
        const shift = value(change);
        const id = change.kind === "create" ? change.clientShiftId : change.shiftId;
        const employeeIds = change.kind === "delete" ? shift && "assignments" in shift ? shift.assignments.map((assignment) => assignment.employeeId) : [] : change.value.employeeIds;
        return <li key={id} className="flex items-start justify-between gap-3 rounded-xl border border-brand-100 bg-white p-3 text-sm">
          <div className="min-w-0"><span className="font-semibold text-brand-700">{label(change)}</span>{shift ? <>
            <span className="ml-2 font-medium text-graphite-950">{shift.date} {formatTime(shift.startAt, timezone)}–{formatTime(shift.endAt, timezone)}</span>
            <p className="mt-1 truncate text-xs text-graphite-600">{roleNames.get(shift.shiftRoleId) ?? "岗位"} · {employeeIds.map((employeeId) => employeeNames.get(employeeId) ?? employeeId).join("、")}</p>
          </> : <span className="ml-2 text-graphite-600">原班次已不在当前快照中</span>}</div>
          <button type="button" className="shrink-0 text-xs font-semibold text-graphite-700 underline disabled:opacity-50" disabled={busy || uncertain} onClick={() => onRemove(change)}>移除</button>
        </li>;
      })}
    </ul> : null}
  </section>;
}
