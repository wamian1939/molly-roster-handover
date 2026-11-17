import { useRef, useState } from "react";
import { addCalendarDays } from "../../lib/storeTime";
import { repeatTargetDates } from "../../lib/repeatDates";
import type { RepeatPreview } from "../../services/rosterRepository";
import type { Shift } from "../../types/roster";
import { Dialog } from "../ui/Dialog";

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function RepeatShiftDialog({ source, saving, onClose, onPreview, onConfirm }: {
  source: Shift;
  saving: boolean;
  onClose: () => void;
  onPreview: (dates: string[]) => Promise<RepeatPreview>;
  onConfirm: (preview: RepeatPreview) => Promise<boolean>;
}) {
  const sourceWeekday = new Date(`${source.date}T12:00:00Z`).getUTCDay();
  const [weekdays, setWeekdays] = useState([sourceWeekday]);
  const [untilDate, setUntilDate] = useState(addCalendarDays(source.date, 28));
  const [preview, setPreview] = useState<RepeatPreview | null>(null);
  const [error, setError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const previewSequence = useRef(0);

  function invalidatePreview() {
    previewSequence.current += 1;
    setPreview(null);
    setError("");
  }

  async function check() {
    if (saving || previewing) return;
    const requestSequence = ++previewSequence.current;
    setPreviewing(true);
    setPreview(null);
    setError("");
    try {
      const dates = repeatTargetDates(source.date, untilDate, weekdays);
      const result = await onPreview(dates);
      if (requestSequence === previewSequence.current) setPreview(result);
    } catch (cause) {
      if (requestSequence === previewSequence.current) setError(cause instanceof Error ? cause.message : "无法检查重复班次");
    } finally { setPreviewing(false); }
  }

  async function commit() {
    if (!preview || saving || previewing) return;
    try {
      if (await onConfirm(preview)) return;
    } catch { /* The caller reports the mutation failure. */ }
    invalidatePreview();
    setError("生成未完成，请重新检查冲突。");
  }

  return <Dialog titleId="repeat-shift-title" onClose={onClose} closeDisabled={saving || previewing} className="w-full max-w-lg rounded-[20px] bg-white p-6 shadow-lift">
    <h2 id="repeat-shift-title" className="text-xl font-semibold text-graphite-950">重复班次</h2>
    <p className="mt-2 text-sm text-graphite-600">从 {source.date} 的班次生成草稿。保留岗位、员工、时间、休息和备注；任一目标冲突时整批取消。</p>
    <fieldset className="mt-4"><legend className="text-sm font-semibold text-graphite-700">每周重复的日期</legend><div className="mt-2 flex flex-wrap gap-2">{weekdayLabels.map((label, day) => (
      <label key={day} className="flex min-h-10 items-center gap-2 rounded-xl border border-graphite-200 px-3 text-sm text-graphite-700"><input type="checkbox" checked={weekdays.includes(day)} onChange={(event) => { setWeekdays((current) => event.target.checked ? [...current, day] : current.filter((value) => value !== day)); invalidatePreview(); }} />{label}</label>
    ))}</div></fieldset>
    <label className="mt-4 block text-sm font-semibold text-graphite-700">重复至<input className="native-input mt-1.5" type="date" value={untilDate} min={addCalendarDays(source.date, 1)} onInput={(event) => { setUntilDate(event.currentTarget.value); invalidatePreview(); }} onChange={(event) => { setUntilDate(event.target.value); invalidatePreview(); }} /></label>
    {error ? <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p> : null}
    {preview ? <div className="mt-4">
      <p className="text-sm font-semibold text-graphite-950">可创建 {preview.readyShifts}/{preview.shiftCount} 个班次 · 有效分配 {preview.availableAssignments} · 阻止 {preview.blockedAssignments}</p>
      {preview.issues.length ? <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{preview.issues.map((issue, index) => <p key={`${issue.shiftDate}-${issue.employeeId ?? "scope"}-${index}`}>{issue.shiftDate} {issue.employeeName}：{issue.reason}</p>)}</div> : <p className="mt-2 text-sm font-semibold text-emerald-700">全部目标日期可用</p>}
    </div> : null}
    <div className="mt-5 flex justify-end gap-2"><button type="button" className="calendar-text-button" disabled={saving || previewing} onClick={onClose}>取消</button><button type="button" className="calendar-text-button" disabled={saving || previewing} onClick={() => void check()}>{previewing ? "检查中…" : "检查冲突"}</button><button type="button" className="calendar-primary-button" disabled={saving || previewing || !preview?.canCopy} onClick={() => void commit()}>{saving ? "生成中…" : "生成草稿"}</button></div>
  </Dialog>;
}
