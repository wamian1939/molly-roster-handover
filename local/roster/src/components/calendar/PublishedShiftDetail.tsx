import { X } from "lucide-react";
import { formatShiftTimeRange } from "../../lib/dateTime";
import type { Shift } from "../../types/roster";
import { Dialog } from "../ui/Dialog";

export function PublishedShiftDetail({ shift, timezone, onClose, onCopy }: { shift: Shift; timezone: string; onClose: () => void; onCopy?: () => void }) {
  return <Dialog titleId="published-shift-title" onClose={onClose} className="w-full max-w-lg rounded-[20px] bg-white shadow-lift">
    <header className="flex items-start justify-between border-b border-graphite-200 px-5 py-5 sm:px-6">
      <div>
        <p className="text-sm font-semibold text-brand-700">{shift.date} · 已发布</p>
        <h2 id="published-shift-title" className="mt-1 text-xl font-semibold text-graphite-950">班次详情</h2>
        <p className="mt-1 text-sm text-graphite-600">此班次已发布。如需修改，请先重新打开对应排班周期。</p>
      </div>
      <button type="button" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-graphite-100 text-graphite-700 hover:bg-graphite-200" aria-label="关闭班次详情"><X className="h-4 w-4" /></button>
    </header>
    <dl className="grid gap-4 p-5 text-sm sm:grid-cols-2 sm:p-6">
      <div><dt className="font-semibold text-graphite-500">岗位</dt><dd className="mt-1 text-graphite-950">{shift.roleNameSnapshot}</dd></div>
      <div><dt className="font-semibold text-graphite-500">时间</dt><dd className="mt-1 tabular-nums text-graphite-950">{formatShiftTimeRange(shift.startAt, shift.endAt, timezone)}</dd></div>
      <div><dt className="font-semibold text-graphite-500">休息</dt><dd className="mt-1 text-graphite-950">{shift.breakMinutes} 分钟</dd></div>
      <div><dt className="font-semibold text-graphite-500">员工</dt><dd className="mt-1 text-graphite-950">{shift.assignments.map((assignment) => assignment.employeeNameSnapshot).join(" / ") || "未分配"}</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold text-graphite-500">公开备注</dt><dd className="mt-1 whitespace-pre-wrap text-graphite-950">{shift.publicNote || "无"}</dd></div>
      <div className="sm:col-span-2"><dt className="font-semibold text-graphite-500">内部备注</dt><dd className="mt-1 whitespace-pre-wrap text-graphite-950">{shift.internalNote || "无"}</dd></div>
    </dl>
    <footer className="flex justify-end gap-2 border-t border-graphite-200 px-5 py-4 sm:px-6">
      {onCopy ? <button type="button" onClick={onCopy} className="calendar-text-button">复制班次</button> : null}
      <button type="button" onClick={onClose} className="calendar-primary-button">关闭</button>
    </footer>
  </Dialog>;
}
