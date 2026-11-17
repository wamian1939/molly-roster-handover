import {PayrollPanel} from '../components/payroll/PayrollPanel';
import { Download, Eye, FileSpreadsheet, Printer, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { assertRosterSettingsResponse } from "../lib/rosterSettingsResponse";
import { AppSelect } from "../components/ui/AppSelect";
import { Dialog } from "../components/ui/Dialog";
import { useToast } from "../components/ui/ToastProvider";
import { formatShiftTimeRange } from "../lib/dateTime";
import { apiHref } from "../lib/apiClient";
import { storeParts } from "../lib/storeTime";
import { rosterRepository } from "../services/rosterRepository";
import { workforceRepository } from "../services/workforceRepository";
import { useStoreSelection } from "../store/StoreContext";
import type { PublicationDetail, PublicationSummary, RosterPeriod } from "../types/roster";
import type { RosterStore } from "../types/workforce";

export function ExportPage() {
  const { user } = useAuth();
  const { selectedStoreId } = useStoreSelection();
  return <StoreExportPage key={`${user?.accountId ?? "anonymous"}:${selectedStoreId}`} />;
}

function StoreExportPage() {
  const { user } = useAuth(); const { showToast } = useToast();
  const { selectedStoreId, setSelectedStoreId, initializeStoreId } = useStoreSelection();
  const [stores, setStores] = useState<RosterStore[]>([]); const storeId = selectedStoreId;
  const [timezone, setTimezone] = useState<string | null>(null);
  const [settingsMissing, setSettingsMissing] = useState(false);
  const [timezoneError, setTimezoneError] = useState("");
  const [timezoneRetry, setTimezoneRetry] = useState(0);
  const [archiveYear, setArchiveYear] = useState<number | null>(null);
  const [periods, setPeriods] = useState<RosterPeriod[]>([]); const [periodId, setPeriodId] = useState("");
  const [periodError, setPeriodError] = useState<string | null>(null);
  const [periodRetry, setPeriodRetry] = useState(0);
  const [publicationResult, setPublicationResult] = useState<{ periodId: string; rows: PublicationSummary[] } | null>(null); const [sourceId, setSourceId] = useState("current");
  const [publicationError, setPublicationError] = useState<{ periodId: string; message: string } | null>(null);
  const [publicationRetry, setPublicationRetry] = useState(0);
  const [viewing, setViewing] = useState<PublicationDetail | null>(null); const [viewLoading, setViewLoading] = useState(false);
  const [audience, setAudience] = useState<"employee" | "manager">("employee");
  const viewRequest = useRef(0);

  useEffect(() => { let active = true; workforceRepository.stores().then((result) => { if (!active) return; setStores(result.stores); initializeStoreId(result.stores.map((store) => store.id)); }).catch((cause) => { if (active) showToast({ tone: "error", title: "门店加载失败", description: message(cause) }); }); return () => { active = false; }; }, [initializeStoreId, showToast]);
  useEffect(() => {
    if (!storeId) return;
    let active = true;
    rosterRepository.settings(storeId).then((result) => {
      if (!active) return;
      const settings = assertRosterSettingsResponse(result, storeId);
      const missing = !settings;
      const zone = settings?.timezone ?? "UTC";
      setTimezoneError("");
      setSettingsMissing(missing);
      setTimezone(zone);
      setArchiveYear(Number(storeParts(new Date(), zone).date.slice(0, 4)));
    }).catch((cause) => {
      if (!active) return;
      setTimezoneError(message(cause));
      setSettingsMissing(false);
      setTimezone("UTC");
      setArchiveYear(Number(storeParts(new Date(), "UTC").date.slice(0, 4)));
    });
    return () => { active = false; };
  }, [storeId, timezoneRetry]);
  useEffect(() => {
    if (!storeId || archiveYear === null || !timezone) return;
    let active = true;
    const from = `${archiveYear}-01-01`; const to = `${archiveYear}-12-31`;
    rosterRepository.periods(storeId, from, to).then((rows) => {
      if (!active) return;
      const verified = checkedPeriods(rows, storeId, from, to);
      const today = storeParts(new Date(), timezone).date;
      setPeriods(verified);
      setPeriodId(verified.find((row) => row.startDate <= today && row.endDate >= today)?.id ?? verified.at(-1)?.id ?? "");
      setPeriodError(null);
    }).catch((cause) => { if (active) { setPeriods([]); setPeriodId(""); setPeriodError(message(cause)); showToast({ tone: "error", title: "排班周期加载失败", description: message(cause) }); } });
    return () => { active = false; };
  }, [archiveYear, periodRetry, showToast, storeId, timezone]);
  useEffect(() => {
    if (!storeId || !periodId) return;
    let active = true;
    rosterRepository.publications(storeId, periodId).then((rows) => { if (!active) return; setPublicationResult({ periodId, rows: checkedPublications(rows, storeId, periodId) }); setPublicationError(null); }).catch((cause) => { if (active) { setPublicationResult(null); setSourceId("current"); setPublicationError({ periodId, message: message(cause) }); showToast({ tone: "error", title: "发布记录加载失败", description: message(cause) }); } });
    return () => { active = false; };
  }, [periodId, publicationRetry, showToast, storeId]);

  const selected = periods.find((period) => period.id === periodId) ?? null;
  const publications = publicationResult?.periodId === periodId ? publicationResult.rows : [];
  const sourcePublication = publications.find((publication) => publication.id === sourceId) ?? null;
  const query = useMemo(() => new URLSearchParams({ storeId, ...(sourcePublication ? { publicationId: sourcePublication.id } : { periodId }), audience }).toString(), [audience, periodId, sourcePublication, storeId]);

  function selectPeriod(value: string) {
    viewRequest.current += 1;
    setViewLoading(false);
    setViewing(null);
    setPublicationResult(null);
    setPublicationError(null);
    setPeriodId(value);
    setSourceId("current");
  }

  function changeSource(value: string) {
    viewRequest.current += 1;
    setViewLoading(false);
    setViewing(null);
    setSourceId(value);
  }

  function changeArchiveYear(delta: number) {
    if (archiveYear === null) return;
    viewRequest.current += 1;
    setViewLoading(false);
    setViewing(null);
    setPublicationResult(null);
    setPublicationError(null);
    setSourceId("current");
    setPeriodId("");
    setPeriods([]);
    setPeriodError(null);
    setArchiveYear(archiveYear + delta);
  }

  function changeAudience(value: "employee" | "manager") {
    viewRequest.current += 1;
    setViewLoading(false);
    setViewing(null);
    setAudience(value);
  }

  async function viewPublication(publicationId: string) {
    if (!storeId || viewLoading) return;
    const requestId = ++viewRequest.current;
    setViewLoading(true);
    try {
      const detail = await rosterRepository.publication(storeId, publicationId, audience);
      if (requestId === viewRequest.current) setViewing(checkedPublicationDetail(detail, storeId, periodId, publicationId, audience));
    }
    catch (cause) { if (requestId === viewRequest.current) showToast({ tone: "error", title: "发布记录加载失败", description: message(cause) }); }
    finally { if (requestId === viewRequest.current) setViewLoading(false); }
  }

  return <div><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-semibold text-brand-700">安全、可打印、可追溯</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-graphite-950 sm:text-3xl">导出排班</h1><p className="mt-2 text-sm text-graphite-600">当前草稿与每一个不可变发布版本均可独立查看、导出。员工版不包含内部备注、评分或 Tier。</p></div>{(user?.role === "ADMIN" || (user?.storeIds.length ?? 0) > 1) ? <div className="w-full sm:w-52"><AppSelect label="门店" value={selectedStoreId} onValueChange={setSelectedStoreId} options={stores.map((store) => ({ value: store.id, label: store.name }))} /></div> : null}</header>
    {timezoneError ? <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert"><span>门店时区暂时无法确认：{timezoneError}。当前排班的 CSV 和打印版已暂停；历史发布快照仍可查看和导出，年份暂按 UTC 定位。</span><button type="button" className="font-semibold underline" onClick={() => setTimezoneRetry((value) => value + 1)}>重试</button></div> : null}
    {settingsMissing ? <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">门店时区尚未设置，当前排班的 CSV 和打印版已暂停。请先在设置中保存时区；历史发布快照仍可查看和导出，年份暂按 UTC 定位。</p> : null}
    {periodError ? <div role="alert" className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"><span>排班周期读取失败：{periodError}</span><button type="button" className="font-semibold underline" onClick={() => { setPeriodError(null); setPeriodRetry((value) => value + 1); }}>重试周期</button></div> : null}
    <div className="mt-5 flex items-center gap-3" aria-label="发布历史年份"><button type="button" className="calendar-text-button" disabled={archiveYear === null} onClick={() => changeArchiveYear(-1)}>上一年</button><span className="min-w-16 text-center text-sm font-semibold tabular-nums text-graphite-700">{archiveYear ?? "…"}</span><button type="button" className="calendar-text-button" disabled={archiveYear === null} onClick={() => changeArchiveYear(1)}>下一年</button></div>
    <section className="mt-6 rounded-2xl border border-graphite-200 bg-white p-4 shadow-panel sm:p-7"><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,15rem)]"><div className="grid min-w-0 gap-4 sm:grid-cols-2"><AppSelect label="排班周期" value={periodId} onValueChange={selectPeriod} options={periods.map((period) => ({ value: period.id, label: `${period.startDate} 至 ${period.endDate} · ${period.status === "PUBLISHED" ? "已发布" : "草稿"}` }))} /><AppSelect label="导出版本" value={sourceId} onValueChange={changeSource} options={[{ value: "current", label: "当前排班（实时）" }, ...publications.map((publication) => ({ value: publication.id, label: `发布 #${publication.revisionNumber} · ${formatDateTime(publication.publishedAt)}` }))]} /></div><AppSelect label="导出范围" value={audience} onValueChange={(value) => changeAudience(value as "employee" | "manager")} options={[{ value: "employee", label: "员工安全版" }, ...(user?.role === "ADMIN" ? [{ value: "manager", label: "管理版" }] : [])]} /></div>
      {selected ? <div className="mt-4 rounded-2xl bg-graphite-50 p-4"><p className="text-xs font-semibold text-graphite-500">当前选择</p><p className="mt-1 break-words text-lg font-semibold text-graphite-950">{selected.startDate} — {selected.endDate}</p><p className="mt-1 text-sm text-graphite-600">{sourcePublication ? `不可变发布版本 #${sourcePublication.revisionNumber} · ${formatDateTime(sourcePublication.publishedAt)}` : `实时版本 ${selected.version} · ${selected.status === "PUBLISHED" ? "已发布" : "草稿"}`}</p></div> : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2"><ExportLink enabled={Boolean(periodId) && ((!settingsMissing && !timezoneError) || Boolean(sourcePublication))} href={apiHref(`/roster/export.csv?${query}`)} icon={<FileSpreadsheet className="h-5 w-5" />} title="下载 CSV" subtitle="适合 Excel、Sheets 与留档" download /><ExportLink enabled={Boolean(periodId) && ((!settingsMissing && !timezoneError) || Boolean(sourcePublication))} href={apiHref(`/roster/print?${query}`)} icon={<Printer className="h-5 w-5" />} title="打开打印版" subtitle="浏览器打印或另存为 PDF" /></div>
      <p className="mt-6 flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />CSV 单元格已处理公式注入；员工安全版不会包含评分、Tier、内部备注、电话、邮箱、住址或评价者明细。</p>
    </section>

    <section className="mt-6 rounded-2xl border border-graphite-200 bg-white p-4 shadow-panel sm:p-7"><div><p className="text-sm font-semibold text-brand-700">Immutable revisions</p><h2 className="mt-1 text-xl font-semibold text-graphite-950">发布记录</h2><p className="mt-1 text-sm text-graphite-600">重新打开和修改当前排班不会改变以下历史版本。</p></div><div className="mt-5 grid gap-3">{publications.map((publication) => <article key={publication.id} className="grid gap-3 rounded-2xl border border-graphite-200 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><p className="font-semibold text-graphite-950">发布 #{publication.revisionNumber} · {formatDateTime(publication.publishedAt)}</p><p className="mt-1 text-sm text-graphite-600">{publication.publishedBy.displayName} · {publication.shiftCount} 个班次 · {publication.assignmentCount} 个员工班次 · {publication.totalHours.toFixed(1)}h</p></div><div className="flex flex-wrap gap-2"><button type="button" className="calendar-text-button" disabled={viewLoading} onClick={() => void viewPublication(publication.id)}><Eye className="h-4 w-4" />查看</button><a className="calendar-text-button" href={apiHref(`/roster/export.csv?${new URLSearchParams({ storeId, publicationId: publication.id, audience }).toString()}`)} download><Download className="h-4 w-4" />导出</a></div></article>)}{publicationError?.periodId === periodId ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800">发布记录读取失败：{publicationError.message} <button type="button" className="font-semibold underline" onClick={() => { setPublicationError(null); setPublicationResult(null); setPublicationRetry((value) => value + 1); }}>重试</button></div> : periodId && publicationResult?.periodId === periodId && !publications.length ? <p className="rounded-xl bg-graphite-50 px-4 py-6 text-center text-sm text-graphite-600">该周期尚无发布记录。</p> : null}</div></section>
    {user?.role === "ADMIN" ? <PayrollPanel stores={stores} selection={periodId ? {storeId,...(sourcePublication ? {publicationId:sourcePublication.id}:{periodId})}:null} /> : null}
    {viewing ? <PublicationDialog detail={viewing} audience={audience} onClose={() => setViewing(null)} /> : null}
  </div>;
}

function ExportLink({ enabled, href, icon, title, subtitle, download = false }: { enabled: boolean; href: string; icon: ReactNode; title: string; subtitle: string; download?: boolean }) { return <a aria-disabled={!enabled} href={enabled ? href : undefined} download={download || undefined} target={download ? undefined : "_blank"} rel={download ? undefined : "noreferrer"} className={`flex min-h-24 min-w-0 items-center gap-4 rounded-2xl border border-graphite-200 p-4 transition hover:border-brand-500 hover:bg-brand-50 ${!enabled ? "pointer-events-none opacity-50" : ""}`}><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">{icon}</span><span className="min-w-0"><strong className="block text-sm text-graphite-950">{title}</strong><span className="mt-1 block text-xs text-graphite-600">{subtitle}</span></span>{download ? <Download className="ml-auto h-4 w-4 shrink-0 text-graphite-500" /> : null}</a>; }

function PublicationDialog({ detail, audience, onClose }: { detail: PublicationDetail; audience: "employee" | "manager"; onClose: () => void }) {
  const timezone = detail.snapshot.timezone ?? "UTC";
  const legacyTimezone = !detail.snapshot.timezone;
  return <Dialog titleId="publication-title" onClose={onClose} className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[20px] bg-white p-4 shadow-lift sm:p-6">
    <div className="flex items-start justify-between gap-4">
      <div><p className="text-sm font-semibold text-brand-700">只读发布版本 #{detail.revisionNumber}</p><h2 id="publication-title" className="mt-1 text-xl font-semibold text-graphite-950">{detail.snapshot.store.name} · {detail.period.startDate} 至 {detail.period.endDate}</h2><p className="mt-1 text-sm text-graphite-600">{formatDateTime(detail.publishedAt)} · {detail.publishedBy.displayName}</p></div>
      <button type="button" className="calendar-icon-button shrink-0" aria-label="关闭发布记录" onClick={onClose}><X className="h-4 w-4" /></button>
    </div>
    {legacyTimezone ? <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">旧版发布快照未记录门店时区。以下班次按 UTC 显示原始时间点；原门店当地时间待核实。</p> : null}
    <div className="mt-5 grid gap-3">{detail.snapshot.shifts.map((shift) => {
      const start = storeParts(shift.startAt, timezone);
      const timeRange = formatShiftTimeRange(shift.startAt, shift.endAt, timezone);
      return <article key={shift.id} className="rounded-xl border border-graphite-200 p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span className="h-3 w-3 rounded-full" style={{ background: shift.roleColorSnapshot }} /><strong className="text-sm text-graphite-950">{shift.roleNameSnapshot}</strong><span className="text-sm font-semibold tabular-nums text-graphite-700">{legacyTimezone ? start.date : shift.date} · {timeRange}{legacyTimezone ? " UTC" : ""}</span><span className="text-xs text-graphite-500">休息 {shift.breakMinutes} 分钟</span></div>
        {audience === "manager" ? <div className="mt-2 space-y-1 text-sm text-graphite-700">{shift.assignments.map((assignment, index) => <p key={assignment.id ?? index}>{assignment.employeeNameSnapshot} · 评分 {assignment.officialScoreSnapshot ?? "—"} · {assignment.tierSnapshot ?? "无 Tier"}</p>)}</div> : <p className="mt-2 text-sm text-graphite-700">{shift.assignments.map((assignment) => assignment.employeeNameSnapshot).join("、")}</p>}
        {shift.publicNote ? <p className="mt-2 text-xs text-graphite-600">公开备注：{shift.publicNote}</p> : null}
        {audience === "manager" && shift.internalNote ? <p className="mt-2 text-xs text-graphite-600">内部备注：{shift.internalNote}</p> : null}
      </article>;
    })}</div>
  </Dialog>;
}
function formatDateTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function message(cause: unknown) { return cause instanceof Error ? cause.message : "请稍后重试"; }

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function checkedPeriods(value: unknown, storeId: string, from: string, to: string): RosterPeriod[] {
  if (!Array.isArray(value) || !value.every((row) => record(row)
    && typeof row.id === "string" && row.id.length > 0 && row.storeId === storeId
    && validDate(row.startDate) && validDate(row.endDate)
    && row.startDate <= row.endDate && row.startDate <= to && row.endDate >= from
    && (row.cycleType === "WEEK" || row.cycleType === "FORTNIGHT")
    && (row.status === "DRAFT" || row.status === "PUBLISHED")
    && Number.isInteger(row.version) && Number(row.version) > 0
    && (row.publishedAt === undefined || row.publishedAt === null
      || (typeof row.publishedAt === "string" && Number.isFinite(Date.parse(row.publishedAt)))))
    || new Set(value.map((row: unknown) => record(row) ? row.id : null)).size !== value.length) {
    throw new Error("排班周期响应不完整或门店日期不一致，请重试");
  }
  return value;
}

function checkedPublications(value: unknown, storeId: string, periodId: string): PublicationSummary[] {
  if (!Array.isArray(value) || !value.every((row) => record(row)
    && typeof row.id === "string" && row.id.length > 0 && row.rosterPeriodId === periodId
    && Number.isInteger(row.revisionNumber) && Number(row.revisionNumber) > 0
    && Number.isInteger(row.periodVersion) && Number(row.periodVersion) > 0
    && typeof row.publishedAt === "string" && Number.isFinite(Date.parse(row.publishedAt))
    && record(row.publishedBy) && typeof row.publishedBy.accountId === "string"
    && typeof row.publishedBy.displayName === "string"
    && record(row.store) && row.store.id === storeId && typeof row.store.name === "string"
    && record(row.period) && row.period.id === periodId && row.period.storeId === storeId
    && typeof row.period.startDate === "string" && typeof row.period.endDate === "string"
    && typeof row.shiftCount === "number" && Number.isFinite(row.shiftCount)
    && typeof row.assignmentCount === "number" && Number.isFinite(row.assignmentCount)
    && typeof row.totalHours === "number" && Number.isFinite(row.totalHours))) {
    throw new Error("发布记录响应不完整或门店周期不一致，请重试");
  }
  return value;
}

function checkedPublicationDetail(value: unknown, storeId: string, periodId: string, publicationId: string,
  audience: "employee" | "manager"): PublicationDetail {
  checkedPublications([value], storeId, periodId);
  if (!record(value) || value.id !== publicationId || !record(value.snapshot)) {
    throw new Error("发布记录详情响应不完整或范围不一致，请重试");
  }
  const snapshot = value.snapshot;
  const zone = snapshot.timezone;
  try {
    if (zone != null) new Intl.DateTimeFormat("en-US", { timeZone: String(zone) });
  } catch {
    throw new Error("发布记录详情的门店时区无效，请重试");
  }
  if (snapshot.schemaVersion !== 1 || (zone != null && typeof zone !== "string")
    || !record(snapshot.store) || snapshot.store.id !== storeId || typeof snapshot.store.name !== "string"
    || !record(snapshot.period) || snapshot.period.id !== periodId || snapshot.period.storeId !== storeId
    || !Array.isArray(snapshot.shifts) || !snapshot.shifts.every((shift: unknown) => record(shift)
      && (shift.storeId === undefined || shift.storeId === storeId)
      && (shift.rosterPeriodId === undefined || shift.rosterPeriodId === periodId)
      && typeof shift.id === "string" && typeof shift.date === "string"
      && typeof shift.startAt === "string" && Number.isFinite(Date.parse(shift.startAt))
      && typeof shift.endAt === "string" && Number.isFinite(Date.parse(shift.endAt))
      && typeof shift.roleNameSnapshot === "string" && typeof shift.roleColorSnapshot === "string"
      && typeof shift.breakMinutes === "number" && Number.isFinite(shift.breakMinutes)
      && Array.isArray(shift.assignments) && shift.assignments.every((assignment: unknown) => record(assignment)
        && typeof assignment.employeeNameSnapshot === "string"
        && (audience === "manager" || (assignment.officialScoreSnapshot == null && assignment.tierSnapshot == null)))
      && (audience === "manager" || shift.internalNote == null))) {
    throw new Error("发布记录详情响应不完整或范围不一致，请重试");
  }
  return value as PublicationDetail;
}
