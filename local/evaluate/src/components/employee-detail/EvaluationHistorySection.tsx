import { ChevronDown, ChevronUp, Clock3 } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Link, useLocation } from "react-router-dom";
import { cx, formatDate } from "../../lib/format";
import { employeeTypePresentation } from "../../lib/presentation";
import { evaluationRepository } from "../../services/evaluationRepository";
import type {
  EvaluationV1,
  EvaluationHistorySummaryV1,
} from "../../types/evaluation";
import { V1EvaluationDetail } from "./V1EvaluationDetail";
import { EmployeeTypeBadge } from "../badges/EmployeeTypeBadge";
import { withEvaluationNavigation } from "../../lib/evaluationNavigation";

type HistoryDetail = EvaluationV1;

export function EvaluationHistorySection({
  history,
  initialDetails = {},
}: {
  history: EvaluationHistorySummaryV1[];
  initialDetails?: Record<string, HistoryDetail>;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, HistoryDetail>>(initialDetails);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reduce = useReducedMotion();
  const location = useLocation();

  const toggle = async (entry: EvaluationHistorySummaryV1) => {
    if (expandedId === entry.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.id);
    if (details[entry.id]) return;
    setLoadingId(entry.id);
    setErrors((current) => ({ ...current, [entry.id]: "" }));
    try {
      const detail = await evaluationRepository.getEvaluationV1(entry.id);
      setDetails((current) => ({ ...current, [entry.id]: detail }));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [entry.id]: error instanceof Error ? error.message : "无法加载评价详情。",
      }));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <section className="rounded-xl bg-white shadow-panel ring-1 ring-graphite-200">
      <div className="border-b border-graphite-100 px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold text-graphite-950">评价历史</h2>
        <p className="mt-1 text-sm text-graphite-600">按轮次结束时间排序；进行中的轮次不进入正式历史。</p>
      </div>
      {history.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-graphite-600 sm:px-6">
          <Clock3 className="h-5 w-5 text-graphite-400" aria-hidden="true" />
          尚无已结束轮次。
        </div>
      ) : (
        <div className="relative divide-y divide-graphite-100 before:absolute before:bottom-7 before:left-[1.85rem] before:top-7 before:w-px before:bg-gradient-to-b before:from-signal-teal before:to-graphite-200 sm:before:left-[2.35rem]">
          {history.map((entry, index) => {
            const expanded = expandedId === entry.id;
            const detail = details[entry.id];
            const rowContent = <>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-graphite-950">第 {entry.roundNumber ?? 1} 轮 · {formatDate(entry.completedAt)}</div>
                <p className={cx("mt-1 text-sm font-semibold", entry.employeeTypeSnapshot === "TRAINING" ? "text-brand-800" : "text-slate-700")}>{employeeTypePresentation[entry.employeeTypeSnapshot].evaluationLabel}</p>
                {entry.policy ? <p className="mt-1 text-xs font-medium text-graphite-600">评分规则：技能 {entry.policy.skillWeight}% · 速度 {entry.policy.speedWeight}% · 眼里有活 {entry.policy.initiativeWeight}% · 态度 {entry.policy.attitudeWeight}%</p> : null}
                <p className="mt-1 text-xs text-graphite-500">结束于 {formatDate(entry.completedAt)} / {entry.storeName}</p>
              </div>
              <div className="flex items-center gap-2">
                <EmployeeTypeBadge employeeType={entry.employeeTypeSnapshot} />
                <span className="text-xl font-semibold tabular-nums text-graphite-950">{entry.overallScore === null ? "-" : entry.overallScore.toFixed(1)}</span>
                {entry.tier ? <span className="rounded-md bg-graphite-950 px-2 py-1 text-xs font-bold text-white">{entry.tier}</span> : null}
              </div>
              {entry.roundId ? <span className="rounded-md bg-graphite-100 px-2 py-1 text-xs font-semibold text-graphite-600">{entry.completedCount ?? 0} / {entry.eligibleCount ?? 0} 位评分</span> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-graphite-100 text-graphite-600">{expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}</span>}
            </>;
            return (
              <motion.article key={entry.id} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(index * 0.055, 0.22) }} className="relative">
                <motion.span aria-hidden="true" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 25, delay: Math.min(index * 0.055, 0.22) }} className={cx("absolute left-[1.5rem] top-[1.55rem] z-[2] h-3 w-3 rounded-full border-2 border-white sm:left-[2rem]", entry.employeeTypeSnapshot === "TRAINING" ? "bg-brand-500 shadow-[0_0_0_3px_rgba(233,178,182,.3)]" : "bg-slate-600 shadow-[0_0_0_3px_rgba(71,85,105,.15)]")} />
                {entry.roundId ? (
                  <Link {...withEvaluationNavigation(`/evaluation-rounds/${entry.roundId}`, location, "employee-detail")} className="grid min-h-11 w-full gap-3 py-4 pl-12 pr-5 text-left transition hover:bg-graphite-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-graphite-500 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:pl-14 sm:pr-6">
                    {rowContent}
                  </Link>
                ) : (
                  <button type="button" onClick={() => void toggle(entry)} aria-expanded={expanded} className="grid min-h-11 w-full gap-3 py-4 pl-12 pr-5 text-left transition hover:bg-graphite-50 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:pl-14 sm:pr-6">
                    {rowContent}
                  </button>
                )}
                <AnimatePresence initial={false}>
                {expanded ? (
                  <motion.div initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduce ? undefined : { opacity: 0, height: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden border-t border-graphite-100 bg-graphite-50/60 px-5 py-5 sm:px-6">
                    {loadingId === entry.id ? <p className="text-sm text-graphite-500" role="status">正在加载已保存评价...</p> : null}
                    {errors[entry.id] ? <p className="text-sm font-medium text-red-700" role="alert">{errors[entry.id]}</p> : null}
                    {detail ? (
                      <V1EvaluationDetail evaluation={detail} showSkillSnapshot />
                    ) : null}
                  </motion.div>
                ) : null}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </div>
      )}
    </section>
  );
}
