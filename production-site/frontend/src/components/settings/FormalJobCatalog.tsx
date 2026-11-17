import { useEffect, useState } from "react";
import { workforceRepository } from "../../services/workforceRepository";
import { evaluateJobColor } from "../../lib/evaluateJobColor";
import type { ShiftRole } from "../../types/roster";
import type { RosterEmployee, RosterStoreJob } from "../../types/workforce";

export function FormalJobCatalog({ storeId, jobs, roles, inactiveRoles, settingsReady, onAssociate }: {
  storeId: string;
  jobs: RosterStoreJob[];
  roles: ShiftRole[];
  inactiveRoles: ShiftRole[];
  settingsReady: boolean;
  onAssociate: (job: RosterStoreJob) => void;
}) {
  const [employees, setEmployees] = useState<RosterEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let current = true;
    workforceRepository.employees(storeId).then((response) => {
      if (!current) return;
      setEmployees(response.employees.filter((employee) => employee.isActive && employee.storeId === storeId));
      setError("");
    }).catch((cause) => {
      if (!current) return;
      setEmployees([]);
      setError(cause instanceof Error ? cause.message : "请稍后重试");
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [storeId, retry]);

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? jobs[0];
  const staffFor = (jobId: string) => employees.filter((employee) => employee.positions?.some((position) => position.id === jobId));
  const selectedStaff = selectedJob ? staffFor(selectedJob.id) : [];

  if (!settingsReady) return <p className="mt-4 text-sm text-graphite-600">当前门店正式岗位清单尚未加载。</p>;

  return <div className="mt-4" aria-label="Evaluate 正式岗位清单">
    {jobs.length ? <div className="space-y-2">{jobs.map((job) => {
      const associated = roles.some((role) => role.formalJobId === job.id);
      const inactive = inactiveRoles.some((role) => role.code === job.code && role.nameZh === job.name);
      return <div key={job.id} className={`flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${selectedJob?.id === job.id ? "border-brand-300 bg-brand-50/50" : "border-graphite-200"}`}>
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedJobId(job.id)} aria-pressed={selectedJob?.id === job.id}>
          <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: evaluateJobColor(job.colorToken) ?? "#334155" }} aria-hidden="true" />
          <strong className="text-graphite-950">{job.name}</strong>
          <span className="ml-2 text-xs text-graphite-500">{job.code ?? "无代码"}</span>
          <span className="mt-0.5 block text-xs text-graphite-600">{loading ? "正在读取授权人数" : error ? "授权人数暂不可用" : `Evaluate 正式授权 ${staffFor(job.id).length} 人`}</span>
        </button>
        {associated ? <span className="shrink-0 text-xs text-graphite-500">已关联排班岗位</span>
          : inactive ? <span className="shrink-0 text-xs text-amber-700">已停用，可在下方重新启用</span>
            : <button type="button" className="calendar-text-button shrink-0" disabled={!job.code || !settingsReady} onClick={() => onAssociate(job)}>选择关联</button>}
      </div>;
    })}</div> : <p className="text-sm text-amber-800">Evaluate 当前门店尚无正式岗位。</p>}
    {error ? <div className="mt-3 text-xs text-amber-800" role="alert">Evaluate 员工授权暂不可读取：{error}。<button type="button" className="ml-2 underline" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>重试</button></div> : null}
    {selectedJob && !loading && !error ? <section className="mt-3 rounded-xl border border-graphite-200 bg-graphite-50 p-3" aria-label={`${selectedJob.name}的正式授权员工`}>
      <h3 className="text-xs font-semibold text-graphite-800">{selectedJob.name} · Evaluate 正式授权 {selectedStaff.length} 人</h3>
      {selectedStaff.length ? <ul className="mt-2 flex flex-wrap gap-2">{selectedStaff.map((employee) => <li key={employee.id} className="rounded-lg bg-white px-2 py-1 text-xs text-graphite-700">{employee.displayName}</li>)}</ul>
        : <p className="mt-1 text-xs text-graphite-600">当前门店尚无员工获得这项正式岗位授权；员工授权需在 Evaluate 单独确认。</p>}
    </section> : null}
  </div>;
}
