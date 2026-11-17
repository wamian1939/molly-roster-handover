import { ChevronDown, GraduationCap, UserRoundCheck } from "lucide-react";
import { cx } from "../../lib/format";
import { employeeTypePresentation } from "../../lib/presentation";
import type { EmployeeType, ScoringPolicySnapshotV1 } from "../../types/evaluation";

export type EmployeeTypeVisualSize = "compact" | "normal" | "prominent";

const weightLabels: Array<{ key: keyof ScoringPolicySnapshotV1; label: string }> = [
  { key: "skillWeight", label: "技能" },
  { key: "speedWeight", label: "速度" },
  { key: "initiativeWeight", label: "眼里有活" },
  { key: "attitudeWeight", label: "态度" },
  { key: "availabilityWeight", label: "报班自由度" },
  { key: "textWeight", label: "文本" },
];

export function EmployeeTypeBadge({ employeeType, compact = false, size, className }: { employeeType: EmployeeType; compact?: boolean; size?: EmployeeTypeVisualSize; className?: string }) {
  const Icon = employeeType === "TRAINING" ? GraduationCap : UserRoundCheck;
  const resolvedSize = size ?? (compact ? "compact" : "normal");
  const tone = employeeType === "TRAINING"
    ? "bg-brand-100 text-brand-800 ring-brand-300"
    : "bg-slate-100 text-slate-800 ring-slate-300";
  const sizes = { compact: "h-6 gap-1 px-2 text-[11px]", normal: "h-8 gap-1.5 px-3 text-xs", prominent: "h-10 gap-2 px-3.5 text-sm" }[resolvedSize];
  return (
    <span className={cx("inline-flex shrink-0 items-center rounded-full font-semibold ring-1", tone, sizes, className)}>
      <Icon className={resolvedSize === "compact" ? "h-3 w-3" : resolvedSize === "prominent" ? "h-5 w-5" : "h-3.5 w-3.5"} aria-hidden="true" />
      {resolvedSize === "compact" ? employeeTypePresentation[employeeType].shortLabel : employeeTypePresentation[employeeType].label}
    </span>
  );
}

export function EmployeeTypeBanner({ employeeType, policy, compact = false, className }: { employeeType: EmployeeType; policy?: ScoringPolicySnapshotV1; compact?: boolean; className?: string }) {
  const training = employeeType === "TRAINING";
  const presentation = employeeTypePresentation[employeeType];
  const Icon = training ? GraduationCap : UserRoundCheck;
  return (
    <section className={cx("relative overflow-hidden rounded-xl border", compact ? "px-4 py-3" : "px-5 py-4", training ? "border-brand-300 bg-brand-50/80" : "border-slate-300 bg-slate-50", className)} aria-label={`${presentation.label}评分标准`}>
      <div className="flex items-start gap-3">
        <span className={cx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", training ? "bg-brand-100 text-brand-800" : "bg-slate-200 text-slate-800")}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className={cx("font-semibold", compact ? "text-sm" : "text-base", training ? "text-brand-900" : "text-slate-950")}>{presentation.evaluationLabel}</p>
          <p className={cx("mt-1 leading-5", compact ? "text-xs" : "text-sm", training ? "text-brand-800" : "text-slate-700")}>本次评价按照{presentation.standardLabel}计算，本轮创建后标准保持不变。</p>
          {policy ? <details className="group mt-3"><summary className={cx("inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2", training ? "text-brand-900 focus:ring-brand-500" : "text-slate-800 focus:ring-slate-500")}>查看评分权重<ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-180" aria-hidden="true" /></summary><dl className="mt-2 flex flex-wrap gap-2">{weightLabels.map(({ key, label }) => <div key={key} className={cx("rounded-lg px-2.5 py-1.5 text-xs ring-1", training ? "bg-white/75 text-brand-900 ring-brand-200" : "bg-white text-slate-800 ring-slate-200")}><dt className="inline opacity-70">{label} </dt><dd className="inline font-semibold tabular-nums">{policy[key]}%</dd></div>)}</dl></details> : null}
        </div>
      </div>
    </section>
  );
}
