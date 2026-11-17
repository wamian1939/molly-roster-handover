import { MessageSquareText } from "lucide-react";
import { formatDateTime } from "../../lib/format";
import type { EvaluationV1 } from "../../types/evaluation";
import { ReadOnlySkillMatrix } from "./ReadOnlySkillMatrix";
import { EmployeeTypeBadge } from "../badges/EmployeeTypeBadge";

const ratingRows = [
  ["speed", "速度"],
  ["initiative", "眼里有活"],
  ["attitude", "态度"],
  ["availability", "报班自由度"],
] as const;

export function V1EvaluationDetail({ evaluation, showSkillSnapshot = false }: { evaluation: EvaluationV1; showSkillSnapshot?: boolean }) {
  const positive = evaluation.ai?.evidence.filter((item) => item.type === "Positive") ?? [];
  const concerns = evaluation.ai?.evidence.filter((item) => item.type === "Concern") ?? [];
  const suggestions = evaluation.ai?.evidence.filter((item) => item.type === "PossibleSkillUpdate") ?? [];
  const componentRows = [
    ["skillScore", "技能得分", evaluation.policy.skillWeight],
    ["speedScore", "速度", evaluation.policy.speedWeight],
    ["initiativeScore", "眼里有活", evaluation.policy.initiativeWeight],
    ["attitudeScore", "态度", evaluation.policy.attitudeWeight],
    ["availabilityScore", "报班自由度", evaluation.policy.availabilityWeight],
    ["textScore", "文字评价", evaluation.policy.textWeight],
  ] as const;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-graphite-200 bg-graphite-50 p-4">
          <div className="flex items-end justify-between gap-4 border-b border-graphite-200 pb-3">
            <div>
              <p className="text-xs font-semibold text-graphite-500">评分明细</p>
              <div className="mt-2"><EmployeeTypeBadge employeeType={evaluation.employeeTypeSnapshot} /></div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-graphite-950">
                {evaluation.scores ? evaluation.scores.overallScore.toFixed(1) : "-"} <span className="text-sm text-graphite-500">/ 100</span>
              </p>
            </div>
            {evaluation.scores ? <span className="rounded-lg bg-graphite-950 px-2.5 py-1 text-sm font-bold text-white">{evaluation.scores.tier}</span> : null}
          </div>
          <dl className="mt-3 space-y-2.5">
            {componentRows.map(([key, label, maximum]) => (
              <div key={key} className="flex items-center justify-between gap-4 text-sm">
                <dt className="text-graphite-600">{label}</dt>
                <dd className="font-semibold tabular-nums text-graphite-950">
                  {evaluation.scores ? evaluation.scores[key].toFixed(1) : "-"} / {maximum}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-xl border border-graphite-200 bg-white p-4">
          <p className="text-xs font-semibold text-graphite-500">管理者人工评分</p>
          <dl className="mt-3 space-y-3">
            {ratingRows.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-4 border-b border-graphite-100 pb-3 text-sm last:border-0 last:pb-0">
                <dt className="text-graphite-600">{label}</dt>
                <dd className="font-semibold tabular-nums text-graphite-950">{evaluation.ratings[key] ?? "-"} / 5</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-graphite-500">
            完成于 {evaluation.completedAt ? formatDateTime(evaluation.completedAt) : "日期不可用"}
          </p>
          <p className="mt-1 text-xs text-graphite-500">评价人 {evaluation.evaluatorNameSnapshot ?? "未记录"}</p>
        </section>
      </div>

      <section className="rounded-xl border border-graphite-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-graphite-500" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-graphite-950">文字评价</h3>
        </div>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-graphite-700">
          {evaluation.textFeedback?.trim() || "未保存文字反馈。"}
        </p>
        {(positive.length > 0 || concerns.length > 0 || suggestions.length > 0) ? (
          <div className="mt-4 grid gap-4 border-t border-graphite-100 pt-4 md:grid-cols-3">
            <EvidenceGroup label="正向依据" messages={positive.map((item) => item.message)} />
            <EvidenceGroup label="关注依据" messages={concerns.map((item) => item.message)} />
            <EvidenceGroup label="历史技能建议" messages={suggestions.map((item) => item.message)} />
          </div>
        ) : null}
      </section>

      {showSkillSnapshot ? (
        <ReadOnlySkillMatrix
          title="技能快照"
          description="评价完成时保存的技能状态；当前技能变化不会影响该历史记录。"
          skills={evaluation.skills}
          breakdown={evaluation.skillCategories}
          overallRatio={evaluation.skill?.overallRatio}
          updatedAt={evaluation.completedAt}
          emptyMessage="本次评价未保存技能快照。"
        />
      ) : null}
    </div>
  );
}

function EvidenceGroup({ label, messages }: { label: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-graphite-500">{label}</p>
      <ul className="mt-2 space-y-1.5 text-sm leading-5 text-graphite-700">
        {messages.map((message) => <li key={message}>- {message}</li>)}
      </ul>
    </div>
  );
}
