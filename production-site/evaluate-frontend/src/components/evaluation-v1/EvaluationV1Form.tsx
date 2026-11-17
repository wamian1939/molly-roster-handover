import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CircleCheck, Send } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { formatDateTime } from "../../lib/format";
import { evaluationRepository, type LiveEvaluationSubmissionPayload } from "../../services/evaluationRepository";
import type { EvaluationV1, EvaluationV1Ratings, EvaluationV1ScorePreview, EvaluationV1SkillPreview, EvaluationV1TextAnalysis, SkillPresentationStatus } from "../../types/evaluation";
import { calculateDisplayCoverage, formValueFromEvaluation, hasAllRatings, skillStatusMap } from "./evaluationV1FormModel";
import { OverallRatings } from "./OverallRatings";
import { ScorePreviewCard } from "./ScorePreviewCard";
import { SkillMatrix } from "./SkillMatrix";
import { TextFeedbackPanel } from "./TextFeedbackPanel";
import { EmployeeTypeBadge, EmployeeTypeBanner } from "../badges/EmployeeTypeBadge";
import type { EvaluationBackTarget } from "../../lib/evaluationNavigation";
import { mutationErrorMessage } from "../../lib/mutationFeedback";
import { InlineSpinner, useToast } from "../ui/ToastProvider";

type LiveRepository = Pick<typeof evaluationRepository, "previewLiveEvaluation" | "previewLiveSkills" | "analyzeLiveEvaluationText" | "submitLiveEvaluation">;
export type EvaluationV1Repository = LiveRepository;

type Props = {
  initialEvaluation: EvaluationV1;
  repository?: LiveRepository;
  backTarget?: EvaluationBackTarget;
  forceReadOnly?: boolean;
  live?: boolean;
};

export function EvaluationV1Form({ initialEvaluation, repository = evaluationRepository, backTarget, forceReadOnly = false, live = false }: Props) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const submittingRef = useRef(false);
  const initialCoverage = calculateDisplayCoverage(initialEvaluation.skills);
  const [evaluation, setEvaluation] = useState(initialEvaluation);
  const [form, setForm] = useState(() => formValueFromEvaluation(initialEvaluation));
  const [initialStatuses, setInitialStatuses] = useState(() => skillStatusMap(initialEvaluation.skills));
  const [analysis, setAnalysis] = useState<EvaluationV1TextAnalysis | null>(null);
  const [preview, setPreview] = useState<EvaluationV1ScorePreview | null>(initialEvaluation.scores ? { ...initialEvaluation.scores, scoringVersion: "v1" as const, employeeType: initialEvaluation.employeeTypeSnapshot, policy: initialEvaluation.policy, skillCoverage: { capableSkills: initialCoverage.capableSkills, activeSkills: initialCoverage.activeSkills, ratio: initialCoverage.activeSkills === 0 ? 0 : initialCoverage.capableSkills / initialCoverage.activeSkills, percentage: initialCoverage.percentage }, skillCategories: initialEvaluation.skillCategories } : null);
  const [skillPreview, setSkillPreview] = useState<EvaluationV1SkillPreview | null>(initialEvaluation.skill ? {
    componentScore: initialEvaluation.skill.componentScore,
    maxScore: initialEvaluation.skill.maxScore,
    overallRatio: initialEvaluation.skill.overallRatio,
    skillCoverage: { capableSkills: initialCoverage.capableSkills, activeSkills: initialCoverage.activeSkills, ratio: initialCoverage.activeSkills === 0 ? 0 : initialCoverage.capableSkills / initialCoverage.activeSkills, percentage: initialCoverage.percentage },
    skillCategories: initialEvaluation.skill.categories,
  } : null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [successSignal, setSuccessSignal] = useState(0);
  const readOnly = forceReadOnly || !live || evaluation.round?.status === "CLOSED";
  const historicalSnapshot = evaluation.round?.status === "CLOSED";
  const coverage = useMemo(() => calculateDisplayCoverage(form.skills), [form.skills]);
  const complete = hasAllRatings(form.ratings) && coverage.allSkillsConfirmed;

  const payload = useMemo<LiveEvaluationSubmissionPayload | null>(() => complete ? {
    speedRating: form.ratings.speed!, initiativeRating: form.ratings.initiative!, attitudeRating: form.ratings.attitude!, availabilityRating: form.ratings.availability!,
    textFeedback: form.textFeedback,
    skills: form.skills.map((skill) => ({ skillDefinitionId: skill.skillDefinitionId!, status: skill.status as Exclude<SkillPresentationStatus, "Unknown"> })),
  } : null, [complete, form]);

  useEffect(() => {
    if (readOnly || !dirty) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, readOnly]);

  useEffect(() => {
    if (readOnly || !payload) { if (!initialEvaluation.scores) setPreview(null); return; }
    let active = true;
    const timer = window.setTimeout(() => {
      setPreviewing(true);
      repository.previewLiveEvaluation(evaluation.roundId, payload)
        .then((value) => { if (active) { setPreview(value); setPreviewError(null); } })
        .catch(() => { if (active) setPreviewError("评分预览暂时不可用，表单内容不受影响。"); })
        .finally(() => { if (active) setPreviewing(false); });
    }, 350);
    return () => { active = false; window.clearTimeout(timer); };
  }, [evaluation.roundId, initialEvaluation.scores, payload, readOnly, repository]);

  useEffect(() => {
    if (readOnly) return;
    let active = true;
    const timer = window.setTimeout(() => {
      repository.previewLiveSkills(evaluation.roundId, {
        skills: form.skills.map((skill) => ({ skillDefinitionId: skill.skillDefinitionId!, status: skill.status })),
      }).then((value) => {
        if (active) { setSkillPreview(value); setPreviewError(null); }
      }).catch(() => {
        if (active) setPreviewError("技能预览暂时不可用，表单内容不受影响。");
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [evaluation.roundId, form.skills, readOnly, repository]);

  const change = (updater: (current: typeof form) => typeof form) => {
    if (readOnly) return;
    setForm(updater);
    setDirty(true);
    setError(null);
    setPreviewError(null);
  };

  const leave = () => {
    if (dirty && !window.confirm("本次修改尚未提交，退出后将不会保存。\n\n确定直接退出吗？")) return;
    navigate(backTarget?.path ?? `/evaluations/stores/${evaluation.storeId}/employees/${evaluation.employeeTypeSnapshot.toLowerCase()}`);
  };

  const submit = async () => {
    if (!payload || submittingRef.current) return;
    submittingRef.current = true;
    const updating = evaluation.status === "Submitted";
    const previousScore = evaluation.scores?.overallScore ?? null;
    setBusy(true); setError(null);
    try {
      const saved = await repository.submitLiveEvaluation(evaluation.roundId, payload);
      setEvaluation(saved);
      setForm(formValueFromEvaluation(saved));
      setInitialStatuses(skillStatusMap(saved.skills));
      setDirty(false);
      if (saved.scores) setPreview({ ...saved.scores, scoringVersion: "v1", employeeType: saved.employeeTypeSnapshot, policy: saved.policy, skillCoverage: { capableSkills: coverage.capableSkills, activeSkills: coverage.activeSkills, ratio: (saved.skillCoverage ?? 0), percentage: (saved.skillCoverage ?? 0) * 100 }, skillCategories: saved.skillCategories });
      if (saved.skill) setSkillPreview({ componentScore: saved.skill.componentScore, maxScore: saved.skill.maxScore, overallRatio: saved.skill.overallRatio, skillCoverage: { capableSkills: coverage.capableSkills, activeSkills: coverage.activeSkills, ratio: saved.skillCoverage ?? 0, percentage: (saved.skillCoverage ?? 0) * 100 }, skillCategories: saved.skill.categories });
      setSuccessSignal((current) => current + 1);
      const nextScore = saved.scores?.overallScore;
      showToast({
        tone: "success",
        title: updating ? "评分已更新" : "评分已提交",
        description: updating && previousScore != null && nextScore != null
          ? `${previousScore.toFixed(1)} → ${nextScore.toFixed(1)}，最新评分已保存到本轮评价中。`
          : "最新评分已保存到本轮评价中。",
      });
    } catch (reason) {
      const message = mutationErrorMessage(reason, "评分提交失败，本次修改尚未保存。");
      setError(message);
      showToast({ tone: "error", title: "评分提交失败", description: message, durationMs: 4000 });
    }
    finally { submittingRef.current = false; setBusy(false); }
  };

  const analyze = async () => {
    if (!form.textFeedback.trim() || readOnly) return;
    setAnalyzing(true);
    try { setAnalysis(await repository.analyzeLiveEvaluationText(evaluation.roundId, form.textFeedback)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "文本分析暂不可用。"); }
    finally { setAnalyzing(false); }
  };

  const displayedScores = readOnly ? evaluation.scores : preview;
  const displayedCoverage = preview?.skillCoverage ?? skillPreview?.skillCoverage ?? { capableSkills: coverage.capableSkills, activeSkills: coverage.activeSkills, percentage: coverage.percentage };
  const displayedSkillScore = preview?.skillScore ?? skillPreview?.componentScore ?? evaluation.skill?.componentScore;
  const displayedSkillCategories = preview?.skillCategories ?? skillPreview?.skillCategories ?? evaluation.skillCategories;

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-graphite-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <button type="button" onClick={leave} className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-2 text-sm font-semibold text-graphite-600 hover:text-graphite-950"><ArrowLeft className="h-4 w-4" />{backTarget?.label ?? `返回 ${evaluation.storeName}`}</button>
        <div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold text-graphite-950">{evaluation.employeeName}</h1><EmployeeTypeBadge employeeType={evaluation.employeeTypeSnapshot} size="prominent" /><StatusBadge submitted={evaluation.status !== "Unsubmitted"} readOnly={readOnly} historicalSnapshot={historicalSnapshot} /></div>
        <p className="mt-2 text-sm font-semibold text-graphite-800">{readOnly && evaluation.evaluatorNameSnapshot ? `${evaluation.evaluatorNameSnapshot} 的评分` : "我的评分"}</p>
        <p className="mt-2 text-sm text-graphite-600">{evaluation.storeName} / {evaluation.employeeTypeSnapshot === "TRAINING" ? "培训员工" : "正式员工"}{evaluation.submittedAt ? ` / 最后提交 ${formatDateTime(evaluation.submittedAt)}` : ""}</p>
      </div>
      {live ? <p className="text-sm text-graphite-500">未提交的修改只保存在当前页面</p> : null}
    </header>
    <EmployeeTypeBanner employeeType={evaluation.employeeTypeSnapshot} policy={evaluation.policy} />
    {readOnly ? <div className="flex items-center gap-3 rounded-xl border border-graphite-200 bg-graphite-50 px-4 py-3 text-sm text-graphite-800"><CircleCheck className="h-5 w-5" /><span>{historicalSnapshot ? "本轮已结束，该评分已冻结，仅供查看。" : "这是当前轮次的最新评分详情，仅供查看。评分人仍可从“我的评分”更新。"}</span></div> : null}
    {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">{error}</div> : null}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <SkillMatrix skills={form.skills} initialStatuses={initialStatuses} disabled={readOnly} capableSkills={displayedCoverage.capableSkills} coveragePercentage={displayedCoverage.percentage} skillScore={displayedSkillScore} skillMaximum={evaluation.policy.skillWeight} categoryBreakdown={displayedSkillCategories} onChange={(code, status) => change((current) => ({ ...current, skills: current.skills.map((skill) => skill.skillCode === code ? { ...skill, status } : skill) }))} />
        <OverallRatings ratings={form.ratings} disabled={readOnly} onChange={(key: keyof EvaluationV1Ratings, value) => change((current) => ({ ...current, ratings: { ...current.ratings, [key]: value } }))} />
        <TextFeedbackPanel value={form.textFeedback} analysis={analysis} disabled={readOnly} isAnalyzing={analyzing} onChange={(value) => { setAnalysis(null); change((current) => ({ ...current, textFeedback: value })); }} onAnalyze={() => void analyze()} onApplySuggestion={(code, status) => change((current) => ({ ...current, skills: current.skills.map((skill) => skill.skillCode === code ? { ...skill, status } : skill) }))} />
        {!readOnly ? <section className="flex flex-col gap-3 rounded-xl border border-graphite-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-graphite-600">只有点击提交评分才会写入数据库。同轮再次提交会覆盖你的当前评分。</p>
          <button type="button" onClick={() => void submit()} disabled={!payload || busy} aria-busy={busy} className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white hover:bg-graphite-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? <InlineSpinner /> : <Send className="h-4 w-4" aria-hidden="true" />}{busy ? (evaluation.status === "Submitted" ? "正在更新…" : "正在提交…") : evaluation.status === "Submitted" ? "更新评分" : "提交评分"}</button>
          {!coverage.allSkillsConfirmed ? <p className="w-full text-xs font-medium text-amber-800 sm:order-first">提交前需要确认全部技能：{coverage.confirmedSkills} / {coverage.activeSkills}</p> : null}
        </section> : null}
      </div>
      <ScorePreviewCard scores={displayedScores} ratingsComplete={hasAllRatings(form.ratings)} skillsConfirmed={coverage.allSkillsConfirmed} isLoading={previewing} error={previewError} capableSkills={displayedCoverage.capableSkills} activeSkills={displayedCoverage.activeSkills} coveragePercentage={displayedCoverage.percentage} completed={historicalSnapshot} policy={evaluation.policy} employeeType={evaluation.employeeTypeSnapshot} successSignal={successSignal} />
    </div>
  </div>;
}

function StatusBadge({ submitted, readOnly, historicalSnapshot }: { submitted: boolean; readOnly: boolean; historicalSnapshot: boolean }) {
  const label = historicalSnapshot ? "历史快照" : readOnly ? "当前评分 · 只读" : submitted ? "已评分，可再次提交" : "未评分";
  return <span className="inline-flex h-7 items-center rounded-full bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">{label}</span>;
}
