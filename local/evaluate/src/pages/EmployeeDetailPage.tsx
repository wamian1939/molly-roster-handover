import { ArrowLeft, ArrowUpCircle, ClipboardCheck, Eye, EyeOff, FilePenLine } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { EmployeeStatusBadge } from "../components/badges/EmployeeStatusBadge";
import { EmployeeTypeBadge } from "../components/badges/EmployeeTypeBadge";
import { EvaluationHistorySection } from "../components/employee-detail/EvaluationHistorySection";
import { ReadOnlySkillMatrix } from "../components/employee-detail/ReadOnlySkillMatrix";
import { CurrentSkillEditor } from "../components/employee-detail/CurrentSkillEditor";
import { V1EvaluationDetail } from "../components/employee-detail/V1EvaluationDetail";
import { V1ScoreTrend } from "../components/employee-detail/V1ScoreTrend";
import { PageContainer } from "../components/layout/PageContainer";
import { ErrorState } from "../components/states/ErrorState";
import { LoadingState } from "../components/states/LoadingState";
import { cx, formatDate } from "../lib/format";
import { ScoreOrb } from "../components/motion/ScoreOrb";
import { motion, useReducedMotion } from "framer-motion";
import { employmentTypeLabel } from "../lib/presentation";
import { evaluationRepository } from "../services/evaluationRepository";
import { employeeRepository } from "../services/employeeRepository";
import { useAuth } from "../auth/AuthContext";
import type {
  EmployeeEvaluationSummary,
  EvaluationV1,
  EmployeeSensitiveProfile,
} from "../types/evaluation";
import { withEvaluationNavigation } from "../lib/evaluationNavigation";
import { Dialog } from "../components/ui/Dialog";
import { StoreJobTags } from "../components/badges/StoreJobTag";

export function EmployeeDetailPage() {
  const { employeeId } = useParams();
  const location = useLocation();
  const [summary, setSummary] = useState<EmployeeEvaluationSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<EmployeeSensitiveProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [skillEditorOpen, setSkillEditorOpen] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const { user } = useAuth();
  const reduce = useReducedMotion();

  useEffect(() => {
    let cancelled = false;
    if (!employeeId) {
      setError("缺少员工 ID。");
      return;
    }
    setProfileError(null);
    setProfile(null);
    evaluationRepository.fetchEmployeeEvaluationSummary(employeeId)
      .then((loaded) => {
        if (!cancelled) setSummary(loaded);
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "无法加载员工详情。");
      });
    if (user?.role === "ADMIN") employeeRepository.fetchEmployeeProfile(employeeId).then((loaded) => { if (!cancelled) setProfile(loaded); }).catch((reason: unknown) => { if (!cancelled) setProfileError(reason instanceof Error ? reason.message : "完整员工档案暂时无法读取。"); });
    return () => { cancelled = true; };
  }, [employeeId, user?.role]);

  const scoreNowPath = useMemo(() => {
    if (!summary) return "/evaluations";
    return `/employees/${summary.employee.id}/evaluation/v1/new`;
  }, [summary]);
  const scoreNavigation = withEvaluationNavigation(scoreNowPath, location, "employee-detail");

  const promote = async () => {
    if (!summary || user?.role !== "ADMIN") return;
    setPromoting(true);
    try {
      const updated = await employeeRepository.promoteToRegular(summary.employee.id);
      setSummary((current) => current ? { ...current, employee: { ...current.employee, employeeType: updated.employeeType } } : current);
      setPromoteOpen(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "无法将员工转为正式员工。"); }
    finally { setPromoting(false); }
  };

  if (error) return <ErrorState title="员工详情暂不可用" description={error} />;
  if (!summary) return <LoadingState label="正在加载员工能力档案" />;

  const { employee, latestEvaluation } = summary;
  const officialScore = summary.officialScore;
  const initialDetails: Record<string, EvaluationV1> = {};
  if (latestEvaluation) initialDetails[latestEvaluation.id] = latestEvaluation;

  return (
    <PageContainer>
      <motion.header
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative isolate overflow-hidden rounded-2xl bg-graphite-950 p-6 text-white shadow-score sm:p-8 lg:flex lg:items-center lg:justify-between lg:gap-8"
      >
        <div aria-hidden="true" className={cx("pointer-events-none absolute inset-0 -z-[1]", employee.employeeType === "TRAINING" ? "bg-[radial-gradient(circle_at_86%_10%,rgba(233,178,182,.3),transparent_36%),linear-gradient(145deg,rgba(255,255,255,.055),transparent_46%)]" : "bg-[radial-gradient(circle_at_86%_10%,rgba(148,163,184,.22),transparent_34%),linear-gradient(145deg,rgba(255,255,255,.055),transparent_46%)]")} />
        <div className="min-w-0">
          <Link to="/employees" className="inline-flex items-center gap-2 text-sm font-semibold text-graphite-300 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> 返回员工管理
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">{employee.displayName}</h1>
            <EmployeeTypeBadge employeeType={employee.employeeType} size="prominent" />
            <EmployeeStatusBadge status={employee.status} />
          </div>
          <div className="mt-3"><StoreJobTags jobs={employee.jobs} limit={4} /></div>
          <p className="mt-2 text-sm text-graphite-300">{employee.storeName} / {employmentTypeLabel(employee.employmentType)}</p>
          {employee.status === "Active" ? (
            <motion.div whileHover={!reduce ? { x: 2 } : undefined} className="mt-6 flex flex-wrap gap-2">
              <Link to={scoreNavigation.to} state={scoreNavigation.state} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-graphite-950 shadow-lg shadow-black/10 transition hover:bg-teal-50">
                <FilePenLine className="h-4 w-4" aria-hidden="true" /> {latestEvaluation ? "再次评分" : "评分"}
              </Link>
              {user?.role === "ADMIN" && employee.employeeType === "TRAINING" ? <button type="button" onClick={() => setPromoteOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-white/30 px-4 text-sm font-semibold text-white hover:bg-white/10"><ArrowUpCircle className="h-4 w-4" />转为正式员工</button> : null}
            </motion.div>
          ) : null}
        </div>
        <div className="mt-7 flex justify-center lg:mt-0 lg:justify-end">
          <ScoreOrb score={officialScore?.score ?? null} tier={officialScore?.tier ?? undefined} label="当前正式评分" />
        </div>
      </motion.header>

      <ProfileOverview employee={employee} profile={profile} isAdmin={user?.role === "ADMIN"} profileError={profileError} />

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <CurrentScoreSummary summary={summary} />
        <div className="space-y-4">
          {user?.role === "ADMIN" && employee.status === "Active" ? <div className="flex justify-end"><button type="button" onClick={() => setSkillEditorOpen(true)} className="min-h-11 rounded-lg border border-graphite-300 bg-white px-4 text-sm font-semibold text-graphite-800 hover:bg-graphite-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500">确认当前技能</button></div> : null}
          <ReadOnlySkillMatrix
            title="当前技能"
            description="员工当前能力画像，与历史评价快照分开显示。"
            skills={summary.currentSkills}
            breakdown={summary.currentSkillCategories}
            overallRatio={summary.currentSkillOverallRatio}
            updatedAt={summary.currentSkillsUpdatedAt}
            emptyMessage="技能画像尚未初始化。评价快照仍会保留当次技能状态，但不会自动覆盖当前能力画像。"
          />
        </div>
      </div>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-semibold text-graphite-500">最近个人评分</p>
          <h2 className="mt-1 text-xl font-semibold text-graphite-950">
            {latestEvaluation ? "最近个人评分快照" : "暂无个人评分快照"}
          </h2>
          {latestEvaluation?.completedAt ? (
            <p className="mt-1 text-sm text-graphite-600">所在轮次结束于 {formatDate(latestEvaluation.completedAt)} / {latestEvaluation.storeName}</p>
          ) : null}
        </div>
        {latestEvaluation ? <V1EvaluationDetail evaluation={latestEvaluation} /> : null}
        {!latestEvaluation ? (
          <div className="flex flex-col gap-4 rounded-xl border border-dashed border-graphite-300 bg-white px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-graphite-950">{officialScore ? "当前门店暂无个人评分快照" : "尚无历史评分"}</p>
              <p className="mt-1 text-sm text-graphite-600">{officialScore ? "正式评分沿用最近的 CLOSED 轮次；个人评价详情仍按原门店权限查看。" : "ADMIN 结束本轮后，本轮门店综合才会成为正式当前分数。"}</p>
            </div>
            {employee.status === "Active" ? (
              <Link to={scoreNavigation.to} state={scoreNavigation.state} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white">
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" /> 评分
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>

      <V1ScoreTrend history={summary.history} />
      <EvaluationHistorySection history={summary.history} initialDetails={initialDetails} />
      {skillEditorOpen ? <CurrentSkillEditor employeeId={employee.id} onClose={() => setSkillEditorOpen(false)} onSaved={async () => { setSummary(await evaluationRepository.fetchEmployeeEvaluationSummary(employee.id)); }} /> : null}
      {promoteOpen ? <Dialog titleId="promote-title" onClose={() => setPromoteOpen(false)} closeDisabled={promoting} className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl"><h2 id="promote-title" className="text-xl font-semibold text-graphite-950">转为正式员工？</h2><p className="mt-3 text-sm leading-6 text-graphite-600">转正后，该员工之后创建的新评价将使用正式员工评分标准。历史培训期评价不会改变。</p><div className="mt-6 flex justify-end gap-2"><button type="button" disabled={promoting} onClick={() => setPromoteOpen(false)} className="h-11 rounded-lg px-4 text-sm font-semibold text-graphite-700">取消</button><button type="button" disabled={promoting} onClick={() => void promote()} className="h-11 rounded-lg bg-graphite-950 px-4 text-sm font-semibold text-white disabled:opacity-50">{promoting ? "正在转正" : "确认转正"}</button></div></Dialog> : null}
    </PageContainer>
  );
}

function CurrentScoreSummary({ summary }: { summary: EmployeeEvaluationSummary }) {
  const round = summary.latestRound;
  const official = summary.officialScore;
  const visibleRound = round?.id === official?.roundId ? round : null;
  const coverage = official?.skillCoverage == null ? null : Math.round(official.skillCoverage * 1000) / 10;
  return (
    <section className="overflow-hidden rounded-xl bg-white shadow-panel ring-1 ring-graphite-200 xl:self-start">
      <div className="border-b border-graphite-100 px-5 py-4"><p className="text-sm font-semibold text-graphite-950">评分摘要</p><p className="mt-1 text-xs text-graphite-500">最近有效 CLOSED 轮次的正式结果</p></div>
      <dl className="space-y-3 px-5 py-4 text-sm">
        <div className="flex items-center justify-between gap-4"><dt className="text-graphite-500">当前员工类型</dt><dd><EmployeeTypeBadge employeeType={summary.employee.employeeType} /></dd></div>
        {official ? <div className="flex items-center justify-between gap-4"><dt className="text-graphite-500">最近轮次标准</dt><dd><EmployeeTypeBadge employeeType={official.employeeTypeSnapshot} /></dd></div> : null}
        <div className="flex justify-between gap-4"><dt className="text-graphite-500">综合评分</dt><dd className="font-semibold tabular-nums text-graphite-950">{official?.score == null ? "-" : `${official.score.toFixed(1)} / 100`}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-graphite-500">评分人进度</dt><dd className="font-semibold tabular-nums text-graphite-950">{visibleRound ? `${visibleRound.completedCount} / ${visibleRound.eligibleCount}` : "-"}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-graphite-500">技能覆盖</dt><dd className="font-semibold tabular-nums text-graphite-950">{coverage === null ? "-" : `${coverage}%`}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-graphite-500">轮次结束时间</dt><dd className="text-right font-semibold text-graphite-950">{official?.closedAt ? formatDate(official.closedAt) : "-"}</dd></div>
      </dl>
      {official && official.employeeTypeSnapshot !== summary.employee.employeeType ? <p className="mx-5 mb-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">当前类型已变化；最近轮次仍保留创建时的员工类型和评分标准。</p> : null}
    </section>
  );
}

function ProfileOverview({ employee, profile, isAdmin, profileError }: { employee: EmployeeEvaluationSummary["employee"]; profile: EmployeeSensitiveProfile | null; isAdmin: boolean; profileError: string | null }) {
  const [showSensitive, setShowSensitive] = useState(false);
  return <section className="rounded-xl bg-white p-5 ring-1 ring-graphite-200">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-graphite-950">员工资料</h2><p className="mt-1 text-sm text-graphite-600">评价页面仅使用姓名、员工类型、用工类型和门店。</p></div>{isAdmin && profile ? <button type="button" aria-pressed={showSensitive} onClick={() => setShowSensitive(!showSensitive)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-graphite-200 px-3 text-xs font-semibold text-graphite-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-graphite-500">{showSensitive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showSensitive ? "隐藏敏感资料" : "显示敏感资料"}</button> : null}</div>
    {isAdmin && profileError ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">完整 HR 档案读取失败：{profileError}</p> : null}
    <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><ProfileItem label="英文名" value={profile?.englishName ?? employee.displayName} /><ProfileItem label="Legal Name" value={profile?.legalName} /><ProfileItem label="员工类型" value={employee.employeeType === "TRAINING" ? "培训" : "正式"} /><ProfileItem label="用工类型" value={employmentTypeLabel(employee.employmentType)} /><ProfileItem label="门店" value={employee.storeName} /><ProfileItem label="状态" value={employee.status === "Active" ? "在职" : "已归档"} /><ProfileItem label="入职日期" value={employee.employmentCommencementDate} /><ProfileItem label="工龄" value={tenureLabel(employee.tenureMonths)} />{profile ? <><ProfileItem label="邮箱" value={profile.emailAddress} /><ProfileItem label="手机号码" value={profile.mobileTelephoneNumber} /></> : null}</dl>
    {isAdmin && profile ? <div className="mt-5 border-t border-graphite-200 pt-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-graphite-950">银行与税务（ADMIN）</h3><span className="text-xs font-semibold text-amber-800">敏感信息</span></div><dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4"><ProfileItem label="账户名称" value={mask(profile.bankAccountName, showSensitive, 3)} /><ProfileItem label="BSB" value={mask(profile.bsbNumber, showSensitive, 3)} /><ProfileItem label="银行账号" value={mask(profile.bankAccountNumber, showSensitive, 4)} /><ProfileItem label="TFN" value={mask(profile.taxFileNumber, showSensitive, 3)} /><ProfileItem label="ABN" value={profile.abn} /><ProfileItem label="Super 公司" value={profile.superannuationCompany} /><ProfileItem label="Super 账号" value={mask(profile.superannuationAccountNumber, showSensitive, 4)} /><ProfileItem label="USI" value={profile.uniqueSuperannuationIdentifier} /></dl></div> : null}
  </section>;
}

function ProfileItem({ label, value }: { label: string; value?: string | null }) { return <div><dt className="text-xs text-graphite-500">{label}</dt><dd className="mt-1 font-semibold text-graphite-950">{value || "未填写"}</dd></div>; }
function mask(value: string | null, revealed: boolean, visible: number) { if (!value) return null; if (revealed) return value; return `${"•".repeat(Math.max(6, value.length - visible))} ${value.slice(-visible)}`; }
function tenureLabel(months: number | null) { if (months == null) return "未计算"; const years = Math.floor(months / 12); const rest = months % 12; return years ? `${years}年${rest ? `${rest}个月` : ""}` : `${rest}个月`; }
