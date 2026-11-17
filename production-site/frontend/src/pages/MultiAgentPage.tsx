import { Bot, Download, Play, RefreshCw } from "lucide-react";
import { DateTime } from "luxon";
import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { AppSelect } from "../components/ui/AppSelect";
import { Dialog } from "../components/ui/Dialog";
import { ApiRequestError } from "../lib/apiClient";
import { addCalendarDays } from "../lib/storeTime";
import { workforceRepository } from "../services/workforceRepository";
import { multiAgentRepository as engine, type AgentPreview, type AgentRun, type AgentShift } from "../services/multiAgentRepository";
import { useStoreSelection } from "../store/StoreContext";
import type { RosterStore } from "../types/workforce";
import { ScheduleViews } from "../../scheduling-engine/lab-ui/src/ScheduleViews";
import "./multiAgent.css";

const agents = [{ id: "requirement", name: "需求理解" }, { id: "daily", name: "逐日排班" }, { id: "review", name: "遗漏员工审查" }, { id: "audit", name: "最终验证" }];
const message = (error: unknown) => error instanceof Error ? error.message : "请求失败，请重试";
const hours = (minutes: number | undefined | null) => minutes == null ? "待计算" : `${Number((minutes / 60).toFixed(2))} h`;
function remembered(key: string) { try { return sessionStorage.getItem(key) ?? ""; } catch { return ""; } }
function remember(key: string, value: string) { try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch { /* Disabled storage does not block scheduling. */ } }

export function MultiAgentPage() {
  const { user } = useAuth();
  const { selectedStoreId, setSelectedStoreId, initializeStoreId } = useStoreSelection();
  const [stores, setStores] = useState<RosterStore[]>([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    workforceRepository.stores().then(({ stores: rows }) => {
      if (active) { setStores(rows); initializeStoreId(rows.map((s) => s.id)); setError(""); }
    }).catch((cause) => { if (active) setError(message(cause)); });
    return () => { active = false; };
  }, [initializeStoreId, retry]);
  return <div className="agent-page">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-graphite-950"><Bot aria-hidden="true" className="h-6 w-6" />智能体排班</h1><p className="mt-2 text-sm text-graphite-600">读取真实报班与正式评分，按天生成可验证的排班草稿。</p></div>
      <div className="w-full sm:w-64"><AppSelect label="门店" value={selectedStoreId} onValueChange={setSelectedStoreId} options={stores.map((s) => ({ value: s.id, label: s.name }))} disabled={!stores.length} /></div></header>
    {error && <div role="alert" className="agent-notice agent-error">{error}<button className="agent-secondary ml-3" onClick={() => setRetry((v) => v + 1)}>重新加载门店</button></div>}
    {selectedStoreId ? <StoreAgent key={`${user?.accountId}:${selectedStoreId}`} storeId={selectedStoreId} accountId={user?.accountId ?? ""} /> : <p role="status" className="agent-section">{stores.length ? "请选择门店。" : "正在读取可访问门店…"}</p>}
  </div>;
}

function StoreAgent({ storeId, accountId }: { storeId: string; accountId: string }) {
  const storageKey = `molly-roster:agent-run:${accountId}:${storeId}`;
  const [runId, setRunId] = useState(() => remembered(storageKey));
  const [week, setWeek] = useState(() => DateTime.now().setZone("Australia/Sydney").startOf("week").toISODate()!);
  const [preserve, setPreserve] = useState(false);
  const [preview, setPreview] = useState<AgentPreview | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const [pollRetry, setPollRetry] = useState(0);
  const [health, setHealth] = useState<boolean | null>(null);
  const [selectedDate, setSelectedDate] = useState(week);
  const [selectedShift, setSelectedShift] = useState<AgentShift | null>(null);
  const [ledgerDate, setLedgerDate] = useState("");
  const end = addCalendarDays(week, 6);
  const running = run?.status === "RUNNING" || busy === "start";
  const locked = running || Boolean(busy);
  const result = run?.result;
  const people = result?.context?.employees ?? run?.employees ?? preview?.employees ?? [];
  const names = new Map(people.map((p) => [p.id, p.name]));
  const zone = run?.timezone ?? preview?.rules.timezone ?? "Australia/Sydney";
  const clock = (time: string) => DateTime.fromISO(time).setZone(zone).toFormat("HH:mm");
  const commits = run?.events.filter((e) => e.kind === "COMMITTED") ?? [];
  const history = run?.history.length ? run.history : commits.filter((e) => e.ledger).map((e) => ({ date: e.date!, ledger: e.ledger! }));
  const ledger = history.find((h) => h.date === ledgerDate)?.ledger ?? history.at(-1)?.ledger ?? result?.ledger;
  const assignments = result?.assignments ?? commits.at(-1)?.assignments ?? [];
  const slots = result?.validation.coverage ?? run?.preview_coverage ?? [];
  const report = result?.business_rule_report ?? run?.allocation_report;
  const targetRows = report?.rows ?? preview?.context.rating_hour_targets ?? [];
  const rangeStart = result?.context?.days[0]?.date ?? run?.start_date ?? week;
  const rangeEnd = result?.context?.days.at(-1)?.date ?? run?.end_date ?? end;

  useEffect(() => {
    let active = true;
    engine.health().then((h) => { if (active) setHealth(h.provider_configured); }).catch(() => { if (active) setHealth(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!runId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const state = await engine.status(storeId, runId);
        if (!active) return;
        setRun(state); setPollError("");
        if (state.status === "RUNNING") timer = setTimeout(() => { void poll(); }, 2000);
      } catch (cause) {
        if (!active) return;
        setPollError(message(cause));
        if (cause instanceof ApiRequestError && cause.status === 404) { remember(storageKey, ""); setRunId(""); }
        else timer = setTimeout(() => { void poll(); }, 5000);
      }
    }
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [storeId, runId, storageKey, pollRetry]);

  async function loadInputs() {
    setBusy("inputs"); setError("");
    try { setPreview(await engine.inputs(storeId, week, end, preserve)); } catch (cause) { setPreview(null); setError(message(cause)); }
    finally { setBusy(""); }
  }
  async function latest() {
    setBusy("latest"); setError("");
    try {
      const state = await engine.latest(storeId);
      setRunId(""); remember(storageKey, ""); setRun(state); setPollError(""); setLedgerDate("");
      setSelectedDate(state.result?.context?.days[0]?.date ?? week);
    } catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }
  async function start() {
    if (!preview) return;
    setBusy("start"); setError("");
    try {
      const state = await engine.start(storeId, week, end, preserve, preview);
      remember(storageKey, state.run_id); setRunId(state.run_id); setRun({ status: "RUNNING", result: null, events: [], history: [] }); setLedgerDate(""); setSelectedDate(week);
    } catch (cause) { setError(message(cause)); setPreview(null); } finally { setBusy(""); }
  }
  async function download() {
    if (!runId) return;
    setBusy("export"); setError("");
    try {
      const data = await engine.export(storeId, runId);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data.calendar, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `${storeId}-${rangeStart}-agent-draft.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) { setError(message(cause)); } finally { setBusy(""); }
  }

  return <>
    <section className="agent-section" aria-label="排班输入"><div className="flex flex-wrap items-end gap-4">
      <label className="block"><span className="mb-1.5 block text-sm font-semibold">排班周，选择周一</span><input className="agent-input" aria-label="排班周" type="date" value={week} disabled={locked} onChange={(e) => { const d = DateTime.fromISO(e.target.value); if (d.isValid) { setWeek(d.startOf("week").toISODate()!); setPreview(null); } }} /></label>
      <p className="pb-3 text-sm text-graphite-600">至 {end}</p>
      <button className="agent-secondary" disabled={locked} onClick={() => { void loadInputs(); }}><RefreshCw className="h-4 w-4" aria-hidden="true" />{busy === "inputs" ? "正在读取…" : "读取真实排班输入"}</button>
      <button className="agent-primary" disabled={locked || !preview || health === false} onClick={() => { void start(); }}><Play className="h-4 w-4" aria-hidden="true" />{running ? "智能体正在排班…" : "生成排班草稿"}</button>
      <button className="agent-secondary" disabled={locked} onClick={() => { void latest(); }}>{busy === "latest" ? "正在读取…" : "查看最近真实测试结果"}</button>
    </div>
      <div className="mt-4 max-w-lg"><AppSelect label="已有班次处理" value={preserve ? "keep" : "new"} disabled={locked} onValueChange={(value) => { setPreserve(value === "keep"); setPreview(null); }} options={[{ value: "new", label: "重新生成独立草稿（推荐）" }, { value: "keep", label: "保留已有班次并补齐" }]} /></div>
      <p className="mt-2 text-sm text-graphite-600">{preserve ? "本次生成沿用已有班次；若已有班次超出精确人数要求，会单独列出。这只是本次生成的选择，不限制日历编辑。" : "使用真实员工和报班生成新的候选班表，当前周已有班次不重复计入新候选的人数或工时。"} 此处生成候选，不直接覆盖日历。</p>
      <p className="mt-3 text-sm text-graphite-600">生成结果保持草稿。休息与发布前合规检查需继续由现有流程处理。</p>
      {health === false && <p role="status" className="mt-3 text-sm text-red-800">引擎未连接或模型未配置，仍可尝试读取已保存的真实结果。请检查智能体服务配置。</p>}
      {preview && <dl className="agent-facts"><div><dt>规则版本</dt><dd>{preview.rules.version}</dd></div><div><dt>真实员工 / 可用区间</dt><dd>{preview.employees.length} 人 / {preview.availability_count} 段</dd></div><div><dt>已有班次</dt><dd>{preview.existing_shift_count} 条保留，{preview.detached_existing_count} 条仅在草稿中另排</dd></div><div><dt>评分来源</dt><dd>{preview.rating_source}</dd></div></dl>}
    </section>
    {error && <p role="alert" className="agent-notice agent-error">{error}</p>}
    {pollError && <div role="alert" className="agent-notice agent-error">{pollError}<button className="agent-secondary ml-3" onClick={() => setPollRetry((v) => v + 1)}>重新连接任务</button></div>}
    {(run || preview) && <section className="agent-section" aria-label="智能体执行进度"><h2 className="agent-heading">执行过程</h2><ol className="agent-steps">{agents.map((agent) => {
      const last = run?.events.filter((e) => e.agent === agent.id).at(-1);
      const done = last && ["AGENT_OUTPUT", "AGENT_COMPLETED"].includes(last.kind);
      return <li key={agent.id}><span className={`agent-dot ${done ? "agent-dot-done" : ""}`} aria-hidden="true" /><strong>{agent.name}</strong><span>{last ? done ? "已完成" : `处理中${last.date ? ` · ${last.date}` : ""}` : "等待执行"}</span></li>;
    })}</ol>{run && <p className="mt-3 text-sm" role="status">{run.status === "RUNNING" ? "任务运行中，已通过的日期才会更新工时台账。" : run.status === "DRAFT_VALIDATED" ? "全周名义覆盖验证通过，草稿待合规处理。" : run.status === "INTERRUPTED" ? "服务重启前的任务未完成，请重新读取输入后生成。" : "全周验证未通过，下面仅展示已接受日期和具体错误。"}{run.error && ` ${run.error}`}</p>}</section>}
    {preview && <section className="agent-section"><h2 className="agent-heading">输入检查 · {preview.preserve_existing ? "保留已有班次并补齐" : "重新生成独立草稿"}</h2>
      <p className="mt-2 text-sm text-graphite-600">连续半小时时段按同一原因合并显示。下列检查基于本次报班、岗位和已确认的规则；没有发现缺口也不代表完整排班已通过验证。</p>
      {preview.source_diagnostics.map((d) => <div key={d.date} className="mt-4 border-t border-graphite-200 pt-3"><h3 className="text-sm font-semibold">{d.date}</h3>
        {!d.proven_slot_conflicts.length ? <p className="mt-1 text-sm text-emerald-800">未发现当前输入的人员容量或保留班次人数冲突。</p> : <ul className="mt-2 space-y-3 text-sm">{(d.conflict_groups ?? d.proven_slot_conflicts).map((c, i) => <li key={i}>
          {c.code === "FIXED_EXACT_EXCESS" ? <p className="text-amber-900">已有班次人数超额：{clock(c.start!)}–{clock(c.end!)} 要求恰好 {c.required} 人，保留的旧班次已有 {c.fixed_employee_ids?.length} 人。{c.slot_count ? `涉及 ${c.slot_count} 个半小时时段。` : ""}这不是可用员工不足；可改选“重新生成独立草稿”。</p>
            : c.code === "ELIGIBILITY_SHORTAGE" ? <p className="text-red-800">当前可用人选不足：{clock(c.start!)}–{clock(c.end!)} 要求 {c.required} 人，符合时间、岗位及班型的候选最多 {c.eligible_employee_ids?.length} 人{c.available_employee_ids ? `，其中报班可用共 ${c.available_employee_ids.length} 人` : ""}。</p>
            : c.code === "COMBINED_PERIOD_STAFF_SHORTAGE" ? <p className="text-red-800">同日早晚覆盖容量不足：{c.message}</p>
            : <p className="text-red-800">指定员工或规则限制：{c.message ?? c.code}</p>}
          {c.code === "ELIGIBILITY_SHORTAGE" && <p className="mt-1 text-graphite-600">符合候选条件的员工：{c.eligible_employee_ids?.map((id) => preview.employees.find((p) => p.id === id)?.name ?? id).join("、") || "无"}。请核对当天报班与岗位资料。</p>}
        </li>)}</ul>}
      </div>)}
    </section>}
    {run && <>
      <section className="agent-section"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="agent-heading">竖版班表 · {rangeStart} 至 {rangeEnd}</h2><button className="agent-secondary" disabled={locked || !runId || run.status !== "DRAFT_VALIDATED"} onClick={() => { void download(); }}><Download className="h-4 w-4" aria-hidden="true" />导出已验证草稿 JSON</button></div>
        <p className="my-3 text-sm text-graphite-600">{assignments.length} 个班次，{assignments.filter((s) => s.pattern_name === "Full").length} 个 Full。{result?.failed_days.length ? `未通过日期：${result.failed_days.map((d) => d.date).join("、")}。` : ""}</p>
        <ScheduleViews assignments={assignments.map((s) => ({ ...s, employee_name: names.get(s.employee_id) ?? s.employee_id, breaks: [], reasons: [s.reason] }))} coverage={slots.map((s) => ({ ...s, effective: s.scheduled, on_break: 0, gap: Math.max(0, -s.difference) }))} timezone={zone} startDate={rangeStart} endDate={rangeEnd} week selectedDate={selectedDate} onDateChange={setSelectedDate} onSelect={(s) => setSelectedShift(assignments.find((a) => a.employee_id === s.employee_id && a.start === s.start) ?? null)} showEffective={false} />
      </section>
      {result?.validation.errors.length ? <details className="agent-section"><summary className="cursor-pointer font-semibold text-red-800">查看 {result.validation.errors.length} 项验证错误</summary><ul className="mt-3 space-y-1 text-sm">{result.validation.errors.map((e, i) => <li key={i}>{e.date} · {e.code} · {e.message}</li>)}</ul></details> : null}
      {history.length > 0 && <section className="agent-section"><div className="flex flex-wrap items-end gap-4"><h2 className="agent-heading">每日累计工时</h2><div className="w-64"><AppSelect label="查看提交后的台账" value={ledgerDate || history.at(-1)!.date} onValueChange={setLedgerDate} options={history.map((h) => ({ value: h.date, label: `${h.date} · 版本 ${h.ledger.version}` }))} /></div></div><div className="agent-table-scroll"><table className="agent-table"><thead><tr><th>员工</th><th>正式评分</th><th>班次数</th><th>累计名义工时</th></tr></thead><tbody>{ledger?.employees.map((p) => <tr key={p.employee_id}><td>{names.get(p.employee_id) ?? p.employee_id}</td><td>{p.rating ?? "暂无评分"}</td><td>{p.shift_count}</td><td>{hours(p.total_scheduled_minutes)}</td></tr>)}</tbody></table></div></section>}
      {slots.length > 0 && <section className="agent-section"><h2 className="agent-heading">时段覆盖 · {selectedDate}</h2><div className="agent-table-scroll"><table className="agent-table"><thead><tr><th>时段</th><th>需要</th><th>名义覆盖</th><th>差额</th><th>覆盖员工</th></tr></thead><tbody>{slots.filter((s) => s.date === selectedDate).map((s) => <tr key={s.start}><td>{clock(s.start)}–{clock(s.end)}</td><td>{s.required}</td><td>{s.scheduled}</td><td className={s.difference ? "text-red-800 font-semibold" : ""}>{s.difference}</td><td>{s.employee_ids.map((id) => names.get(id) ?? id).join("、") || "无人覆盖"}</td></tr>)}</tbody></table></div></section>}
    </>}
    {targetRows.length > 0 && <section className="agent-section"><h2 className="agent-heading">评分与报班工时目标</h2><p className="mt-2 text-sm text-graphite-600">按报班可用总小时计算目标，最高评分目标 80%，其余按评分档位递减；目标与实际分别显示，公平性分配保持关闭。</p><div className="agent-table-scroll"><table className="agent-table"><thead><tr><th>员工</th><th>正式评分</th><th>报班小时</th><th>目标比例</th><th>目标工时</th><th>实际工时</th></tr></thead><tbody>{targetRows.map((p) => <tr key={p.employee_id}><td>{p.employee_name}</td><td>{p.rating ?? "暂无评分"}</td><td>{hours(p.available_minutes)}</td><td>{p.target_fraction == null ? "未设目标" : `${Math.round(p.target_fraction * 100)}%`}</td><td>{hours(p.target_scheduled_minutes)}</td><td>{hours(p.target_assigned_minutes)}</td></tr>)}</tbody></table></div>
      {report?.mandatory_coverage.map((m) => <p className="mt-3 text-sm" key={`${m.date}:${m.employee_name}`}>{m.date} · {m.employee_name} · 必须覆盖 {m.start}–{m.end}：<strong className={m.satisfied ? "text-emerald-800" : "text-red-800"}>{m.satisfied ? "已满足" : "未满足"}</strong></p>)}
    </section>}
    {selectedShift && <Dialog titleId="agent-shift-title" onClose={() => setSelectedShift(null)} className="w-[min(92vw,36rem)] rounded-2xl bg-white p-6"><h2 id="agent-shift-title" className="agent-heading">{names.get(selectedShift.employee_id)} · {selectedShift.pattern_name}</h2><p className="mt-3">{selectedShift.date} · {clock(selectedShift.start)}–{clock(selectedShift.end)}</p><p className="mt-3 text-sm text-graphite-700">{selectedShift.reason}</p><button className="agent-secondary mt-5" onClick={() => setSelectedShift(null)}>关闭班次详情</button></Dialog>}
  </>;
}
