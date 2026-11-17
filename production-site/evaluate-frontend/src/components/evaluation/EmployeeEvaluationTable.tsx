import { Eye, FilePenLine, Rows3 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { formatScore } from "../../lib/format";
import { employmentTypeLabel } from "../../lib/presentation";
import { withEvaluationNavigation } from "../../lib/evaluationNavigation";
import type { StoreEvaluationRosterItem } from "../../types/evaluation";
import { EmployeeTypeBadge } from "../badges/EmployeeTypeBadge";
import { EmptyState } from "../states/EmptyState";

export function EmployeeEvaluationTable({ evaluations, isAdmin = false }: { evaluations: StoreEvaluationRosterItem[]; embedded?: boolean; isAdmin?: boolean }) {
  const location = useLocation();
  if (!evaluations.length) return <EmptyState title="没有匹配的员工" description="请调整筛选或搜索条件。" />;
  return <div className="overflow-hidden rounded-xl bg-white shadow-panel ring-1 ring-graphite-200">
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1060px] divide-y divide-graphite-200">
        <thead className="bg-graphite-50"><tr>
          <Header>员工</Header><Header>最近正式综合</Header><Header>Tier</Header><Header>本轮进度</Header>{isAdmin ? <Header>本轮临时综合</Header> : null}<Header>我的评分</Header><th className="px-5 py-3 text-right text-xs font-semibold text-graphite-600">操作</th>
        </tr></thead>
        <tbody className="divide-y divide-graphite-100">{evaluations.map((row) => {
          const formal = row.latestCompletedEvaluation;
          const current = row.currentRound;
          const mine = current?.myEvaluation;
          const scoreTarget = withEvaluationNavigation(`/employees/${row.employee.id}/evaluation/v1/new`, location, "employee-list");
          const roundTarget = current ? withEvaluationNavigation(`/evaluation-rounds/${current.id}`, location, "employee-list") : null;
          return <tr key={row.employee.id} className="hover:bg-blue-50/30">
            <td className="px-5 py-4"><div className="flex items-center gap-2"><Link to={`/employees/${row.employee.id}`} className="font-semibold text-graphite-950 hover:text-blue-700 hover:underline">{row.employee.displayName}</Link><EmployeeTypeBadge employeeType={row.employee.employeeType} /></div><p className="mt-1 text-xs text-graphite-500">{employmentTypeLabel(row.employee.employmentType)}</p></td>
            <td className="px-5 py-4 text-sm font-semibold tabular-nums text-graphite-950">{formal?.overallScore == null ? "-" : formatScore(formal.overallScore)}</td>
            <td className="px-5 py-4 text-sm font-bold text-graphite-800">{formal?.tier ?? "-"}</td>
            <td className="px-5 py-4"><span className="whitespace-nowrap rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-200">{current ? `${current.completedCount} / ${current.eligibleCount}` : `0 / ${row.eligibleEvaluatorCount ?? 0}`}</span></td>
            {isAdmin ? <td className="px-5 py-4 text-sm font-semibold tabular-nums text-graphite-950">{current?.provisionalOverall == null ? "暂无本轮评分" : `${formatScore(current.provisionalOverall)} 临时`}</td> : null}
            <td className="px-5 py-4 text-sm font-semibold tabular-nums text-graphite-950">{mine?.overallScore == null ? "未评分" : formatScore(mine.overallScore)}</td>
            <td className="px-5 py-4"><div className="flex justify-end gap-2">
              <Link to={scoreTarget.to} state={scoreTarget.state} className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg bg-graphite-950 px-3 text-xs font-semibold text-white hover:bg-graphite-800"><FilePenLine className="h-4 w-4" />{mine ? "再次评分" : "评分"}</Link>
              {isAdmin && roundTarget ? <Link to={roundTarget.to} state={roundTarget.state} className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-graphite-300 bg-white px-3 text-xs font-semibold text-graphite-800 hover:bg-graphite-50"><Rows3 className="h-4 w-4" />查看本轮</Link> : null}
              <Link to={`/employees/${row.employee.id}`} aria-label={`查看 ${row.employee.displayName}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-graphite-100 text-graphite-700 hover:bg-graphite-200"><Eye className="h-4 w-4" /></Link>
            </div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}

function Header({ children }: { children: React.ReactNode }) { return <th className="whitespace-nowrap px-5 py-3 text-left text-xs font-semibold uppercase text-graphite-500">{children}</th>; }
