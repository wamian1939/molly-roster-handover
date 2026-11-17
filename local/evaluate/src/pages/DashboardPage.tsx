import { ArrowRight, Award, CheckCircle2, Gauge, GraduationCap, UserRoundPlus, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ScoreCard } from "../components/evaluation/ScoreCard";
import { PageContainer } from "../components/layout/PageContainer";
import { MotionCard } from "../components/motion/MotionCard";
import { MotionList } from "../components/motion/MotionList";
import { EmptyState } from "../components/states/EmptyState";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { SectionHeader } from "../components/ui/SectionHeader";
import { AppSelect } from "../components/ui/AppSelect";
import { EmployeeTypeBadge } from "../components/badges/EmployeeTypeBadge";
import { cx, formatScore } from "../lib/format";
import { evaluationRepository } from "../services/evaluationRepository";
import type { DashboardV1Data, EmployeeScoreV1 } from "../types/analyticsV1";

export function DashboardPage() {
  const { user, selectedStoreId, selectStore } = useAuth();
  const [storeId, setStoreId] = useState(selectedStoreId ?? "all");
  const [data, setData] = useState<DashboardV1Data | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => { if (selectedStoreId) setStoreId(selectedStoreId); }, [selectedStoreId]);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    evaluationRepository.fetchDashboard(storeId === "all" ? undefined : storeId)
      .then((result) => { if (active) setData(result); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "无法加载评分概览。"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [storeId]);

  if (isLoading && !data) return <LoadingState label="正在加载评分概览..." />;
  if (error) return <ErrorState title="评分概览暂不可用" description={error} />;
  if (!data) return null;

  const summary = data.summary;
  return (
    <PageContainer>
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-medium text-signal-teal">员工表现</p>
          <h1 className="mt-2 text-3xl font-semibold text-graphite-950 sm:text-4xl">评分概览</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-graphite-600">当前结果使用每名在职员工最近一个有效评价轮次的综合结果。</p>
        </div>
        {user?.role === "ADMIN" || (user?.stores?.length ?? 0) > 1 ? <StoreFilter stores={data.stores} value={storeId} onChange={(value) => { setStoreId(value); if (value !== "all") selectStore(value); }} /> : null}
      </header>

      <StoreScoringLauncher data={data} selectedStoreId={storeId} />

      <MotionList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard label="员工" value={summary.employees} detail={`正式 ${summary.regularEmployees} · 培训 ${summary.trainingEmployees}`} icon={UsersRound} tone="neutral" footer={<EmployeeTypeRatio regular={summary.regularEmployees} training={summary.trainingEmployees} />} />
        <ScoreCard label="已评价" value={summary.employees === 0 ? "暂无员工" : `${summary.evaluatedEmployees} / ${summary.employees}`} detail={summary.employees === 0 ? "当前范围暂无在职员工" : `评价覆盖 ${percent(summary.evaluationCoverage)}`} icon={CheckCircle2} tone="teal" />
        <ScoreCard label="平均综合评分" value={score(summary.averageScore)} detail={`${summary.evaluatedEmployees} 名员工已评价`} icon={Gauge} tone="blue" />
        <ScoreCard label="技能覆盖" value={ratio(summary.averageCurrentSkillCoverage)} detail={`${summary.initializedSkillProfiles} 份完整技能画像`} icon={GraduationCap} tone="amber" />
      </MotionList>

      <section className="grid items-start gap-6 xl:grid-cols-2">
        <MotionCard className="p-5" interactive={false}>
          <SectionHeader title="Tier 分布" description="每名已评价员工最近一个有效轮次的综合 Tier。" />
          <div className="mt-5 space-y-4">
            {data.tierDistribution.map((item) => (
              <div key={item.tier} className="grid grid-cols-[36px_1fr_auto] items-center gap-3">
                <span className="text-sm font-bold text-graphite-950">{item.tier}</span>
                <div className="h-2 overflow-hidden rounded-full bg-graphite-100"><motion.div className="motion-progress-fill h-2 rounded-full bg-gradient-to-r from-blue-600 to-teal-500" initial={false} animate={{ scaleX: item.percentage / 100 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 150, damping: 24 }} /></div>
                <span className="min-w-20 text-right text-sm tabular-nums text-graphite-600">{item.count} · {item.percentage}%</span>
              </div>
            ))}
          </div>
        </MotionCard>

        <MotionCard className="p-5" interactive={false}>
          <SectionHeader title="技能缺口" description={`按已确认技能计算的最低覆盖。完整画像：${summary.employees === 0 ? "暂无员工" : `${summary.initializedSkillProfiles} / ${summary.employees}`}。`} />
          <div className="mt-5 space-y-3">
            {data.skillGaps.map((skill, index) => (
              <div key={skill.skillDefinitionId} className="flex items-center justify-between gap-4 rounded-lg bg-graphite-50 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3"><span className="text-sm font-semibold text-graphite-400">{index + 1}</span><div><p className="font-semibold text-graphite-950">{skill.skillNameZh}</p><p className="mt-1 text-xs text-graphite-500">{skill.qualifiedEmployees} 人可独立 / {skill.knownEmployees} 人已确认</p></div></div>
                <span className="text-lg font-semibold tabular-nums text-graphite-950">{ratio(skill.coverage)}</span>
              </div>
            ))}
            {data.skillGaps.length === 0 ? <EmptyState title="暂无技能数据" description="员工完成首次评价后，这里会显示技能覆盖缺口。" /> : null}
          </div>
        </MotionCard>
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-2">
        <PeoplePanel title="高分员工" description="按最近轮次综合评分排序。" people={data.topEmployees} empty="暂无有效轮次结果。" />
        <MotionCard className="p-5" interactive={false}>
          <SectionHeader title="需要关注" description="符合当前综合评分或技能覆盖关注规则的员工。" />
          <div className="mt-5 space-y-3">
            {data.needsAttention.map((person) => (
              <Link key={person.employeeId} to={`/employees/${person.employeeId}`} className="flex items-center justify-between gap-4 rounded-lg bg-graphite-50 px-4 py-3 hover:bg-graphite-100">
                <div className="min-w-0"><p className="truncate text-sm font-semibold text-graphite-950">{person.employeeName}</p><p className="mt-1 text-xs text-graphite-500">{person.storeName} / {person.reasons.map(reasonLabel).join(" · ")}</p></div>
                <div className="text-right"><p className="font-semibold tabular-nums text-graphite-950">{formatScore(person.overallScore)} · {person.tier}</p>{person.skillCoverage != null ? <p className="mt-1 text-xs text-graphite-500">技能覆盖 {ratio(person.skillCoverage)}</p> : null}</div>
              </Link>
            ))}
            {data.needsAttention.length === 0 ? <p className="rounded-lg bg-graphite-50 p-4 text-sm text-graphite-600">当前没有员工触发关注规则。</p> : null}
          </div>
        </MotionCard>
      </section>

      <MotionCard className="p-5" interactive={false}>
        <SectionHeader title="未评价" description={`${summary.notEvaluatedEmployees} 名在职员工尚无有效轮次结果。`} action={<UserRoundPlus className="h-5 w-5 text-graphite-500" aria-hidden="true" />} />
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.notEvaluatedEmployees.map((employee) => (
            <div key={employee.employeeId} className="flex items-center justify-between gap-3 rounded-lg bg-graphite-50 p-4">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold text-graphite-950">{employee.employeeName}</p><EmployeeTypeBadge employeeType={employee.employeeType} /></div><p className="mt-1 text-xs text-graphite-500">{employee.storeName}</p></div>
              <Link to={scorePath(employee.employeeId)} className="inline-flex min-h-11 items-center whitespace-nowrap rounded-lg bg-graphite-950 px-3 text-xs font-semibold text-white hover:bg-graphite-800">评分</Link>
            </div>
          ))}
          {data.notEvaluatedEmployees.length === 0 ? <p className="text-sm text-graphite-600">所有在职员工都已有有效轮次结果。</p> : null}
        </div>
      </MotionCard>
    </PageContainer>
  );
}

function StoreScoringLauncher({ data, selectedStoreId }: { data: DashboardV1Data; selectedStoreId: string }) {
  const stores = data.stores;

  return (
    <MotionCard className="p-5" interactive={false}>
      <SectionHeader
        title="选择门店开始评分"
        description="先进入门店员工列表，再为该门店员工提交或更新本轮评分。"
        action={<span className="text-xs font-semibold text-graphite-500">{stores.length} 家门店</span>}
      />
      <div className="mt-4 grid gap-3 md:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
        {stores.map((store) => {
          const storeSummary = summarizeStore(data, store.id);
          const isSelected = selectedStoreId === store.id;

          return (
            <Link
              key={store.id}
              to={`/evaluations/stores/${encodeURIComponent(store.id)}`}
              className={cx(
                "group flex min-h-24 items-center justify-between gap-4 rounded-xl border px-4 py-3 transition focus:outline-none focus:ring-2 focus:ring-graphite-950 focus:ring-offset-2",
                isSelected
                  ? "border-graphite-950 bg-graphite-950 text-white"
                  : "border-graphite-200 bg-graphite-50 text-graphite-950 hover:border-graphite-300 hover:bg-white",
              )}
              aria-label={`进入 ${store.name} 门店评分`}
            >
              <div className="min-w-0">
                <p className={cx("truncate text-sm font-semibold", isSelected ? "text-white" : "text-graphite-950")}>{store.name}</p>
                <p className={cx("mt-2 text-xs", isSelected ? "text-graphite-200" : "text-graphite-500")}>
                  {storeSummary.notEvaluated} 人待评分 · {storeSummary.attention} 人需关注
                </p>
                <p className={cx("mt-1 text-xs font-semibold", isSelected ? "text-white" : "text-graphite-700")}>
                  进入门店员工评分
                </p>
              </div>
              <ArrowRight
                className={cx(
                  "h-5 w-5 shrink-0 transition group-hover:translate-x-0.5",
                  isSelected ? "text-white" : "text-graphite-500",
                )}
                aria-hidden="true"
              />
            </Link>
          );
        })}
        {stores.length === 0 ? (
          <p className="rounded-lg bg-graphite-50 p-4 text-sm text-graphite-600">当前账号没有可进入的门店。</p>
        ) : null}
      </div>
    </MotionCard>
  );
}

function PeoplePanel({ title, description, people, empty }: { title: string; description: string; people: EmployeeScoreV1[]; empty: string }) {
  return (
    <MotionCard className="p-5" interactive={false}>
      <SectionHeader title={title} description={description} action={<Award className="h-5 w-5 text-signal-teal" aria-hidden="true" />} />
      <div className="mt-5 space-y-3">
        {people.map((person, index) => (
          <div key={person.employeeId} className="flex items-center justify-between gap-4 rounded-lg bg-graphite-50 px-4 py-3">
            <Link to={`/employees/${person.employeeId}`} className="flex min-w-0 items-center gap-3 hover:text-blue-700">
              <span className="text-sm font-semibold text-graphite-400">{index + 1}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-graphite-950">{person.employeeName}</p>
                <div className="mt-1"><EmployeeTypeBadge employeeType={person.employeeType} /></div>
                <p className="mt-1 text-xs text-graphite-500">{person.storeName}</p>
              </div>
            </Link>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums text-graphite-950">{formatScore(person.overallScore)} · {person.tier}</p>
              <Link to={scorePath(person.employeeId)} className="mt-1 inline-block text-xs font-semibold text-blue-700 hover:underline">评分</Link>
            </div>
          </div>
        ))}
        {people.length === 0 ? <p className="rounded-lg bg-graphite-50 p-4 text-sm text-graphite-600">{empty}</p> : null}
      </div>
    </MotionCard>
  );
}

function StoreFilter({ stores, value, onChange }: { stores: Array<{ id: string; name: string }>; value: string; onChange: (value: string) => void }) {
  return <AppSelect label="门店" value={value} onValueChange={onChange} className="min-w-48" options={[{ value: "all", label: "全部门店" }, ...stores.map((store) => ({ value: store.id, label: store.name }))]} />;
}

function score(value: number | null) { return value == null ? "-" : formatScore(value); }
function ratio(value: number | null) { return value == null ? "暂无数据" : `${Math.round(value * 1000) / 10}%`; }
function percent(value: number) { return `${Math.round(value * 1000) / 10}%`; }
function reasonLabel(reason: "LowOverallScore" | "LowSkillCoverage") { return reason === "LowOverallScore" ? "综合评分较低" : "技能覆盖较低"; }
function scorePath(employeeId: string) { return `/employees/${employeeId}/evaluation/v1/new`; }
function EmployeeTypeRatio({ regular, training }: { regular: number; training: number }) {
  const total = regular + training;
  const regularPercent = total === 0 ? 0 : Math.round((regular / total) * 100);
  const trainingPercent = total === 0 ? 0 : 100 - regularPercent;
  return <div aria-label={`员工构成：正式员工 ${regularPercent}%，培训员工 ${trainingPercent}%`} title={`正式 ${regularPercent}% / 培训 ${trainingPercent}%`}><div className="flex h-1.5 overflow-hidden rounded-full bg-graphite-100"><span className="bg-slate-600" style={{ width: `${regularPercent}%` }} /><span className="bg-brand-400" style={{ width: `${trainingPercent}%` }} /></div></div>;
}
function summarizeStore(data: DashboardV1Data, storeId: string) {
  return {
    notEvaluated: data.notEvaluatedEmployees.filter((employee) => employee.storeId === storeId).length,
    attention: data.needsAttention.filter((employee) => employee.storeId === storeId).length,
  };
}
