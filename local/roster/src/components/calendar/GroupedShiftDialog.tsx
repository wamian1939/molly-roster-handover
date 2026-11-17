import { Check, UsersRound, X } from "lucide-react";
import { formatBreakHours, type CalendarAssignmentNameResolver, type CalendarShiftGroup } from "../../lib/calendarGrouping";
import { formatTime } from "../../lib/dateTime";
import type { Shift } from "../../types/roster";
import { Dialog } from "../ui/Dialog";

export function GroupedShiftDialog({ group, timezone, resolveAssignmentName, readOnly = false, actionLabel, onClose, onChoose }: { group: CalendarShiftGroup; timezone?: string; resolveAssignmentName?: CalendarAssignmentNameResolver; readOnly?: boolean; actionLabel?: string; onClose: () => void; onChoose: (shift: Shift) => void }) {
  const action = actionLabel ?? (readOnly ? "查看" : "编辑");
  return (
    <Dialog titleId="grouped-shift-title" onClose={onClose} className="w-full max-w-lg rounded-[20px] bg-white shadow-lift">
      <header className="flex items-start justify-between border-b border-graphite-200 px-5 py-5 sm:px-6">
        <div>
          <p className="text-sm font-semibold text-brand-700">{group.date} · {formatTime(group.startAt, timezone)} ~ {formatTime(group.endAt, timezone)}</p>
          <h2 id="grouped-shift-title" className="mt-1 text-xl font-semibold text-graphite-950">选择要{action}的班次</h2>
          <p className="mt-1 text-sm text-graphite-600">{group.role.name} · {group.mixedBreakMinutes ? "休息时长不同" : `Break: ${formatBreakHours(group.breakMinutes)}`}</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-graphite-100 text-graphite-700 hover:bg-graphite-200" aria-label="关闭班次选择"><X className="h-4 w-4" /></button>
      </header>
      <div className="space-y-2 p-5 sm:p-6">
        <p className="flex items-center gap-2 text-xs font-semibold text-graphite-500"><UsersRound className="h-4 w-4" />日历已按相同岗位和时间合并显示；请选择一条真实班次继续{action}。</p>
        {group.sourceShifts.map((shift) => (
          <button key={shift.id} type="button" onClick={() => onChoose(shift)} className="group flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-graphite-200 bg-white px-4 py-3 text-left transition hover:border-brand-500 hover:bg-brand-50 focus-visible:border-brand-600">
            <span className="min-w-0">
              <strong className="block text-sm text-graphite-950">{shift.assignments.map((assignment) => resolveAssignmentName?.(shift, assignment)?.trim() || assignment.employeeNameSnapshot).join(" / ") || "暂未分配员工"}</strong>
              <span className="mt-1 block text-xs text-graphite-500">{shift.roleNameSnapshot} · 休息 {shift.breakMinutes} 分钟 · {shift.assignments.length} 人</span>
            </span>
            <Check className="h-4 w-4 shrink-0 text-brand-700 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
          </button>
        ))}
      </div>
    </Dialog>
  );
}
