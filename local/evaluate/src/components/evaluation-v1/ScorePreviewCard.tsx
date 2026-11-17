import { CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { EmployeeType, EvaluationV1Scores, EvaluationV1ScorePreview, ScoringPolicySnapshotV1 } from "../../types/evaluation";
import { cx } from "../../lib/format";
import { employeeTypePresentation } from "../../lib/presentation";
import { EmployeeTypeBadge } from "../badges/EmployeeTypeBadge";
import { GsapScore } from "../motion/GsapScore";
import { ScoreOrb } from "../motion/ScoreOrb";

type ScorePreviewCardProps = {
  scores: EvaluationV1Scores | EvaluationV1ScorePreview | null;
  ratingsComplete: boolean;
  skillsConfirmed: boolean;
  isLoading: boolean;
  error: string | null;
  capableSkills: number;
  activeSkills: number;
  coveragePercentage: number;
  completed: boolean;
  policy: ScoringPolicySnapshotV1;
  employeeType: EmployeeType;
  successSignal?: number;
};

function rows(policy: ScoringPolicySnapshotV1): Array<{ key: keyof EvaluationV1Scores; label: string; maximum: number }> {
  return [
    { key: "skillScore", label: "技能得分", maximum: policy.skillWeight },
    { key: "speedScore", label: "速度", maximum: policy.speedWeight },
    { key: "initiativeScore", label: "眼里有活", maximum: policy.initiativeWeight },
    { key: "attitudeScore", label: "态度", maximum: policy.attitudeWeight },
    { key: "availabilityScore", label: "报班自由度", maximum: policy.availabilityWeight },
    { key: "textScore", label: "文字评价", maximum: policy.textWeight },
  ];
}

export function ScorePreviewCard({
  scores,
  ratingsComplete,
  skillsConfirmed,
  isLoading,
  error,
  capableSkills,
  activeSkills,
  coveragePercentage,
  completed,
  policy,
  employeeType,
  successSignal = 0,
}: ScorePreviewCardProps) {
  const reduce = useReducedMotion();
  return (
    <aside className="xl:sticky xl:top-6 xl:self-start">
      <motion.section
        layout
        animate={(completed || successSignal > 0) && !reduce ? { boxShadow: ["0 16px 42px rgba(15,23,42,.18)", "0 18px 40px rgba(5,150,105,.22)", "0 16px 42px rgba(15,23,42,.18)"] } : undefined}
        transition={{ duration: 0.5 }}
        className="relative overflow-hidden rounded-2xl bg-graphite-950 text-white shadow-score"
      >
        <div aria-hidden="true" className={cx("pointer-events-none absolute inset-0", employeeType === "TRAINING" ? "bg-[radial-gradient(circle_at_72%_12%,rgba(233,178,182,0.24),transparent_38%),linear-gradient(145deg,rgba(255,255,255,0.045),transparent_45%)]" : "bg-[radial-gradient(circle_at_72%_12%,rgba(148,163,184,0.18),transparent_38%),linear-gradient(145deg,rgba(255,255,255,0.045),transparent_45%)]")} />
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-semibold text-graphite-400">评分汇总</p><p className="mt-1 text-sm font-semibold text-white">{employeeTypePresentation[employeeType].label} · {employeeTypePresentation[employeeType].standardLabel}</p></div>
            {completed ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> 已完成
              </span>
            ) : null}
          </div>
          <div className="mt-3"><EmployeeTypeBadge employeeType={employeeType} /></div>
          {scores ? <div className="mt-2 flex justify-center"><ScoreOrb score={scores.overallScore} tier={scores.tier} size="md" completed={completed} /></div> : (
            <p className="mt-4 text-sm leading-5 text-graphite-300">
              {!skillsConfirmed ? "确认全部岗位技能后查看综合分。" : ratingsComplete ? "正在更新评分预览。" : "完成 4 项评分后查看综合分。"}
            </p>
          )}
        </div>

        <div className="px-5 py-4">
          <dl className="space-y-3 tabular-nums">
            {rows(policy).map((row) => (
              <div key={row.key} className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-4"><dt className="text-graphite-300">{row.label}</dt><dd className="font-semibold text-white">{scores ? <><GsapScore value={Number(scores[row.key])} formatter={(value) => value.toFixed(1)} /> / {row.maximum}</> : `- / ${row.maximum}`}</dd></div>
                <div className="h-1 overflow-hidden rounded-full bg-white/10"><motion.div className="motion-progress-fill h-full rounded-full bg-gradient-to-r from-teal-400 to-sky-400" initial={false} animate={{ scaleX: scores ? Number(scores[row.key]) / row.maximum : 0 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 190, damping: 28 }} /></div>
              </div>
            ))}
          </dl>
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-graphite-300">技能覆盖</span>
            <span className="font-semibold tabular-nums"><GsapScore value={coveragePercentage} formatter={(value) => `${Math.round(value)}%`} /></span>
            </div>
            <p className="mt-1 text-right text-xs text-graphite-400">{capableSkills} / {activeSkills} 项技能</p>
          </div>
          <AnimatePresence initial={false}>
            {isLoading ? <motion.p initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 text-xs text-graphite-400" role="status">正在平滑更新评分预览...</motion.p> : null}
          </AnimatePresence>
          {error ? <p className="mt-4 text-sm text-amber-300">评分预览暂时不可用。</p> : null}
        </div>
      </motion.section>
    </aside>
  );
}
