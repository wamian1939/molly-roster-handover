import { ArrowRight, Sparkles } from "lucide-react";
import type { EvaluationV1TextAnalysis, SkillStatusV1 } from "../../types/evaluation";

type TextFeedbackPanelProps = {
  value: string;
  analysis: EvaluationV1TextAnalysis | null;
  disabled: boolean;
  isAnalyzing: boolean;
  onChange: (value: string) => void;
  onAnalyze: () => void;
  onApplySuggestion: (skillCode: string, status: SkillStatusV1) => void;
};

export function TextFeedbackPanel({
  value,
  analysis,
  disabled,
  isAnalyzing,
  onChange,
  onAnalyze,
  onApplySuggestion,
}: TextFeedbackPanelProps) {
  return (
    <section className="rounded-xl bg-white p-5 shadow-panel ring-1 ring-graphite-200 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-graphite-500">补充反馈</p>
          <h2 className="mt-1 text-lg font-semibold text-graphite-950">文字评价（可选）</h2>
          <p className="mt-1 text-sm text-graphite-600">一句或几句自然描述即可，无需固定格式。</p>
        </div>
        {value.trim() ? (
          <button
            type="button"
            onClick={onAnalyze}
            disabled={disabled || isAnalyzing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-graphite-200 bg-white px-3 text-sm font-semibold text-graphite-800 transition hover:bg-graphite-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {isAnalyzing ? "分析中..." : "分析评价"}
          </button>
        ) : null}
      </div>
      <label className="sr-only" htmlFor="v1-text-feedback">文字评价</label>
      <textarea
        id="v1-text-feedback"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={5}
        maxLength={4000}
        className="mt-4 w-full resize-y rounded-xl border border-graphite-200 bg-graphite-50 px-4 py-3 text-sm leading-6 text-graphite-950 transition placeholder:text-graphite-400 focus:border-blue-400 focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
        placeholder="例如：最近水吧速度提升明显，做事比较主动，高峰时偶尔会乱，后厨还需要继续练。"
      />

      {analysis ? (
        <div className="mt-4 border-t border-graphite-100 pt-4" aria-live="polite">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-graphite-950">AI 文字得分：{analysis.textScore.toFixed(1)} / 10</p>
            {analysis.status === "Fallback" ? (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                中性默认分
              </span>
            ) : null}
          </div>
          {analysis.status === "Fallback" ? (
            <p className="mt-2 text-sm text-amber-800">
              AI 分析暂不可用，现在完成评价将使用中性默认分。
            </p>
          ) : null}
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <EvidenceList label="正向依据" items={analysis.positiveEvidence} />
            <EvidenceList label="关注依据" items={analysis.concernEvidence} />
          </div>
          {analysis.possibleSkillUpdates.length > 0 ? (
            <div className="mt-4 border-t border-graphite-100 pt-4">
              <p className="text-xs font-semibold text-graphite-500">可能的技能更新</p>
              <div className="mt-2 space-y-2">
                {analysis.possibleSkillUpdates.map((suggestion) => (
                  <div
                    key={`${suggestion.skillCode}-${suggestion.suggestedStatus}`}
                    className="flex flex-col gap-2 rounded-lg bg-graphite-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="text-sm text-graphite-700">{suggestion.message}</p>
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={() => onApplySuggestion(suggestion.skillCode, suggestion.suggestedStatus)}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg border border-graphite-200 bg-white px-2.5 text-xs font-semibold text-graphite-800 hover:bg-graphite-100"
                      >
                        应用
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EvidenceList({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-graphite-500">{label}</p>
      <ul className="mt-2 space-y-1 text-sm text-graphite-700">
        {items.map((item) => <li key={item}>• {item}</li>)}
      </ul>
    </div>
  );
}
