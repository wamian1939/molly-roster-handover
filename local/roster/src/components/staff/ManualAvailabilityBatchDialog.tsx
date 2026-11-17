import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { calendarMonthDates } from "../../lib/scheduledShiftSummary";
import { manualAvailabilityBatchEntries } from "../../lib/manualAvailabilityBatch";
import { rosterRepository } from "../../services/rosterRepository";
import type { EmployeeAvailability } from "../../types/roster";
import { Dialog } from "../ui/Dialog";
import { InlineSpinner } from "../ui/ToastProvider";

function offsetMonth(month: string, amount: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + amount, 1)).toISOString().slice(0, 7);
}

export function ManualAvailabilityBatchDialog({ storeId, employeeId, employeeName, initialDate, timezone, weekStartsOn, workforceReady, onClose, onCommitted }: {
  storeId: string;
  employeeId: string;
  employeeName: string;
  initialDate: string;
  timezone: string;
  weekStartsOn: number;
  workforceReady: boolean;
  onClose: () => void;
  onCommitted: (count: number) => void;
}) {
  const [month, setMonth] = useState(() => initialDate.slice(0, 7));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("22:00");
  const [loaded, setLoaded] = useState<{ month: string; recorded: Set<string> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [needsReview, setNeedsReview] = useState(false);
  const [retry, setRetry] = useState(0);
  const selectedForRetry = useRef<string[]>([]);
  const [error, setError] = useState("");
  const dates = useMemo(() => calendarMonthDates(`${month}-01`, weekStartsOn), [month, weekStartsOn]);
  const monthReady = !loading && loaded?.month === month;
  const chosenDates = useMemo(() => [...selected].sort(), [selected]);
  const prepared = useMemo(() => {
    if (!chosenDates.length) return { entries: [], error: "" };
    try { return { entries: manualAvailabilityBatchEntries(chosenDates, startTime, endTime, false, timezone), error: "" }; }
    catch (cause) { return { entries: [], error: cause instanceof Error ? cause.message : "时间无效" }; }
  }, [chosenDates, startTime, endTime, timezone]);
  const knownRecordedSelection = chosenDates.some((date) => loaded?.recorded.has(date));

  useEffect(() => {
    let active = true;
    const visible = new Set(dates);
    const extraByMonth = new Map<string, string[]>();
    const reviewDates = selectedForRetry.current;
    for (const date of reviewDates) {
      if (visible.has(date)) continue;
      const key = date.slice(0, 7);
      extraByMonth.set(key, [...(extraByMonth.get(key) ?? []), date]);
    }
    const extraDates = [...extraByMonth.values()].flat();
    // Data fetching is the external synchronization owned by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError("");
    Promise.all([
      rosterRepository.availability(storeId, dates[0]!, dates[dates.length - 1]!, employeeId),
      ...[...extraByMonth.values()].map((group) => {
        const sorted = [...group].sort();
        return rosterRepository.availability(storeId, sorted[0]!, sorted[sorted.length - 1]!, employeeId);
      }),
    ]).then((groups: EmployeeAvailability[][]) => {
        if (active) {
          const checked = new Set([...dates, ...extraDates]);
          const recordedNow = groups.flat().map((row) => row.date);
          setLoaded((current) => ({ month, recorded: new Set([
            ...(current ? [...current.recorded].filter((date) => !checked.has(date)) : []), ...recordedNow,
          ]) }));
          if (reviewDates.length) {
            selectedForRetry.current = [];
            setNeedsReview(false);
          }
        }
      })
      .catch((cause) => { if (active) { setLoaded(null); setError(cause instanceof Error ? cause.message : "可用时间加载失败"); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storeId, employeeId, month, dates, retry]);

  function toggleDate(date: string) {
    if (!monthReady || (!selected.has(date) && loaded!.recorded.has(date))) return;
    setError("");
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else if (next.size < 31) next.add(date);
      return next;
    });
  }

  async function save() {
    if (busy || needsReview || !monthReady || !workforceReady || !chosenDates.length || prepared.error || knownRecordedSelection) return;
    setBusy(true); setError("");
    try {
      await rosterRepository.replaceAvailability({ storeId, employeeId, dates: chosenDates, expectedRows: [], entries: prepared.entries });
      onCommitted(chosenDates.length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败，请核对后重试");
      setNeedsReview(true);
    } finally { setBusy(false); }
  }

  return <Dialog titleId="manual-batch-title" onClose={onClose} closeDisabled={busy}
    className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[20px] bg-white p-5 shadow-lift sm:p-6">
    <header className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Staff · Availability</p>
        <h2 id="manual-batch-title" className="mt-1 text-xl font-semibold text-graphite-950">手动录入多日期 · {employeeName}</h2></div>
      <button type="button" className="calendar-icon-button" aria-label="关闭手动录入" disabled={busy} onClick={onClose}><X className="h-4 w-4" /></button>
    </header>
    <p className="mt-3 text-sm text-graphite-600">选择最多 31 天，共用一组可用时间。已有记录不可直接覆盖；需要修改时使用下方逐日编辑。</p>
    <div className="mt-5 flex items-center justify-between gap-3">
      <button type="button" className="calendar-icon-button" aria-label="上一个月" disabled={busy} onClick={() => setMonth((value) => offsetMonth(value, -1))}><ChevronLeft className="h-4 w-4" /></button>
      <strong className="text-sm tabular-nums text-graphite-950">{month}</strong>
      <button type="button" className="calendar-icon-button" aria-label="下一个月" disabled={busy} onClick={() => setMonth((value) => offsetMonth(value, 1))}><ChevronRight className="h-4 w-4" /></button>
    </div>
    <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-semibold text-graphite-600" aria-hidden="true">
      {Array.from({ length: 7 }, (_, index) => <span key={index}>{["日", "一", "二", "三", "四", "五", "六"][(weekStartsOn + index) % 7]}</span>)}
    </div>
    <div className="mt-1 grid grid-cols-7 gap-1" aria-label="手动录入日期">
      {dates.map((date) => {
        const recorded = loaded?.month === month && loaded.recorded.has(date);
        const chosen = selected.has(date);
        return <button key={date} type="button" aria-label={date} aria-pressed={chosen}
          title={recorded ? "已有可用时间记录，请用逐日编辑" : date}
          disabled={busy || !monthReady || (recorded && !chosen) || (!chosen && selected.size >= 31)}
          className={`min-h-10 rounded-lg border text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-brand-600 ${chosen ? "border-brand-700 bg-brand-700 font-semibold text-white" : recorded ? "border-graphite-200 bg-graphite-100 text-graphite-400" : "border-graphite-200 bg-white text-graphite-800 hover:border-brand-500"} ${date.slice(0, 7) !== month ? "opacity-60" : ""}`}
          onClick={() => toggleDate(date)}>{Number(date.slice(-2))}</button>;
      })}
    </div>
    {loading ? <p className="mt-3 text-sm text-graphite-600" role="status">正在核对已记录日期…</p> : null}
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-graphite-700">开始时间<input className="native-input mt-1" type="time" value={startTime} disabled={busy} onChange={(event) => setStartTime(event.target.value)} /></label>
      <label className="text-sm font-semibold text-graphite-700">结束时间<input className="native-input mt-1" type="time" value={endTime} disabled={busy} onChange={(event) => setEndTime(event.target.value)} /></label>
    </div>
    <p className="mt-4 rounded-xl bg-graphite-50 p-3 text-sm text-graphite-700" role="status">
      已选 {chosenDates.length} 天{chosenDates.length ? `：${chosenDates.join("、")}` : "。请在日历中选择日期。"}
      {chosenDates.length && !prepared.error ? ` · ${startTime}–${endTime}` : ""}
    </p>
    {prepared.error || knownRecordedSelection || error || !workforceReady ? <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800" role="alert">
      {prepared.error || (knownRecordedSelection ? "所选日期已有记录，请取消该日期并使用逐日编辑" : error || "员工资料暂时无法确认，请稍后重试")}
    </p> : null}
    {(needsReview || (!loading && !loaded)) ? <button type="button" className="calendar-text-button mt-3" disabled={busy} onClick={() => { selectedForRetry.current = chosenDates; setRetry((current) => current + 1); }}>重新核对日期</button> : null}
    <footer className="mt-5 flex justify-end gap-2 border-t border-graphite-200 pt-4">
      <button type="button" className="calendar-text-button" disabled={busy} onClick={onClose}>取消</button>
      <button type="button" className="calendar-primary-button" disabled={busy || needsReview || !monthReady || !workforceReady || !chosenDates.length || Boolean(prepared.error) || knownRecordedSelection}
        onClick={() => void save()}>{busy ? <InlineSpinner /> : null}保存 {chosenDates.length} 天可用时间</button>
    </footer>
  </Dialog>;
}
