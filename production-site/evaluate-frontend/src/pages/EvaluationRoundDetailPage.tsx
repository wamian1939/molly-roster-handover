import { ArrowLeft, ChevronRight, FilePenLine, LockKeyhole, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EmployeeTypeBadge } from "../components/badges/EmployeeTypeBadge";
import { HistoricalIdentityNote } from "../components/badges/HistoricalIdentityNote";
import { StoreJobTags } from "../components/badges/StoreJobTag";
import { PageContainer } from "../components/layout/PageContainer";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { Dialog } from "../components/ui/Dialog";
import { InlineSpinner, useToast } from "../components/ui/ToastProvider";
import { formatDate, formatScore } from "../lib/format";
import { mutationErrorMessage } from "../lib/mutationFeedback";
import { resolveEvaluationBackTarget, withEvaluationNavigation } from "../lib/evaluationNavigation";
import { evaluationRepository } from "../services/evaluationRepository";
import type { EvaluationRoundAggregate, EvaluationRoundEvaluator } from "../types/evaluation";

export function EvaluationRoundDetailPage() {
  const { user } = useAuth();
  const { roundId } = useParams();
  const location = useLocation();
  const { showToast } = useToast();
  const closingRef = useRef(false);
  const [round, setRound] = useState<EvaluationRoundAggregate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  useEffect(() => {
    if (!roundId) return;
    let active = true;
    const request = user?.role === "ADMIN"
      ? evaluationRepository.fetchEvaluationRoundAggregate(roundId)
      : evaluationRepository.fetchEvaluationRound(roundId);
    request
      .then((value) => { if (active) setRound(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "无法加载评价汇总。"); });
    return () => { active = false; };
  }, [roundId, user?.role]);

  const closeRound = async () => {
    if (!roundId || closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setCloseError(null);
    try {
      setRound(await evaluationRepository.closeEvaluationRound(roundId));
      setConfirmClose(false);
      showToast({ tone: "success", title: "本轮评价已结束", description: "当前评分已冻结并计入历史。" });
    } catch (reason) {
      const message = mutationErrorMessage(reason, "无法结束本轮评价，本轮仍保持进行中。");
      setCloseError(message);
      showToast({ tone: "error", title: "本轮结束失败", description: message, durationMs: 4000 });
    } finally {
      closingRef.current = false;
      setClosing(false);
    }
  };

  if (error) return <ErrorState title="评价汇总暂不可用" description={error} />;
  if (!round) return <LoadingState label="正在加载本轮评价汇总" />;

  const provisional = round.aggregateStatus === "PROVISIONAL";
  const backTarget = resolveEvaluationBackTarget({
    search: location.search,
    state: location.state,
    storeId: round.store.id,
    employeeType: round.employeeTypeSnapshot,
  });

  return (
    <PageContainer>
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link to={backTarget.path} className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-2 text-sm font-semibold text-graphite-600 hover:text-graphite-950">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {backTarget.label}
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.035em] text-graphite-950">{round.employee.displayName}</h1>
            <EmployeeTypeBadge employeeType={round.employeeTypeSnapshot} size="prominent" />
            <span className="rounded-lg bg-graphite-100 px-2.5 py-1 text-xs font-semibold text-graphite-700 transition-colors motion-reduce:transition-none">{round.status === "OPEN" ? "进行中" : "已结束"}</span>
          </div>
          {round.status === "CLOSED" ? <HistoricalIdentityNote sources={round.identitySources} className="mt-2 max-w-2xl" /> : null}
          <p className="mt-2 text-sm font-semibold text-graphite-800">本轮汇总</p>
          {round.status === "CLOSED" ? <div className="mt-2"><StoreJobTags jobs={round.jobsSnapshot ?? []} limit={4} />{round.jobsSnapshot == null ? <span className="ml-2 text-xs text-graphite-500">旧历史未保存岗位快照</span> : null}</div> : null}
          <p className="mt-1 text-sm text-graphite-600">{round.store.name} · 第 {round.roundNumber ?? 1} 轮 · {round.status === "CLOSED" && round.closedAt ? `结束于 ${formatDate(round.closedAt)}` : `开始于 ${formatDate(round.openedAt ?? round.createdAt)}`}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {round.status === "OPEN" && user?.role === "ADMIN" ? <Link {...withEvaluationNavigation(`/employees/${round.employee.id}/evaluation/v1/new`, location, "round-detail")} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white hover:bg-graphite-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500">
            <FilePenLine className="h-4 w-4" aria-hidden="true" /> {round.myEvaluation ? "再次评分" : "我的评分"}
          </Link> : null}
        {round.status === "OPEN" && user?.role === "ADMIN" ? (
          <button type="button" onClick={() => { setCloseError(null); setConfirmClose(true); }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-graphite-300 bg-white px-4 text-sm font-semibold text-graphite-800 hover:bg-graphite-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500">
            <LockKeyhole className="h-4 w-4" aria-hidden="true" /> 结束本轮评价
          </button>
        ) : null}
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,.75fr)]">
        <div className="rounded-xl bg-graphite-950 p-6 text-white shadow-score">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-sm font-semibold text-graphite-300">{provisional ? "临时综合评分" : "最终综合评分"}</p><p className="mt-3 text-5xl font-semibold tabular-nums tracking-[-0.04em]">{round.aggregateOverall == null ? "暂无" : formatScore(round.aggregateOverall)}</p></div>
            {round.aggregateTier ? <span className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-graphite-950">{round.aggregateTier}</span> : null}
          </div>
          <div className="mt-6 flex items-center gap-2 text-sm text-graphite-300"><UsersRound className="h-4 w-4" aria-hidden="true" /> {round.completedCount} / {round.eligibleCount} 位门店评分账号已评分</div>
        </div>
        <div className="rounded-xl bg-white p-5 ring-1 ring-graphite-200">
          <p className="text-sm font-semibold text-graphite-950">评分分布</p>
          {round.distribution ? <dl className="mt-4 grid grid-cols-3 gap-3"><Metric label="最高" value={formatScore(round.distribution.highest)} /><Metric label="最低" value={formatScore(round.distribution.lowest)} /><Metric label="差值" value={formatScore(round.distribution.spread)} /></dl> : <p className="mt-4 text-sm text-graphite-600">暂无本轮评分。</p>}
        </div>
      </section>

      {user?.role === "ADMIN" ? <section className="flex flex-col gap-3 rounded-xl bg-white p-5 ring-1 ring-graphite-200 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-semibold text-graphite-950">ADMIN 评分</h2><p className="mt-1 text-sm text-graphite-600">独立显示，不进入本轮进度或门店综合平均。</p></div><p className="shrink-0 text-2xl font-semibold tabular-nums text-graphite-950">{round.adminEvaluation?.overallScore == null ? "未评分" : formatScore(round.adminEvaluation.overallScore)}</p></section> : null}

      {round.itemAverages ? <section className="rounded-xl bg-white p-5 ring-1 ring-graphite-200">
        <h2 className="text-lg font-semibold text-graphite-950">小项目平均分</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-graphite-600">按本轮已提交的 {round.itemAverages.submittedEvaluatorCount} 位门店评分账号计算，未评分账号不按 0 分。该轮固定使用{round.employeeTypeSnapshot === "TRAINING" ? "培训员工" : "正式员工"}评分标准；技能类别显示平均掌握率。</p>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <ComponentMetric label="技能总分" item={round.itemAverages.components.skill} />
          <ComponentMetric label="速度" item={round.itemAverages.components.speed} />
          <ComponentMetric label="眼里有活" item={round.itemAverages.components.initiative} />
          <ComponentMetric label="态度" item={round.itemAverages.components.attitude} />
          <ComponentMetric label="报班自由度" item={round.itemAverages.components.availability} />
          <ComponentMetric label="文本" item={round.itemAverages.components.text} />
        </div>
        <div className="mt-4 border-t border-graphite-100 pt-4"><p className="text-sm font-semibold text-graphite-800">技能类别平均掌握率</p><div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4"><ComponentMetric label="后厨" item={round.itemAverages.categories.backOfHouse} /><ComponentMetric label="水吧" item={round.itemAverages.categories.waterBar} /><ComponentMetric label="前场" item={round.itemAverages.categories.frontOfHouse} /><ComponentMetric label="操作能力" item={round.itemAverages.categories.operations} /></div></div>
      </section> : null}

      {user?.role === "ADMIN" ? <section>
        <div className="mb-4"><h2 className="text-xl font-semibold text-graphite-950">分管账号最新评分</h2><p className="mt-1 text-sm text-graphite-600">同一账号在本轮进行中重复提交时只保留最新评分。</p></div>
        <div className="overflow-hidden rounded-xl bg-white ring-1 ring-graphite-200">{round.evaluators.map((evaluator) => <EvaluatorRow key={evaluator.membershipId} evaluator={evaluator} location={location} />)}</div>
      </section> : null}

      {confirmClose ? <Dialog titleId="close-round-title" onClose={() => setConfirmClose(false)} closeDisabled={closing} className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl"><h2 id="close-round-title" className="text-xl font-semibold text-graphite-950">确认结束本轮评价？</h2><div className="mt-4 space-y-2 rounded-lg bg-graphite-50 p-4 text-sm text-graphite-700"><p>当前完成：{round.completedCount} / {round.eligibleCount}</p><p>未评分：{round.evaluators.filter((item) => item.status === "NotSubmitted").map((item) => item.evaluatorDisplayName).join("、") || "无"}</p><p>当前门店综合：{round.aggregateOverall == null ? "暂无" : formatScore(round.aggregateOverall)}</p></div><p className="mt-3 text-sm leading-6 text-graphite-600">结束后，本轮所有评分将冻结并计入历史。之后的新评分会自动进入下一轮。</p>{closeError ? <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800" role="alert">{closeError}</p> : null}<div className="mt-6 flex justify-end gap-3"><button type="button" disabled={closing} onClick={() => setConfirmClose(false)} className="min-h-11 rounded-lg px-4 text-sm font-semibold text-graphite-700 hover:bg-graphite-100">取消</button><button type="button" disabled={closing} aria-busy={closing} onClick={() => void closeRound()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white hover:bg-graphite-800 disabled:cursor-not-allowed disabled:opacity-60">{closing ? <InlineSpinner /> : null}{closing ? "正在结束…" : "结束本轮"}</button></div></Dialog> : null}
    </PageContainer>
  );
}

function EvaluatorRow({ evaluator, location }: { evaluator: EvaluationRoundEvaluator; location: ReturnType<typeof useLocation> }) {
  const evaluation = evaluator.evaluation;
  const content = <><div><p className="font-semibold text-graphite-950">{evaluator.evaluatorDisplayName}</p><p className="mt-1 text-xs text-graphite-500">{evaluator.status === "Submitted" ? `最后更新 ${evaluation?.submittedAt ? formatDate(evaluation.submittedAt) : ""}` : "未评分"}</p></div><div className="flex items-center gap-4"><div className="text-right"><p className="font-semibold tabular-nums text-graphite-950">{evaluation?.overallScore == null ? "-" : formatScore(evaluation.overallScore)}</p><p className="text-xs text-graphite-500">{evaluation?.tier ?? ""}</p></div>{evaluation ? <ChevronRight className="h-4 w-4 text-graphite-400" aria-hidden="true" /> : null}</div></>;
  if (!evaluation) return <article className="flex items-center justify-between gap-4 border-b border-graphite-100 px-5 py-4 last:border-b-0">{content}</article>;
  const target = withEvaluationNavigation(`/evaluations/v1/${evaluation.id}`, location, "round-detail");
  return <Link to={target.to} state={target.state} className="flex items-center justify-between gap-4 border-b border-graphite-100 px-5 py-4 hover:bg-graphite-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-graphite-500 last:border-b-0">{content}</Link>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-graphite-500">{label}</dt><dd className="mt-1 font-semibold tabular-nums text-graphite-950">{value}</dd></div>; }
function ComponentMetric({ label, item }: { label: string; item: { average: number | null; maximum: number; unit: "points" | "percent" } }) { return <div className="flex min-h-[5.25rem] min-w-0 flex-col justify-between rounded-lg bg-graphite-50 px-3.5 py-3"><p className="text-xs font-semibold leading-5 text-graphite-600">{label} 平均分</p><p className="mt-1.5 whitespace-nowrap text-lg font-semibold tabular-nums text-graphite-950">{item.average == null ? "—" : formatScore(item.average)} <span className="text-sm text-graphite-500">/ {item.maximum}{item.unit === "percent" ? "%" : ""}</span></p></div>; }
