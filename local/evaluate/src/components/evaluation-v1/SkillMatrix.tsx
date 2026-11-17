import { CircleDot } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { EvaluationV1Skill, SkillCategoryBreakdownV1, SkillPresentationStatus } from "../../types/evaluation";
import { categoryLabels } from "../../lib/presentation";
import { SkillStatusControl } from "./SkillStatusControl";

const categoryOrder = ["BackKitchen", "Back Kitchen", "Bar", "Front", "Operations"];
type SkillMatrixProps = {
  skills: EvaluationV1Skill[];
  initialStatuses: Record<string, SkillPresentationStatus>;
  disabled: boolean;
  capableSkills: number;
  coveragePercentage: number;
  skillScore?: number | null;
  skillMaximum: number;
  categoryBreakdown?: SkillCategoryBreakdownV1;
  onChange: (skillCode: string, status: SkillPresentationStatus) => void;
};

export function SkillMatrix({
  skills,
  initialStatuses,
  disabled,
  capableSkills,
  coveragePercentage,
  skillScore,
  skillMaximum,
  categoryBreakdown,
  onChange,
}: SkillMatrixProps) {
  const reduce = useReducedMotion();
  const categories = [...new Set(skills.map((skill) => skill.category))].sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b),
  );
  const confirmedSkills = skills.filter((skill) => skill.status !== "Unknown").length;
  const confirmationPercentage = skills.length ? (confirmedSkills / skills.length) * 100 : 0;

  return (
    <section className="rounded-xl bg-white shadow-panel ring-1 ring-graphite-200">
      <div className="grid gap-5 border-b border-graphite-100 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-graphite-500">技能确认</p>
          <h2 className="mt-1 text-lg font-semibold text-graphite-950">岗位技能</h2>
          <p className="mt-1 text-sm text-graphite-600">首次评价需确认全部岗位；后续评价会预填当前技能，只需修改变化项。</p>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-[auto_minmax(12rem,1fr)] sm:items-end lg:min-w-[31rem]">
          <div>
            <p className="text-xs font-semibold text-graphite-500">技能总分</p>
            <p className="mt-1 whitespace-nowrap text-3xl font-semibold tabular-nums tracking-[-0.035em] text-graphite-950"><span className="sr-only">技能总分 </span>{skillScore == null ? "—" : skillScore.toFixed(1)} <span className="text-base font-semibold text-graphite-500">/ {skillMaximum}</span></p>
            <p className="mt-1 text-xs text-graphite-500">按当前员工评分标准计入综合分</p>
          </div>
          <div className="min-w-0 rounded-lg bg-graphite-50 px-4 py-3">
            <div className="flex items-center justify-between gap-3 text-xs font-semibold text-graphite-600"><span>技能确认进度</span><span className="tabular-nums">{confirmedSkills} / {skills.length}</span></div>
            <CapacityBar value={confirmationPercentage} label={`技能确认 ${confirmedSkills} / ${skills.length}`} reduce={Boolean(reduce)} />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-graphite-500">可排岗位 {capableSkills} / {skills.length} · {coveragePercentage}%</span><AnimatePresence initial={false}>{confirmedSkills === skills.length && skills.length > 0 ? <motion.span initial={reduce ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} className="font-semibold text-emerald-700">已全部确认</motion.span> : null}</AnimatePresence></div>
          </div>
        </div>
      </div>

      {categoryBreakdown ? <div className="grid gap-3 border-b border-graphite-100 bg-graphite-50/70 px-5 py-4 sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
        <CategoryMetric label="后厨" metric={categoryBreakdown.backOfHouse} reduce={Boolean(reduce)} />
        <CategoryMetric label="水吧" metric={categoryBreakdown.waterBar} reduce={Boolean(reduce)} />
        <CategoryMetric label="前场" metric={categoryBreakdown.frontOfHouse} reduce={Boolean(reduce)} />
        <CategoryMetric label="操作能力" metric={categoryBreakdown.operations} reduce={Boolean(reduce)} operations />
      </div> : null}

      <div className="divide-y divide-graphite-100">
        {categories.map((category) => (
          <div key={category} className="px-5 py-4 sm:px-6">
            <h3 className="text-xs font-semibold uppercase text-graphite-500">
              {categoryLabels[category] ?? category}
            </h3>
            <div className="mt-2 divide-y divide-graphite-100">
              {skills.filter((skill) => skill.category === category).map((skill) => {
                const changed = initialStatuses[skill.skillCode] !== skill.status;
                return (
                  <motion.div
                    key={skill.skillCode}
                    className="grid gap-2.5 py-2.5 md:grid-cols-[minmax(120px,0.45fr)_minmax(420px,1fr)] md:items-center md:gap-5"
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.24 }}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div>
                        <p className="text-sm font-semibold text-graphite-950">{skill.skillNameZh}</p>
                      </div>
                      {changed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-[0.6875rem] font-semibold text-blue-700 ring-1 ring-blue-200">
                          <CircleDot className="h-3 w-3" aria-hidden="true" />
                          已修改
                        </span>
                      ) : null}
                    </div>
                    <SkillStatusControl
                      label={skill.skillNameZh}
                      value={skill.status}
                      disabled={disabled}
                      skillMode={skill.skillMode}
                      onChange={(status) => onChange(skill.skillCode, status)}
                    />
                  </motion.div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CategoryMetric({ label, metric, reduce, operations = false }: { label: string; metric: SkillCategoryBreakdownV1[keyof SkillCategoryBreakdownV1]; reduce: boolean; operations?: boolean }) {
  const percentage = metric.percentage;
  const state = percentage == null ? "未确认" : percentage >= 99.5 ? "已满" : percentage >= 75 ? "接近满" : percentage >= 40 ? "中等" : "偏低";
  return <article className="min-w-0 rounded-xl bg-white p-4 ring-1 ring-graphite-200">
    <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-graphite-800">{label}</p><p className="mt-1 text-xs text-graphite-500">{operations ? `${metric.capableCount} / ${metric.totalCount} 项会做` : `${metric.confirmedCount} / ${metric.totalCount} 项已确认`}</p></div><span className="rounded-md bg-graphite-100 px-2 py-1 text-[0.6875rem] font-semibold text-graphite-700">{state}</span></div>
    <p className="mt-4 text-2xl font-semibold tabular-nums tracking-[-0.03em] text-graphite-950">{percentage == null ? "—" : `${percentage.toFixed(1)}%`}</p>
    <CapacityBar value={percentage} label={`${label} ${percentage == null ? "未确认" : `${percentage.toFixed(1)}%`}`} reduce={reduce} />
  </article>;
}

function CapacityBar({ value, label, reduce }: { value: number | null; label: string; reduce: boolean }) {
  const safeValue = Math.max(0, Math.min(100, value ?? 0));
  const fill = safeValue >= 99.5 ? "bg-signal-emerald" : safeValue >= 75 ? "bg-signal-teal" : safeValue >= 40 ? "bg-signal-teal/75" : "bg-signal-teal/50";
  return <div className="mt-3 flex items-center gap-1" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value == null ? undefined : Math.round(safeValue)} aria-valuetext={value == null ? "未确认" : undefined}>
    <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-[0.25rem] border border-graphite-300 bg-graphite-100 p-px"><motion.div className={`motion-progress-fill h-full rounded-[0.125rem] ${fill}`} initial={false} animate={{ scaleX: safeValue / 100 }} transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 190, damping: 28 }} /></div>
    <span className="h-1.5 w-1 shrink-0 rounded-r-sm bg-graphite-300" aria-hidden="true" />
  </div>;
}
