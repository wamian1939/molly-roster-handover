import { useEffect, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Check, ChevronLeft, ChevronRight, Copy, RefreshCw } from "lucide-react";
import type { AvailabilityDay, CapacityBand, EmployeeAccount, EmployeePortalClient, EmployeeWeek } from "../../services/employeePortalRepository";
import { EmployeePortalError } from "../../services/employeePortalRepository";

const signals = {
  GREEN: { label: "空余充足", className: "employee-signal-green" },
  YELLOW: { label: "即将报满", className: "employee-signal-yellow" },
  RED: { label: "已饱满", className: "employee-signal-red" },
};
const message = (cause: unknown) => cause instanceof Error ? cause.message : "请求失败，请稍后重试";
const localDay = (date: string) => DateTime.fromISO(date).setLocale("zh-CN");

export function EmployeeWeekForm({ account, api, onDirtyChange, onBusyChange }: { account: EmployeeAccount; api: EmployeePortalClient; onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void }) {
  const [week, setWeek] = useState(() => DateTime.now().setZone("Australia/Sydney").plus({ weeks: 1 }).startOf("week").toISODate()!);
  const [snapshot, setSnapshot] = useState<EmployeeWeek | null>(null);
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stale, setStale] = useState(false);
  const [reload, setReload] = useState(0);
  const [copied, setCopied] = useState(false);
  const [script, setScript] = useState("");
  const [scriptPending, setScriptPending] = useState(false);
  const refreshSequence = useRef(0);
  const snapshotRevision = snapshot?.revision;
  const snapshotRuleVersion = snapshot?.ruleVersion;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    let active = true;
    void api.week(week).then(value => {
      if (!active) return;
      if (value.accountId !== account.id) throw new Error("员工账号已在其他页面切换，请退出后重新选择本人账号");
      setSnapshot(value); setDays(value.days); setDirty(false); setStale(false); setError(""); setScript(""); setScriptPending(false);
    }).catch(e => { if (active) setError(message(e)); });
    return () => { active = false; refreshSequence.current += 1; };
  }, [api, account.id, week, reload]);
  useEffect(() => {
    if (snapshotRevision === undefined || !snapshotRuleVersion || busy) return;
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const sequence = ++refreshSequence.current;
      try {
        const value = await api.week(week);
        if (!active || sequence !== refreshSequence.current) return;
        if (value.accountId !== account.id || value.ruleVersion !== snapshotRuleVersion || value.revision !== snapshotRevision) {
          setStale(true); setError("账号、报班或容量规则已变化。请先保留需要的填写内容，再重新读取核对。"); return;
        }
        setSnapshot(current => current ? { ...current, capacity: value.capacity } : current);
      } catch { if (active) setNotice("容量状态暂时无法更新，请提交前重新读取核对。"); }
    };
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", refresh); refreshSequence.current += 1; };
  }, [api, account.id, week, snapshotRevision, snapshotRuleVersion, busy]); // capacity refresh preserves every local draft
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  function edit(date: string, update: (d: AvailabilityDay) => AvailabilityDay) {
    setDays(current => current.map(d => d.date === date ? update(d) : d)); setDirty(true); setNotice(""); setScript(""); setScriptPending(false);
  }
  async function convertScript() {
    if (!snapshot) return;
    setBusy(true); setError(""); refreshSequence.current += 1;
    try {
      const value = await api.preview(account.id, week, script);
      if (value.accountId !== account.id || value.week !== week || value.revision !== snapshot.revision || value.ruleVersion !== snapshot.ruleVersion) {
        setStale(true); throw new Error("账号、代码设置或报班规则已变化，请重新读取后核对");
      }
      setDays(value.days); setDirty(true); setScriptPending(false); setNotice("代码已转换为下方每天的选择，请核对后提交。没有写到的日期为未填写。");
    } catch (e) { setError(message(e)); } finally { setBusy(false); }
  }
  function moveWeek(offset: number) {
    setSnapshot(null); setDays([]); setError(""); setNotice(""); setStale(false);
    setWeek(current => DateTime.fromISO(current).plus({ weeks: offset }).toISODate()!);
  }
  async function save() {
    if (!snapshot) return;
    setBusy(true); setError(""); setNotice(""); refreshSequence.current += 1;
    try {
      const value = await api.save(snapshot, days);
      if (value.accountId !== account.id || value.week !== week || value.revision !== snapshot.revision + 1) throw new Error("提交结果尚未确认，请重新读取核对");
      setSnapshot(value); setDays(value.days); setDirty(false); setNotice("报班已提交。你可以继续修改，最终班次以门店发布的排班为准。");
    } catch (e) {
      if (!(e instanceof EmployeePortalError) || e.status !== 400) setStale(true);
      setError(`${message(e)}。填写内容已保留，请重新读取核对后再提交。`);
    }
    finally { setBusy(false); }
  }
  async function copyLink() {
    const link = `${window.location.origin}/employee/availability${api.mode === "demo" ? `?account=${encodeURIComponent(account.id)}` : ""}`;
    try { await navigator.clipboard.writeText(link); setCopied(true); }
    catch { setNotice(`报班页面链接：${link}`); }
  }
  const end = DateTime.fromISO(week).plus({ days: 6 });
  const available = days.filter(day => day.status === "AVAILABLE").length;
  const unavailable = days.filter(day => day.status === "UNAVAILABLE").length;
  const remaining = days.filter(day => day.status === "UNKNOWN").length;
  return <main><section className="employee-intro"><div><p className="employee-eyebrow">{account.storeName} · {account.name}</p><h1>我的报班</h1><p>选择每天可以工作的时段；无法工作的日期，请标记“当天无法报班”。</p></div><button className="employee-text-button" onClick={() => void copyLink()}><Copy size={16} />{copied ? "已复制链接" : "复制报班链接"}</button></section>
    <section className="employee-weekbar" aria-label="报班周"><button aria-label="上一周" disabled={dirty || busy} onClick={() => moveWeek(-1)}><ChevronLeft size={20} /></button><div><h2>{localDay(week).toFormat("M月d日")} <span>至</span> {end.toFormat("M月d日")}</h2><p>{localDay(week).year} · {snapshot?.timezone ?? "正在读取门店时区"}</p></div><button aria-label="下一周" disabled={dirty || busy} onClick={() => moveWeek(1)}><ChevronRight size={20} /></button></section>
    {snapshot && <section className="employee-week-summary" aria-label="本周填写进度">
      <div className="employee-progress-heading"><h2>本周填写进度</h2><strong>{available + unavailable}<span> / {days.length} 天已填写</span></strong></div>
      <progress aria-label="已填写天数" max={days.length || 7} value={available + unavailable} />
      <div className="employee-progress-counts"><span><i className="employee-count-available" />可报班 <strong>{available} 天</strong></span><span><i className="employee-count-unavailable" />无法报班 <strong>{unavailable} 天</strong></span><span><i className="employee-count-unknown" />未填写 <strong>{remaining} 天</strong></span></div>
      <p>{remaining ? "未填写的日期会保持未填写，不会自动记为无法报班。" : "每天都已填写，请核对时间后提交。"}</p>
    </section>}
    <section className="employee-capacity-guide" aria-label="容量提示"><h2>时段热度参考</h2><div className="employee-legend">{Object.entries(signals).map(([key, value]) => <span key={key}><i className={value.className} />{value.label}</span>)}</div><p>已饱满仍可报班。门店会综合安排，报班不代表最终班次。</p>{api.mode === "demo" && <p className="employee-footnote">热度根据门店人数规则和演示报班计算，尚未计入正式员工报班；约每半分钟更新。</p>}</section>
    {error && <div role="alert" className="employee-error">{error}{api.mode === "account" && api.signInPath && <a className="employee-text-button" href={api.signInPath} target="_blank" rel="noopener noreferrer">在新页面登录</a>}</div>}
    {notice && <p role="status" className="employee-notice">{notice}</p>}
    <div className="employee-form-toolbar"><span>{dirty ? "有尚未提交的修改，提交后可切换周" : snapshot?.updatedAt ? `上次提交 ${DateTime.fromISO(snapshot.updatedAt).setZone(snapshot.timezone).toFormat("M月d日 HH:mm")}` : "本周尚未提交"}</span><button className="employee-text-button" disabled={busy} onClick={() => { if (dirty && !window.confirm("放弃尚未提交的修改，重新读取已保存的报班？")) return; setSnapshot(null); setError(""); setNotice(""); setReload(n => n + 1); }}><RefreshCw size={15} />重新读取</button></div>
    {snapshot && <section className="employee-script"><label htmlFor="employee-week-script">用代码快速填写整周</label><p id="employee-script-help">例如 <code>1AA 2BB 3CC</code> 或 <code>1-5AA</code>；1–7 对应周一至周日，无需填写姓名。</p><div><input id="employee-week-script" aria-describedby="employee-script-help" autoComplete="off" spellCheck={false} placeholder="1AA2BB3CC" value={script} disabled={busy} onChange={e => { setScript(e.target.value); setScriptPending(true); setDirty(true); setNotice(""); }} /><button className="employee-primary" disabled={busy || !script.trim() || stale} onClick={() => void convertScript()}>转换并预览</button></div>{scriptPending && <p>代码尚未转换，请先预览再提交；下方选择会在转换后更新。</p>}</section>}
    {!snapshot ? <div role="status" className="employee-loading">{error ? "报班暂时无法读取，请重新读取重试。" : "正在读取报班与容量状态…"}</div> : <div className="employee-days">{days.map(d => {
      const capacity = snapshot.capacity.find(c => c.date === d.date)?.bands ?? [];
      return <section key={d.date} className="employee-day" data-status={d.status}><header><div><h3>{localDay(d.date).toFormat("cccc")}<span>{localDay(d.date).toFormat("M月d日")}</span></h3></div><span className="employee-selection-status">{d.status === "AVAILABLE" ? d.shortcut ? <><Check size={15} aria-hidden="true" />可报班 · {d.shortcut}</> : "请重新选择时段" : d.status === "UNAVAILABLE" ? "无法报班" : "未填写"}</span></header>
        {d.status === "AVAILABLE" && <p className="employee-selected-time">{d.slots.map(slot => `${slot.start}–${slot.end}`).join("、")}</p>}
        <div className="employee-code-grid" aria-label={`${d.date}报班代码`}>{snapshot.shortcuts.map(shortcut => {
          const matching = capacity.filter(b => b.start < shortcut.endTime && b.end > shortcut.startTime);
          const level = matching.some(b => b.signal === "RED") ? "RED" : matching.some(b => b.signal === "YELLOW") ? "YELLOW" : matching.length ? "GREEN" : null;
          const selected = d.status === "AVAILABLE" && d.shortcut === shortcut.code && d.slots.length === 1 && d.slots[0].start === shortcut.startTime && d.slots[0].end === shortcut.endTime;
          return <button key={shortcut.code} type="button" aria-label={`${d.date} 选择 ${shortcut.code}`} aria-describedby={`${d.date}-${shortcut.code}-time`} aria-pressed={selected} disabled={busy}
            onClick={() => edit(d.date, current => ({ ...current, status: "AVAILABLE", shortcut: shortcut.code, slots: [{ start: shortcut.startTime, end: shortcut.endTime }] }))}>
            <strong>{shortcut.code}{selected && <Check size={16} aria-hidden="true" />}</strong><span id={`${d.date}-${shortcut.code}-time`}>{shortcut.startTime}–{shortcut.endTime}</span>
            <small className={level ? signals[level].className : ""}>{level ? <><i />{level === "RED" ? "含已饱满时段" : level === "YELLOW" ? "含即将报满时段" : "空余充足"}</> : "暂无容量提示"}</small>
          </button>;
        })}</div>
        {snapshot.shortcuts.length === 0 && <p className="employee-day-note">门店暂未配置可选时段，请联系负责人。</p>}
        {capacity.length > 0 && <details className="employee-capacity-details"><summary>查看分时段热度</summary><div className="employee-bands" aria-label={`${d.date}容量状态`}>{capacity.map(b => <Capacity key={`${b.start}-${b.end}`} band={b} />)}</div></details>}
        <div className="employee-day-actions"><button className="employee-text-button" type="button" aria-label={`${d.date} 无法报班`} aria-pressed={d.status === "UNAVAILABLE"} disabled={busy} onClick={() => edit(d.date, current => ({ ...current, status: "UNAVAILABLE", shortcut: undefined, slots: [] }))}>当天无法报班</button>
          <button className="employee-text-button" type="button" aria-label={`${d.date} 清除选择`} disabled={busy || d.status === "UNKNOWN"} onClick={() => edit(d.date, current => ({ ...current, status: "UNKNOWN", shortcut: undefined, slots: [] }))}>清除选择</button></div>
        {d.status === "UNAVAILABLE" && <p className="employee-day-note">当天无法工作，提交后会记录为不可报班。</p>}
      </section>;
    })}</div>}
    <footer className="employee-submitbar"><div><strong>{dirty ? "修改尚未提交" : "报班随时可以修改"}</strong><p>{snapshot ? `${available} 天可报班 · ${unavailable} 天无法报班 · ${remaining} 天未填写` : "读取完成后即可填写"}</p>{scriptPending && <p>请先转换代码并预览</p>}{stale && <p>请重新读取并核对后再提交</p>}</div><button className="employee-primary" disabled={!snapshot || busy || stale || !dirty || scriptPending} onClick={() => void save()}>{busy ? "正在处理…" : <><Check size={18} />提交本周报班</>}</button></footer>
  </main>;
}

function Capacity({ band }: { band: CapacityBand }) {
  const signal = signals[band.signal];
  return <span className={`employee-band ${signal.className}`}><i />{band.start}–{band.end}<strong>{signal.label}</strong></span>;
}
