import { CheckCircle2, CircleDashed } from "lucide-react";
import { cx, formatDateTime } from "../../lib/format";
import type { EvaluationV1Skill, SkillCategoryBreakdownV1 } from "../../types/evaluation";
import { skillStatusLabels, skillStatusStyles } from "../evaluation-v1/skillPresentation";
import { categoryLabels } from "../../lib/presentation";

const categoryOrder = ["BackKitchen", "Back Kitchen", "Bar", "Front", "Operations"];
type ReadOnlySkillMatrixProps = {
  title: string;
  description: string;
  skills: EvaluationV1Skill[];
  updatedAt?: string | null;
  emptyMessage: string;
  breakdown?: SkillCategoryBreakdownV1;
  overallRatio?: number | null;
};

export function ReadOnlySkillMatrix({ title, description, skills, updatedAt, emptyMessage, breakdown, overallRatio }: ReadOnlySkillMatrixProps) {
  const categories = [...new Set(skills.map((skill) => skill.category))].sort(
    (left, right) => categoryOrder.indexOf(left) - categoryOrder.indexOf(right),
  );

  return (
    <section className="rounded-xl bg-white shadow-panel ring-1 ring-graphite-200">
      <div className="border-b border-graphite-100 px-5 py-5 sm:px-6">
        <h2 className="text-lg font-semibold text-graphite-950">{title}</h2>
        <p className="mt-1 text-sm text-graphite-600">{description}</p>
        {updatedAt ? <p className="mt-2 text-xs font-medium text-graphite-500">更新于 {formatDateTime(updatedAt)}</p> : null}
      </div>
      {breakdown ? <div className="grid gap-2 border-b border-graphite-100 bg-graphite-50/70 px-5 py-3 sm:grid-cols-5 sm:px-6"><Metric label="总技能表现" value={overallRatio == null ? null : overallRatio * 100} /><Metric label="后厨" value={breakdown.backOfHouse.percentage} /><Metric label="水吧" value={breakdown.waterBar.percentage} /><Metric label="前场" value={breakdown.frontOfHouse.percentage} /><div className="rounded-lg bg-white px-3 py-2 ring-1 ring-graphite-200"><p className="text-xs text-graphite-500">操作能力</p><p className="mt-1 text-sm font-semibold text-graphite-950">{breakdown.operations.capableCount} / {breakdown.operations.totalCount}</p></div></div> : null}
      {skills.length === 0 ? (
        <div className="flex items-center gap-3 px-5 py-8 text-sm text-graphite-600 sm:px-6">
          <CircleDashed className="h-5 w-5 text-graphite-400" aria-hidden="true" />
          {emptyMessage}
        </div>
      ) : (
        <div className="grid divide-y divide-graphite-100 lg:grid-cols-3 lg:divide-x lg:divide-y-0">
          {categories.map((category) => (
            <div key={category} className="px-5 py-5 first:pl-5 sm:px-6">
              <h3 className="text-xs font-semibold uppercase text-graphite-500">{categoryLabels[category] ?? category}</h3>
              <dl className="mt-3 space-y-2.5">
                {skills.filter((skill) => skill.category === category).map((skill) => (
                  <div key={skill.skillCode} className="flex items-center justify-between gap-3">
                    <dt className="min-w-0">
                      <p className="truncate text-sm font-semibold text-graphite-900">{skill.skillNameZh}</p>
                    </dt>
                    <dd className={cx(
                      "inline-flex min-h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-semibold",
                      skillStatusStyles[skill.status],
                    )}>
                      {(skill.status === "Independent" || skill.status === "Proficient")
                        ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        : null}
                      {skillStatusLabels[skill.status]}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-graphite-200"><p className="text-xs text-graphite-500">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-graphite-950">{value == null ? "未确认" : `${value.toFixed(1)}%`}</p></div>;
}
