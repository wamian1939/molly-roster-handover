import { ArrowLeft, ArrowRight, CheckCircle2, FilePenLine, Gauge, GraduationCap, UserRoundCheck, UsersRound } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type KeyboardEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ScoreCard } from "../components/evaluation/ScoreCard";
import { PageContainer } from "../components/layout/PageContainer";
import { MotionList } from "../components/motion/MotionList";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { cx, formatScore } from "../lib/format";
import { employeeTypePresentation } from "../lib/presentation";
import { evaluationRepository } from "../services/evaluationRepository";
import type { EmployeeType, StoreEvaluationRosterResponse } from "../types/evaluation";

type LandingData = {
  all: StoreEvaluationRosterResponse;
  regular: StoreEvaluationRosterResponse;
  training: StoreEvaluationRosterResponse;
};

export function StoreEmployeeTypeSelectionPage() {
  const { storeId } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [data, setData] = useState<LandingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let active = true;
    setError(null);
    Promise.all([
      evaluationRepository.fetchStoreEvaluations(storeId, { page: 1, pageSize: 1 }),
      evaluationRepository.fetchStoreEvaluations(storeId, { page: 1, pageSize: 1, employeeType: "REGULAR" }),
      evaluationRepository.fetchStoreEvaluations(storeId, { page: 1, pageSize: 1, employeeType: "TRAINING" }),
    ]).then(([all, regular, training]) => {
      if (active) setData({ all, regular, training });
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "无法加载门店员工类型。")
    });
    return () => { active = false; };
  }, [storeId]);

  if (error) return <ErrorState title="门店评价暂不可用" description={error} />;
  if (!data || !storeId) return <LoadingState label="正在加载门店员工类型..." />;

  const store = data.all.store;
  const typeEntries = [
    { employeeType: "REGULAR" as const, data: data.regular },
    { employeeType: "TRAINING" as const, data: data.training },
  ];

  function openType(employeeType: EmployeeType) {
    navigate(typePath(storeId!, employeeType));
  }

  function handleSpace(event: KeyboardEvent<HTMLAnchorElement>, employeeType: EmployeeType) {
    if (event.key !== " ") return;
    event.preventDefault();
    openType(employeeType);
  }

  return (
    <PageContainer>
      <header>
        <Link to="/evaluations" className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-600 hover:text-graphite-950">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 返回评分概览
        </Link>
        <h1 className="mt-4 text-3xl font-semibold text-graphite-950 sm:text-4xl">{store.name}</h1>
        <p className="mt-3 text-sm text-graphite-600">{store.city} / {store.region} / 负责人 {store.managerName}</p>
      </header>

      <MotionList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ScoreCard label="员工" value={data.all.summary.totalEmployees} detail={`正式 ${data.regular.summary.totalEmployees} · 培训 ${data.training.summary.totalEmployees}`} icon={UsersRound} tone="blue" />
        <ScoreCard label="已评价" value={data.all.summary.evaluatedEmployees} detail="门店全部员工" icon={CheckCircle2} tone="teal" />
        <ScoreCard label="本轮评分" value={data.all.summary.submittedEmployees} detail="当前轮已提交，可随时更新" icon={FilePenLine} tone="neutral" />
        <ScoreCard label="全部员工平均综合评分" value={data.all.summary.averageScore === null ? "-" : formatScore(data.all.summary.averageScore)} detail="全部员工最近已完成评分" icon={Gauge} tone="amber" />
      </MotionList>

      <section aria-labelledby="employee-type-heading">
        <div>
          <h2 id="employee-type-heading" className="text-xl font-semibold text-graphite-950 sm:text-2xl">选择员工类型</h2>
          <p className="mt-2 text-sm leading-6 text-graphite-600">选择本次要查看和评分的员工类别。</p>
        </div>
        <MotionList className="mt-5 grid gap-4 md:grid-cols-2" itemClassName="h-full">
          {typeEntries.map(({ employeeType, data: typeData }) => {
            const training = employeeType === "TRAINING";
            const Icon = training ? GraduationCap : UserRoundCheck;
            const target = typePath(storeId, employeeType);
            const summary = typeData.summary;
            return (
              <motion.div key={employeeType} className="h-full" whileHover={reduce ? undefined : { y: -4 }} transition={{ duration: reduce ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}>
                <Link
                  to={target}
                  onKeyDown={(event) => handleSpace(event, employeeType)}
                  className={cx(
                    "group relative flex h-full min-h-56 flex-col overflow-hidden rounded-2xl border p-6 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-y-px sm:p-7",
                    training
                      ? "border-brand-300 bg-[radial-gradient(circle_at_86%_10%,rgba(233,178,182,.28),transparent_38%),linear-gradient(145deg,#fff8f8,#ffffff_62%)] hover:border-brand-500 focus-visible:ring-brand-500"
                      : "border-slate-300 bg-[linear-gradient(145deg,#f8fafc,#ffffff_62%)] hover:border-slate-500 focus-visible:ring-slate-600",
                    summary.totalEmployees === 0 && "opacity-80",
                  )}
                  aria-label={`进入${store.name}${employeeTypePresentation[employeeType].label}列表，${summary.totalEmployees} 人`}
                >
                  <div className="flex items-start justify-between gap-5">
                    <span className={cx("flex h-12 w-12 items-center justify-center rounded-xl", training ? "bg-brand-100 text-brand-900 ring-1 ring-brand-300" : "bg-slate-200 text-slate-900 ring-1 ring-slate-300")}>
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <ArrowRight className={cx("h-5 w-5 transition-transform duration-200 group-hover:translate-x-1", training ? "text-brand-800" : "text-slate-700")} aria-hidden="true" />
                  </div>
                  <div className="mt-7">
                    <h3 className={cx("text-xl font-semibold", training ? "text-brand-950" : "text-slate-950")}>{employeeTypePresentation[employeeType].label}</h3>
                    <p className="mt-2 text-4xl font-semibold tracking-[-0.04em] tabular-nums text-graphite-950">{summary.totalEmployees}<span className="ml-2 text-sm font-semibold tracking-normal text-graphite-500">人</span></p>
                    <p className={cx("mt-3 text-sm leading-6", training ? "text-brand-900" : "text-slate-700")}>{employeeTypePresentation[employeeType].description}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2 pt-6 text-xs font-semibold">
                    <span className={cx("rounded-lg px-2.5 py-1.5", training ? "bg-white/80 text-brand-900 ring-1 ring-brand-200" : "bg-white text-slate-700 ring-1 ring-slate-200")}>已评价 {summary.evaluatedEmployees}</span>
                    <span className={cx("rounded-lg px-2.5 py-1.5 ring-1", training ? "bg-white/80 text-brand-800 ring-brand-200" : "bg-white text-slate-600 ring-slate-200")}>评分入口始终可用</span>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </MotionList>
      </section>
    </PageContainer>
  );
}

function typePath(storeId: string, employeeType: EmployeeType) {
  return `/evaluations/stores/${encodeURIComponent(storeId)}/employees/${employeeType.toLowerCase()}`;
}
