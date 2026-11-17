import { TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "../../lib/format";
import type { EvaluationHistorySummaryV1 } from "../../types/evaluation";

export function V1ScoreTrend({ history }: { history: EvaluationHistorySummaryV1[] }) {
  const chronological = [...history]
    .filter((entry) => entry.overallScore !== null)
    .sort((left, right) => left.completedAt.localeCompare(right.completedAt));
  if (chronological.length === 0) return null;
  const latest = chronological.at(-1)!;
  const previous = chronological.at(-2);
  const change = previous ? latest.overallScore! - previous.overallScore! : null;
  const data = chronological.map((entry) => ({
    completed: formatDate(entry.completedAt),
    score: entry.overallScore,
  }));

  return (
    <section className="rounded-xl bg-white p-5 shadow-panel ring-1 ring-graphite-200 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-graphite-950">正式综合趋势</h2>
          <p className="mt-1 text-sm text-graphite-600">按已结束轮次的结束时间比较 0–100 综合分。</p>
        </div>
        {change !== null ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-blue-800 ring-1 ring-blue-200">
            <TrendingUp className="h-4 w-4" aria-hidden="true" />
            {change >= 0 ? "+" : ""}{change.toFixed(1)}
          </span>
        ) : (
          <span className="rounded-lg bg-graphite-50 px-2.5 py-1 text-sm font-semibold text-graphite-500 ring-1 ring-graphite-200">
            暂无趋势
          </span>
        )}
      </div>
      <div className="mt-5 h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 14, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="#e8ebee" vertical={false} />
            <XAxis dataKey="completed" tickLine={false} axisLine={false} tick={{ fill: "#566171", fontSize: 11 }} />
            <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: "#566171", fontSize: 11 }} />
            <Tooltip formatter={(value) => [`${Number(value).toFixed(1)} / 100`, "综合评分"]} />
            <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3.5 }} activeDot={{ r: 5 }} animationDuration={720} animationEasing="ease-out" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
