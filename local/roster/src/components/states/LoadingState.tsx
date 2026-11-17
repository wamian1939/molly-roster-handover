export function LoadingState({ label = "正在加载排班数据" }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-graphite-200 bg-white p-6 shadow-panel" role="status">
      <span className="sr-only">{label}</span>
      <div className="space-y-4">
        <div className="skeleton-shimmer h-5 w-48 rounded bg-graphite-100" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="skeleton-shimmer h-24 rounded-2xl bg-graphite-100" />)}</div>
        <div className="skeleton-shimmer h-72 rounded-2xl bg-graphite-100" />
      </div>
    </div>
  );
}

