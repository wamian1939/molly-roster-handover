import { evaluateJobColor } from "./evaluateJobColor.js";

export type FormalJob = { id: string; isActive: boolean; code: string | null; name: string; colorToken?: string };
export type SchedulingRole = { id: string; storeId: string | null; isActive: boolean; code: string; nameZh: string };
export type EmployeePosition = { id: string; code: string | null; name: string };

// Existing local data predates Evaluate's full-role code. Keep this one
// established association; a matching display name alone is not authority.
function approvedLegacyAlias(job: FormalJob, role: SchedulingRole) {
  return job.code === "full-role" && job.name === "全岗" && role.code === "all-rounder" && role.nameZh === "全岗";
}

export function matchFormalRoles(jobs: FormalJob[], roles: SchedulingRole[], storeId: string) {
  const activeJobs = jobs.filter((job) => job.isActive);
  const available = roles.filter((role) => role.isActive && (role.storeId === null || role.storeId === storeId));
  const selected = new Set<string>();
  const matched = new Map<string, (typeof available)[number]>();
  const choose = (matches: typeof available) => matches.find((role) => role.storeId === storeId && !selected.has(role.id))
    ?? matches.find((role) => !selected.has(role.id));
  for (const job of activeJobs) {
    if (!job.code) continue;
    const role = choose(available.filter((item) => item.code === job.code));
    if (!role) continue;
    selected.add(role.id);
    matched.set(job.id, role);
  }
  for (const job of activeJobs) {
    if (matched.has(job.id)) continue;
    const role = choose(available.filter((item) => approvedLegacyAlias(job, item)));
    if (!role) continue;
    selected.add(role.id);
    matched.set(job.id, role);
  }
  const entries = activeJobs.flatMap((job) => {
    const role = matched.get(job.id);
    return role ? [{ id: role.id, name: job.name }] : [];
  });
  return {
    ids: entries.map((item) => item.id),
    names: Object.fromEntries(entries.map((item) => [item.id, item.name])),
    colors: Object.fromEntries([...matched].flatMap(([jobId, role]) => {
      const color = evaluateJobColor(activeJobs.find((job) => job.id === jobId)?.colorToken);
      return color ? [[role.id, color]] : [];
    })),
    jobRoleIds: Object.fromEntries([...matched].map(([jobId, role]) => [jobId, role.id])),
  };
}

// A Job definition is not an employee grant. Match by canonical Evaluate Job ID,
// never by the employee's skill summary or a matching display name.
export function qualifiedEmployeeIdsByRole(
  jobRoleIds: Record<string, string>,
  employees: Array<{ id: string; isActive: boolean; positions?: EmployeePosition[] }>,
) {
  const qualified: Record<string, string[]> = {};
  for (const [jobId, roleId] of Object.entries(jobRoleIds)) {
    qualified[roleId] = employees.filter((employee) => employee.isActive && employee.positions?.some((position) => position.id === jobId))
      .map((employee) => employee.id);
  }
  return qualified;
}

export function assertRoleAssociationUnchanged(jobs: FormalJob[], roles: SchedulingRole[], storeId: string,
  roleId: string, nextName: string) {
  const candidates = roles.map((role) => role.id === roleId ? { ...role, isActive: true, nameZh: nextName } : role);
  const formal = matchFormalRoles(jobs, candidates, storeId);
  if (formal.names[roleId] !== nextName) return "INVALID" as const;
  const matchedJob = jobs.find((job) => formal.jobRoleIds[job.id] === roleId);
  const previousRoleId = matchedJob && matchFormalRoles(jobs, roles, storeId).jobRoleIds[matchedJob.id];
  return previousRoleId && previousRoleId !== roleId ? "TAKEN" as const : "OK" as const;
}
