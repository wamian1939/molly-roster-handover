import { Activity, BarChart3, Gauge, Target, UsersRound } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "../auth/AuthContext";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ScoreCard } from "../components/evaluation/ScoreCard";
import { PageContainer } from "../components/layout/PageContainer";
import { MotionCard } from "../components/motion/MotionCard";
import { MotionList } from "../components/motion/MotionList";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { SectionHeader } from "../components/ui/SectionHeader";
import { AppSelect } from "../components/ui/AppSelect";
import { EmployeeTypeBadge } from "../components/badges/EmployeeTypeBadge";
import { formatScore } from "../lib/format";
import { categoryLabels } from "../lib/presentation";
import { evaluationRepository } from "../services/evaluationRepository";
import type { AnalyticsV1Data, EmployeeMovementV1 } from "../types/analyticsV1";
import type { EmployeeType } from "../types/evaluation";

const dimensionLabels = { speed: "速度", initiative: "眼里有活", attitude: "态度", availability: "报班自由度" };

export function EvaluationAnalyticsPage() {
  const { user, selectedStoreId, selectStore } = useAuth();
  const [storeId, setStoreId] = useState(selectedStoreId ?? "all");
  const [employeeType, setEmployeeType] = useState<EmployeeType | "all">("all");
  const [data, setData] = useState<AnalyticsV1Data | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => { if (selectedStoreId) setStoreId(selectedStoreId); }, [selectedStoreId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    evaluationRepository.fetchAnalytics(storeId === "all" ? undefined : storeId, employeeType === "all" ? undefined : employeeType)
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "无法加载数据分析。"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [employeeType, storeId]);

  if (isLoading && !data) return <LoadingState label="正在加载数据分析..." />;
  if (error) return <ErrorState title="数据分析暂不可用" description={error} />;
  if (!data) return null;

  return (
    <PageContainer>
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-sm font-medium text-signal-teal">评价数据</p><h1 className="mt-2 text-3xl font-semibold text-graphite-950 sm:text-4xl">团队表现分析</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-graphite-600">当前指标使用每名员工最近一个有效轮次的综合结果；趋势按轮次结束时间展示。</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {user?.role === "ADMIN" || (user?.stores?.length ?? 0) > 1 ? <StoreFilter stores={data.stores} value={storeId} onChange={(value) => { setStoreId(value); if (value !== "all") selectStore(value); }} /> : null}
          <AppSelect label="员工类型" value={employeeType} onValueChange={(value) => setEmployeeType(value as EmployeeType | "all")} className="min-w-48" options={[{ value: "all", label: "全部类型" }, { value: "REGULAR", label: "正式员工" }, { value: "TRAINING", label: "培训员工" }]} />
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-graphite-200 bg-white px-4 py-3">
        <span className="text-sm font-semibold text-graphite-700">当前分析：</span>
        {employeeType === "all" ? <span className="text-sm font-semibold text-graphite-950">全部员工</span> : <EmployeeTypeBadge employeeType={employeeType} />}
      </div>

      <MotionList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard label="平均综合评分" value={value(data.summary.averageScore)} detail={`${data.summary.evaluatedEmployees} 名员工已评价`} icon={Gauge} tone="blue" />
        <ScoreCard label="评价覆盖" value={data.summary.employees === 0 ? "暂无员工" : ratio(data.summary.evaluationCoverage)} detail={employeeCountDetail(data.summary.evaluatedEmployees, data.summary.employees)} icon={UsersRound} tone="teal" />
        <ScoreCard label="相对薄弱项" value={data.weakestDimension ? dimensionLabels[data.weakestDimension.dimension] : "数据不足"} detail={data.weakestDimension ? `${data.weakestDimension.average.toFixed(1)} / 5 · ${data.weakestDimension.sampleSize} 人` : "暂无已完成评分"} icon={Target} tone="amber" />
        <ScoreCard label="技能画像" value={profileCount(data.skillProfiles.initializedEmployees, data.skillProfiles.totalEmployees)} detail="完整的当前技能画像" icon={BarChart3} tone="neutral" />
      </MotionList>

      <section className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <MotionCard className="p-5" interactive={false}>
          <SectionHeader title="人工评分" description="每名员工最近一个有效轮次中各评分人的原始评分聚合值。" />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {data.averageRatings.map((rating) => (
              <div key={rating.dimension} className="rounded-lg bg-graphite-50 p-4">
                <div className="flex items-center justify-between gap-3"><p className="font-semibold text-graphite-950">{dimensionLabels[rating.dimension]}</p><span className="text-lg font-semibold tabular-nums text-graphite-950">{rating.average == null ? "-" : `${rating.average.toFixed(1)} / 5`}</span></div>
                <div className="mt-3 h-2 rounded-full bg-white"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${rating.average == null ? 0 : rating.average * 20}%` }} /></div>
                <p className="mt-2 text-xs text-graphite-500">基于 {rating.sampleSize} 名员工的最近评价</p>
              </div>
            ))}
          </div>
        </MotionCard>
        <MotionCard className="p-5" interactive={false}>
          <SectionHeader title="Tier 分布" description="当前已评价员工分布。" />
          <div className="mt-5 space-y-4">{data.tierDistribution.map((item) => <div key={item.tier} className="grid grid-cols-[36px_1fr_auto] items-center gap-3"><span className="font-bold text-graphite-950">{item.tier}</span><div className="h-2 overflow-hidden rounded-full bg-graphite-100"><motion.div className="motion-progress-fill h-2 rounded-full bg-gradient-to-r from-signal-teal to-sky-500" initial={false} animate={{ scaleX: item.percentage / 100 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 150, damping: 24 }} /></div><span className="text-sm tabular-nums text-graphite-600">{item.count} · {item.percentage}%</span></div>)}</div>
        </MotionCard>
      </section>

      <MotionCard className="p-5" interactive={false}>
        <SectionHeader title="各岗位技能覆盖" description={`可独立包含“可独立”和“熟练”。未确认数据不进入覆盖率分母；完整画像 ${profileCount(data.skillProfiles.initializedEmployees, data.skillProfiles.totalEmployees)}。`} />
        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[760px] w-full divide-y divide-graphite-200">
            <thead><tr><Header label="技能" /><Header label="分类" /><Header label="可独立 / 已确认" /><Header label="技能覆盖" /><Header label="数据完整度" /></tr></thead>
            <tbody className="divide-y divide-graphite-100">{data.skillCoverage.map((skill) => <tr key={skill.skillDefinitionId}><td className="py-3 pr-4"><p className="font-semibold text-graphite-950">{skill.skillNameZh}</p></td><td className="px-4 py-3 text-sm text-graphite-600">{categoryLabel(skill.category)}</td><td className="px-4 py-3 text-sm tabular-nums text-graphite-700">{knownCoverageCount(skill.qualifiedEmployees, skill.knownEmployees)}</td><td className="px-4 py-3 font-semibold tabular-nums text-graphite-950">{nullableRatio(skill.coverage)}</td><td className="pl-4 py-3 text-sm tabular-nums text-graphite-600">{profileCompletion(skill.knownEmployees, skill.totalEmployees, skill.profileCompletion)}</td></tr>)}</tbody>
          </table>
        </div>
      </MotionCard>

      <section className="grid gap-6 xl:grid-cols-[360px_1fr]">
        <MotionCard className="p-5" interactive={false}>
          <SectionHeader title="分类覆盖" description="各分类中生效技能已确认覆盖率的简单平均。" />
          <div className="mt-5 space-y-3">{data.categoryCoverage.map((category) => <div key={category.category} className="rounded-lg bg-graphite-50 p-4"><div className="flex justify-between gap-3"><span className="font-semibold text-graphite-950">{categoryLabel(category.category)}</span><span className="font-semibold tabular-nums text-graphite-950">{nullableRatio(category.coverage)}</span></div><p className="mt-2 text-xs text-graphite-500">{category.activeSkills} 项生效技能</p></div>)}</div>
        </MotionCard>
        <MotionCard className="p-5" interactive={false}>
          <SectionHeader title="每月完成评价平均分" description="按当月完成的评价计算已保存综合评分均值，不代表该月月末团队当前评分。" action={<Activity className="h-5 w-5 text-signal-teal" aria-hidden="true" />} />
          <div className="mt-5 h-72">{data.scoreTrend.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data.scoreTrend} margin={{ top: 8, right: 18, left: -16, bottom: 0 }}><CartesianGrid stroke="#e8ebee" vertical={false} /><XAxis dataKey="month" tickFormatter={monthLabel} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} /><Tooltip labelFormatter={monthLabel} animationDuration={180} /><Line type="monotone" dataKey="averageCompletedEvaluationScore" name="平均综合评分" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4 }} animationDuration={reduce ? 0 : 760} animationEasing="ease-out" /></LineChart></ResponsiveContainer> : <p className="rounded-lg bg-graphite-50 p-4 text-sm text-graphite-600">跨多个日期完成评价后会显示趋势。</p>}</div>
        </MotionCard>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <MovementPanel title="进步最多" description="最近轮次综合评分减去上一轮综合评分。" people={data.mostImproved} />
        <MovementPanel title="评分下降" description="综合评分较上一次评价下降。" people={data.scoreDecreased} />
      </section>

      <MotionCard className="p-5" interactive={false}>
        <SectionHeader title="当前已评价员工" description="每名在职员工只展示最近一个有效轮次的综合结果。" />
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.employees.map((employee) => <Link key={employee.employeeId} to={`/employees/${employee.employeeId}`} className="flex items-center justify-between gap-3 rounded-lg bg-graphite-50 p-4 hover:bg-graphite-100"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-graphite-950">{employee.employeeName}</p><EmployeeTypeBadge employeeType={employee.employeeType} /></div><p className="mt-1 text-xs text-graphite-500">{employee.storeName} / 技能覆盖 {nullableRatio(employee.skillCoverage)}</p></div><span className="font-semibold tabular-nums text-graphite-950">{formatScore(employee.overallScore)} · {employee.tier}</span></Link>)}</div>
      </MotionCard>
    </PageContainer>
  );
}

function MovementPanel({ title, description, people }: { title: string; description: string; people: EmployeeMovementV1[] }) { return <MotionCard className="p-5" interactive={false}><SectionHeader title={title} description={description} /><div className="mt-5 space-y-3">{people.map((person) => <Link key={person.employeeId} to={`/employees/${person.employeeId}`} className="flex items-center justify-between gap-4 rounded-lg bg-graphite-50 p-4 hover:bg-graphite-100"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-graphite-950">{person.employeeName}</p><EmployeeTypeBadge employeeType={person.employeeType} /></div><p className="mt-1 text-xs text-graphite-500">{person.storeName} · {formatScore(person.previousScore)} 至 {formatScore(person.latestScore)}</p></div><span className={`font-semibold tabular-nums ${person.delta >= 0 ? "text-emerald-700" : "text-amber-700"}`}>{person.delta > 0 ? "+" : ""}{person.delta.toFixed(1)}</span></Link>)}{people.length === 0 ? <p className="rounded-lg bg-graphite-50 p-4 text-sm text-graphite-600">暂无符合条件的最近变化。</p> : null}</div></MotionCard>; }
function StoreFilter({ stores, value, onChange }: { stores: Array<{ id: string; name: string }>; value: string; onChange: (value: string) => void }) { return <AppSelect label="门店" value={value} onValueChange={onChange} className="min-w-48" options={[{ value: "all", label: "全部门店" }, ...stores.map((store) => ({ value: store.id, label: store.name }))]} />; }
function Header({ label }: { label: string }) { return <th className="py-3 pr-4 text-left text-xs font-semibold uppercase text-graphite-500">{label}</th>; }
function value(score: number | null) { return score == null ? "-" : formatScore(score); }
function ratio(value: number) { return `${Math.round(value * 1000) / 10}%`; }
function nullableRatio(value: number | null) { return value == null ? "未确认" : ratio(value); }
function employeeCountDetail(evaluated: number, total: number) { return total === 0 ? "当前门店暂无在职员工" : `${evaluated} / ${total} 名在职员工`; }
function profileCount(initialized: number, total: number) { return total === 0 ? "暂无员工" : `${initialized} / ${total}`; }
function knownCoverageCount(qualified: number, known: number) { return known === 0 ? "暂无确认" : `${qualified} / ${known}`; }
function profileCompletion(known: number, total: number, completion: number) { return total === 0 ? "暂无员工" : `${known} / ${total} (${ratio(completion)})`; }
function categoryLabel(category: string) { return categoryLabels[category] ?? category; }
function monthLabel(value: ReactNode) { if (typeof value !== "string") return String(value ?? ""); const [year, month] = value.split("-").map(Number); return new Intl.DateTimeFormat("en-AU", { month: "short", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1))); }
