import { ArrowLeft, CheckCircle2, FilePenLine, Gauge, SlidersHorizontal, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { EmployeeTypeBadge } from "../components/badges/EmployeeTypeBadge";
import { EmployeeEvaluationTable } from "../components/evaluation/EmployeeEvaluationTable";
import { ScoreCard } from "../components/evaluation/ScoreCard";
import { PageContainer } from "../components/layout/PageContainer";
import { MotionCard } from "../components/motion/MotionCard";
import { MotionList } from "../components/motion/MotionList";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { AppSelect } from "../components/ui/AppSelect";
import { cx, formatScore } from "../lib/format";
import { employeeTypePresentation } from "../lib/presentation";
import { evaluationRepository } from "../services/evaluationRepository";
import type { EmployeeType, StoreEvaluationRosterResponse, StoreEvaluationStatus } from "../types/evaluation";

const defaultPageSize = 25;

export function StoreEvaluationPage({ isAdmin = false }: { isAdmin?: boolean } = {}) {
  const { storeId, employeeType: employeeTypeSlug } = useParams();
  const employeeType = parseEmployeeType(employeeTypeSlug);
  const [data, setData] = useState<StoreEvaluationRosterResponse | null>(null);
  const [typeOverviews, setTypeOverviews] = useState<{ REGULAR: StoreEvaluationRosterResponse; TRAINING: StoreEvaluationRosterResponse } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StoreEvaluationStatus | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setData(null);
    setPage(1);
    setStatus("all");
    setSearch("");
  }, [employeeType, storeId]);

  useEffect(() => {
    if (!storeId || !employeeType) return;
    let active = true;
    Promise.all([
      evaluationRepository.fetchStoreEvaluations(storeId, { page: 1, pageSize: 1, employeeType: "REGULAR" }),
      evaluationRepository.fetchStoreEvaluations(storeId, { page: 1, pageSize: 1, employeeType: "TRAINING" }),
    ]).then(([regular, training]) => {
      if (active) setTypeOverviews({ REGULAR: regular, TRAINING: training });
    }).catch((reason: unknown) => {
      if (active) setLoadError(reason instanceof Error ? reason.message : "无法加载员工类型统计。");
    });
    return () => { active = false; };
  }, [employeeType, storeId]);

  useEffect(() => {
    if (!storeId || !employeeType) return;
    let active = true;
    setIsLoading(true);
    setLoadError(null);
    evaluationRepository.fetchStoreEvaluations(storeId, { page, pageSize: defaultPageSize, status, employeeType, search })
      .then((response) => { if (active) setData(response); })
      .catch((reason: unknown) => { if (active) setLoadError(reason instanceof Error ? reason.message : "无法加载门店评价。"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [employeeType, page, search, status, storeId]);

  if (!employeeType && storeId) return <Navigate to={`/evaluations/stores/${encodeURIComponent(storeId)}`} replace />;
  if (isLoading && !data) return <LoadingState label="正在加载门店员工..." />;
  if (loadError) return <ErrorState title="门店评价暂不可用" description={loadError} />;
  if (!data || !storeId || !employeeType) return <ErrorState title="找不到门店" description="所选门店或员工类型不可用。" />;

  const overview = typeOverviews?.[employeeType] ?? data;
  const presentation = employeeTypePresentation[employeeType];
  const hasFilters = status !== "all" || search.trim().length > 0;

  return (
    <PageContainer>
      <header>
        <Link to={`/evaluations/stores/${encodeURIComponent(storeId)}`} className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-600 hover:text-graphite-950"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> 返回员工类型</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold text-graphite-950 sm:text-4xl">{data.store.name}</h1><EmployeeTypeBadge employeeType={employeeType} size="prominent" /></div>
        <p className="mt-3 text-sm text-graphite-600">{presentation.label}，共 {overview.summary.totalEmployees} 位员工</p>
        <p className="mt-1 text-xs text-graphite-500">{data.store.city} / {data.store.region} / 负责人 {data.store.managerName}</p>
      </header>

      <nav aria-label="切换员工类型" className="flex w-full flex-col gap-2 rounded-xl border border-graphite-200 bg-white p-2 sm:w-fit sm:flex-row">
        {(["REGULAR", "TRAINING"] as const).map((type) => {
          const active = type === employeeType;
          const count = typeOverviews?.[type].summary.totalEmployees;
          return <Link key={type} to={typePath(storeId, type)} aria-current={active ? "page" : undefined} className={cx("flex min-h-11 items-center justify-between gap-3 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1", active ? type === "TRAINING" ? "bg-brand-100 text-brand-900 focus-visible:ring-brand-500" : "bg-slate-800 text-white focus-visible:ring-slate-600" : "text-graphite-600 hover:bg-graphite-50 hover:text-graphite-950")}><span>{employeeTypePresentation[type].label}</span><span className={cx("tabular-nums", active && type === "REGULAR" ? "text-slate-200" : "text-current opacity-70")}>{count ?? "-"}</span></Link>;
        })}
      </nav>

      <MotionList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard label={presentation.label} value={overview.summary.totalEmployees} detail="当前类型在职员工" icon={UsersRound} tone="blue" />
        <ScoreCard label="已评价" value={overview.summary.evaluatedEmployees} detail={`${presentation.label}已完成评分`} icon={CheckCircle2} tone="teal" />
        <ScoreCard label="本轮已评分" value={data.items.filter((row) => row.currentRound?.myEvaluation).length} detail="当前账号已提交的本轮评分" icon={FilePenLine} tone="neutral" />
        <ScoreCard label="平均综合评分" value={overview.summary.averageScore === null ? "-" : formatScore(overview.summary.averageScore)} detail={`${presentation.label}最近已完成评分`} icon={Gauge} tone="amber" />
      </MotionList>

      <MotionCard className="p-4" interactive={false}>
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-graphite-950"><SlidersHorizontal className="h-4 w-4" aria-hidden="true" /> 筛选</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="评分状态" value={status} onChange={(value) => setStatus(value as StoreEvaluationStatus | "all")} options={["all", "Submitted", "Completed", "NotEvaluated"]} labels={{ all: "全部状态", NotEvaluated: "未评分", Submitted: "本轮已评分", Completed: "有历史评分" }} />
          <label className="text-sm font-medium text-graphite-700">搜索<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="员工姓名" className="mt-1 block h-11 w-full rounded-lg border border-graphite-200 bg-white px-3 text-sm font-semibold text-graphite-950 shadow-sm" /></label>
        </div>
      </MotionCard>

      {data.items.length > 0 ? <EmployeeEvaluationTable evaluations={data.items} isAdmin={isAdmin} /> : hasFilters ? <EmptyState title="没有匹配的员工" description="请调整评价状态或搜索条件。" /> : <section className="rounded-2xl border border-dashed border-graphite-300 bg-white px-6 py-12 text-center"><h2 className="text-lg font-semibold text-graphite-950">暂无{presentation.label}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-graphite-600">{employeeType === "TRAINING" ? "该门店当前没有处于培训阶段的员工。" : "该门店当前没有已进入正式岗位的员工。"}</p><Link to="/employees" className="mt-5 inline-flex min-h-11 items-center justify-center rounded-lg border border-graphite-300 bg-white px-4 text-sm font-semibold text-graphite-800 hover:bg-graphite-50">前往员工管理</Link></section>}

      {data.total > 0 ? <PaginationControl page={data.page} pageSize={data.pageSize} total={data.total} totalPages={data.totalPages} onPageChange={setPage} /> : null}
    </PageContainer>
  );
}

function PaginationControl({ page, pageSize, total, totalPages, onPageChange }: { page: number; pageSize: number; total: number; totalPages: number; onPageChange: (page: number) => void }) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return <div className="flex flex-col gap-3 rounded-lg bg-white px-4 py-3 text-sm text-graphite-600 shadow-panel ring-1 ring-graphite-200 sm:flex-row sm:items-center sm:justify-between"><span>显示 {start}-{end}，共 {total} 条</span><div className="flex items-center gap-2"><button type="button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page <= 1} className="min-h-11 rounded-lg border border-graphite-200 px-3 font-semibold disabled:opacity-50">上一页</button><span className="min-w-20 text-center font-semibold text-graphite-950">{page} / {totalPages}</span><button type="button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="min-h-11 rounded-lg border border-graphite-200 px-3 font-semibold disabled:opacity-50">下一页</button></div></div>;
}

function Select({ label, value, onChange, options, labels = {} }: { label: string; value: string; onChange: (value: string) => void; options: string[]; labels?: Record<string, string> }) {
  return <AppSelect label={label} value={value} onValueChange={onChange} options={options.map((option) => ({ value: option, label: labels[option] ?? option }))} />;
}

function parseEmployeeType(value: string | undefined): EmployeeType | null { return value === "regular" ? "REGULAR" : value === "training" ? "TRAINING" : null; }
function typePath(storeId: string, employeeType: EmployeeType) { return `/evaluations/stores/${encodeURIComponent(storeId)}/employees/${employeeType.toLowerCase()}`; }
