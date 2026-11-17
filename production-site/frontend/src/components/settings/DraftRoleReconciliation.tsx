import { Link } from "react-router-dom";
import type { DraftRoleUsage } from "../../services/rosterRepository";

export function DraftRoleReconciliation({ storeId, usage, verifiedRoleIds, error, loading, onRetry }: {
  storeId: string;
  usage: DraftRoleUsage[];
  verifiedRoleIds: ReadonlySet<string>;
  error?: string | null;
  loading?: boolean;
  onRetry?: () => void;
}) {
  if (loading) return <p className="mt-5 rounded-2xl border border-graphite-200 bg-white p-5 text-sm text-graphite-600" role="status">正在重新读取待核对草稿岗位…</p>;
  if (error) return <section className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800" role="alert">
    <strong>待核对草稿岗位暂时无法读取</strong><span className="ml-2">{error}</span>
    {onRetry ? <button type="button" className="ml-3 font-semibold underline" onClick={onRetry}>重新读取</button> : null}
  </section>;
  const pending = usage.filter((item) => !verifiedRoleIds.has(item.id));
  if (!pending.length) return null;
  const total = pending.reduce((count, item) => count + item.shiftCount, 0);
  return <details className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6" aria-label="待核对的历史草稿岗位">
    <summary className="cursor-pointer text-base font-semibold text-amber-950">历史草稿岗位待核对 · {total} 个班次</summary>
    <p className="mt-3 text-sm text-amber-900">以下 Roster 岗位不在本店当前可选的 Evaluate 正式岗位中。请打开草稿班次，核对实际工作内容后选择正式岗位；已发布历史不会随草稿修改。</p>
    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
      {pending.map((item) => <li key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm">
        <span className="min-w-0"><strong className="block truncate text-graphite-950">{item.nameZh}</strong><span className="text-xs text-graphite-600">{item.code} · {item.shiftCount} 个草稿班次{item.isActive ? "" : " · Roster 已停用"}</span></span>
        <Link className="calendar-text-button" to={`/calendar?${new URLSearchParams({ store: storeId, view: "timeGridWeek", date: item.firstDate })}`} aria-label={`查看 ${item.nameZh} 最早的草稿班次`}>查看 {item.firstDate}</Link>
      </li>)}
    </ul>
  </details>;
}
