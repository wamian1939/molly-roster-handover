import type { StoreJobColorToken } from "../../types/evaluation";

const tones: Record<StoreJobColorToken, string> = {
  rose: "bg-rose-50 text-rose-800 ring-rose-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
  amber: "bg-amber-50 text-amber-900 ring-amber-200",
  blue: "bg-blue-50 text-blue-800 ring-blue-200",
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
};

export function StoreJobTag({ name, colorToken = "slate" }: { name: string; colorToken?: StoreJobColorToken }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${tones[colorToken]}`}>
      {name}
    </span>
  );
}

export function StoreJobTags({ jobs, limit = 2 }: { jobs: Array<{ name: string; colorToken: StoreJobColorToken }>; limit?: number }) {
  if (!jobs.length) return <span className="text-xs text-graphite-500">未设置岗位</span>;
  const shown = jobs.slice(0, limit);
  return (
    <span className="flex flex-wrap items-center gap-1.5" title={jobs.map((job) => job.name).join("、")}>
      {shown.map((job) => <StoreJobTag key={job.name} name={job.name} colorToken={job.colorToken} />)}
      {jobs.length > limit ? <span className="text-xs font-semibold text-graphite-500">+{jobs.length - limit}</span> : null}
    </span>
  );
}
