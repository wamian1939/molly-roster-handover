import { ArrowRight, FileClock, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EmployeeTypeBadge } from "../components/badges/EmployeeTypeBadge";
import { HistoricalIdentityNote } from "../components/badges/HistoricalIdentityNote";
import { StoreJobTags } from "../components/badges/StoreJobTag";
import { PageContainer } from "../components/layout/PageContainer";
import { AppSelect } from "../components/ui/AppSelect";
import { formatDateTime, formatScore } from "../lib/format";
import { withEvaluationNavigation } from "../lib/evaluationNavigation";
import { employeeRepository } from "../services/employeeRepository";
import { evaluationRepository } from "../services/evaluationRepository";
import type { Employee, EvaluationHistoryResponse, Store, StoreJob, TierV1 } from "../types/evaluation";

const emptyData: EvaluationHistoryResponse = { items: [], page: 1, pageSize: 25, total: 0, totalPages: 1 };

export function EvaluationHistoryIndexPage() {
  const { user, selectedStoreId, selectStore } = useAuth();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(emptyData);
  const [stores, setStores] = useState<Store[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [jobs, setJobs] = useState<StoreJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const storeId = params.get("storeId") ?? selectedStoreId ?? "all";
  const employeeType = params.get("employeeType") ?? "all";
  const employeeId = params.get("employeeId") ?? "all";
  const tier = params.get("tier") ?? "all";
  const jobId = params.get("jobId") ?? "all";
  const dateFrom = params.get("dateFrom") ?? "";
  const dateTo = params.get("dateTo") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? 1) || 1);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === "all") next.delete(key); else next.set(key, value);
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
    if (key === "storeId" && value !== "all") selectStore(value);
  };

  const load = useCallback(async () => {
    setIsLoading(true); setLoadError(null);
    try {
      const scopedStore = storeId === "all" ? undefined : storeId;
      const [history, accessibleStores, jobOptions, employeePage] = await Promise.all([
        evaluationRepository.fetchHistoryIndex({ storeId: scopedStore, employeeType: employeeType === "all" ? undefined : employeeType, employeeId: employeeId === "all" ? undefined : employeeId, tier: tier === "all" ? undefined : tier, jobId: jobId === "all" ? undefined : jobId, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined, page, pageSize: 25 }),
        evaluationRepository.fetchStores(),
        employeeRepository.fetchStoreJobs(scopedStore),
        employeeRepository.fetchEmployees({ storeId: scopedStore, pageSize: 100 }),
      ]);
      setData(history); setStores(accessibleStores); setJobs(jobOptions); setEmployees(employeePage.items);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "无法加载评价历史。"); }
    finally { setIsLoading(false); }
  }, [storeId, employeeType, employeeId, tier, jobId, dateFrom, dateTo, page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (isLoading) return;
    const savedScroll = window.sessionStorage.getItem("evaluation-history-scroll");
    if (!savedScroll) return;
    window.sessionStorage.removeItem("evaluation-history-scroll");
    const y = Number(savedScroll);
    if (Number.isFinite(y) && typeof window.scrollTo === "function") {
      window.requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
    }
  }, [isLoading]);

  return <PageContainer>
    <header><p className="text-sm font-medium text-signal-teal">评价历史</p><h1 className="mt-2 text-3xl font-semibold text-graphite-950 sm:text-4xl">已结束轮次</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-graphite-600">这里只展示已结束轮次的正式结果。旧轮次若缺少结轮名称快照，会标明显示名称的来源；进行中的评分不会进入历史。</p></header>
    <section className="grid gap-3 rounded-xl bg-white p-4 ring-1 ring-graphite-200 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7" aria-label="历史筛选">
      {(user?.role === "ADMIN" || (user?.stores.length ?? 0) > 1) ? <AppSelect label="门店" value={storeId} onValueChange={(value) => update("storeId", value)} options={[{ value: "all", label: "全部可管理门店" }, ...stores.map((store) => ({ value: store.id, label: store.name }))]} /> : null}
      <AppSelect label="员工类型" value={employeeType} onValueChange={(value) => update("employeeType", value)} options={[{value:"all",label:"全部类型"},{value:"REGULAR",label:"正式员工"},{value:"TRAINING",label:"培训员工"}]} />
      <AppSelect label="员工" value={employeeId} onValueChange={(value) => update("employeeId", value)} options={[{value:"all",label:"全部员工"},...employees.map((employee)=>({value:employee.id,label:employee.displayName}))]} />
      <AppSelect label="Tier" value={tier} onValueChange={(value) => update("tier", value)} options={[{value:"all",label:"全部 Tier"},...(["T1","T2","T3","T4","T5"] as TierV1[]).map((value)=>({value,label:value}))]} />
      <AppSelect label="岗位快照" value={jobId} onValueChange={(value) => update("jobId", value)} options={[{value:"all",label:"全部岗位"},...jobs.map((job)=>({value:job.id,label:`${stores.find((store)=>store.id===job.storeId)?.name ?? ""} · ${job.name}`}))]} />
      <DateFilter label="开始日期" value={dateFrom} onChange={(value) => update("dateFrom", value)} /><DateFilter label="结束日期" value={dateTo} onChange={(value) => update("dateTo", value)} />
    </section>
    {isLoading ? <HistorySkeleton /> : loadError ? <section className="rounded-xl bg-white p-6 ring-1 ring-red-200" role="alert"><h2 className="font-semibold text-graphite-950">评价历史暂不可用</h2><p className="mt-2 text-sm text-red-700">{loadError}</p><button type="button" onClick={() => void load()} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" />重试</button></section> : data.items.length === 0 ? <section className="flex items-start gap-3 rounded-xl border border-dashed border-graphite-300 bg-white px-5 py-10"><FileClock className="mt-0.5 h-5 w-5 text-graphite-400" /><div><h2 className="font-semibold text-graphite-900">暂无已结束的评价轮次</h2><p className="mt-1 text-sm text-graphite-600">只有管理员结束本轮后，评价才会进入历史。也可以调整上方筛选条件。</p></div></section> : <HistoryResults data={data} location={location} isAdmin={user?.role === "ADMIN"} />}
    {!isLoading && !loadError && data.total > 0 ? <footer className="flex items-center justify-between text-sm text-graphite-600"><span>共 {data.total} 个已结束轮次</span><div className="flex gap-2"><button type="button" disabled={page <= 1} onClick={() => update("page", String(page - 1))} className="min-h-11 rounded-lg border border-graphite-200 px-3 disabled:opacity-40">上一页</button><span className="self-center tabular-nums">{data.page} / {data.totalPages}</span><button type="button" disabled={page >= data.totalPages} onClick={() => update("page", String(page + 1))} className="min-h-11 rounded-lg border border-graphite-200 px-3 disabled:opacity-40">下一页</button></div></footer> : null}
  </PageContainer>;
}

function HistoryResults({ data, location, isAdmin }: { data: EvaluationHistoryResponse; location: ReturnType<typeof useLocation>; isAdmin: boolean }) {
  return <>
    <div className="grid gap-3 xl:hidden">{data.items.map((entry) => <HistoryCard key={entry.id} entry={entry} location={location} isAdmin={isAdmin} />)}</div>
    <section className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-graphite-200 xl:block">
      <table className="w-full min-w-[1120px] text-left text-sm">
        <thead className="bg-graphite-50 text-xs font-semibold text-graphite-600"><tr>{["员工", "类型 / 岗位快照", "门店", "轮次", "最终综合", "Tier", "完成进度", "结束时间", "操作"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-graphite-100">{data.items.map((entry) => <tr key={entry.id} className="hover:bg-blue-50/30">
          <td className="px-4 py-3 font-semibold text-graphite-950">{entry.employeeName}<HistoricalIdentityNote sources={entry.identitySources} className="mt-1 max-w-64 font-normal" /></td>
          <td className="px-4 py-3"><EmployeeTypeBadge employeeType={entry.employeeTypeSnapshot} /><div className="mt-2"><SnapshotJobs entry={entry} /></div></td>
          <td className="px-4 py-3 text-graphite-700">{entry.storeName}</td>
          <td className="px-4 py-3 font-semibold">第 {entry.roundNumber ?? 1} 轮</td>
          <td className="px-4 py-3"><span className="font-semibold tabular-nums text-graphite-950">{entry.overallScore == null ? "暂无评分" : `${formatScore(entry.overallScore)} / 100`}</span>{isAdmin && entry.adminScore != null ? <p className="mt-1 text-xs text-graphite-500">ADMIN {formatScore(entry.adminScore)}</p> : null}</td>
          <td className="px-4 py-3"><Tier value={entry.tier} /></td>
          <td className="px-4 py-3 font-semibold tabular-nums">{entry.completedCount ?? 0} / {entry.eligibleCount ?? 0}</td>
          <td className="px-4 py-3 text-graphite-700">{formatDateTime(entry.closedAt ?? entry.completedAt)}</td>
          <td className="px-4 py-3"><HistoryLink id={entry.roundId ?? entry.id} location={location} /></td>
        </tr>)}</tbody>
      </table>
    </section>
  </>;
}
function HistoryCard({ entry, location, isAdmin }: { entry: EvaluationHistoryResponse["items"][number]; location: ReturnType<typeof useLocation>; isAdmin: boolean }) {
  return <article className="rounded-xl bg-white p-4 ring-1 ring-graphite-200">
    <div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-graphite-950">{entry.employeeName}</h2><p className="mt-1 text-xs text-graphite-500">{entry.storeName} · 第 {entry.roundNumber ?? 1} 轮</p></div><Tier value={entry.tier} /></div>
    <HistoricalIdentityNote sources={entry.identitySources} className="mt-2" />
    <div className="mt-3 flex flex-wrap items-center gap-2"><EmployeeTypeBadge employeeType={entry.employeeTypeSnapshot} /><SnapshotJobs entry={entry} /></div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><Metric label="最终综合" value={entry.overallScore == null ? "暂无评分" : `${formatScore(entry.overallScore)} / 100`} /><Metric label="完成进度" value={`${entry.completedCount ?? 0} / ${entry.eligibleCount ?? 0}`} />{isAdmin && entry.adminScore != null ? <Metric label="ADMIN 评分" value={formatScore(entry.adminScore)} /> : null}<Metric label="结束时间" value={formatDateTime(entry.closedAt ?? entry.completedAt)} /></dl>
    <div className="mt-4 flex justify-end border-t border-graphite-100 pt-3"><HistoryLink id={entry.roundId ?? entry.id} location={location} /></div>
  </article>;
}
function SnapshotJobs({entry}:{entry:EvaluationHistoryResponse["items"][number]}) { if(entry.jobsSnapshot===null)return <span className="text-xs text-graphite-500">旧历史未保存岗位快照</span>; return <StoreJobTags jobs={entry.jobsSnapshot ?? []}/>; }
function HistoryLink({ id, location }: { id: string; location: ReturnType<typeof useLocation> }) { const target=withEvaluationNavigation(`/evaluation-rounds/${id}`,location,"evaluation-history"); return <Link to={target.to} state={target.state} onClick={() => window.sessionStorage.setItem("evaluation-history-scroll", String(window.scrollY))} className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-graphite-950 px-3 text-xs font-semibold text-white">查看详情<ArrowRight className="h-3.5 w-3.5"/></Link>; }
function Tier({value}:{value:TierV1|null}) { return value ? <span className="inline-flex rounded-md bg-graphite-950 px-2 py-1 text-xs font-bold text-white">{value}</span> : <span className="text-xs text-graphite-400">—</span>; }
function Metric({label,value}:{label:string;value:string}) { return <div className="rounded-lg bg-graphite-50 p-3"><dt className="text-xs text-graphite-500">{label}</dt><dd className="mt-1 font-semibold text-graphite-900">{value}</dd></div>; }
function DateFilter({label,value,onChange}:{label:string;value:string;onChange:(value:string)=>void}) { return <label className="text-sm font-medium text-graphite-700">{label}<input type="date" value={value} onChange={(event)=>onChange(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-graphite-200 px-3 text-sm"/></label>; }
function HistorySkeleton() { return <section className="space-y-2 rounded-xl bg-white p-4 ring-1 ring-graphite-200" aria-label="正在加载评价历史">{Array.from({length:6},(_,index)=><div key={index} className="h-14 animate-pulse rounded-lg bg-graphite-100 motion-reduce:animate-none"/>)}</section>; }
