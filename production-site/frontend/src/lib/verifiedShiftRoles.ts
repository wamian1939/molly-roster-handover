import type { ShiftRole } from "../types/roster";
import type { RosterStoreJob } from "../types/workforce";
import { evaluateJobColor } from "./evaluateJobColor";

// Match the backend's single established legacy association. A display-name
// match alone must not turn an old scheduling role into a formal Evaluate job.
function approvedLegacyAlias(job: RosterStoreJob, role: ShiftRole) {
  return job.code === "full-role" && job.name === "全岗" && role.code === "all-rounder" && role.nameZh === "全岗";
}

// Evaluate owns formal jobs. Roster roles only provide scheduling metadata for
// jobs that can be matched to the current store's active formal catalog.
export function verifiedShiftRoles(roles: ShiftRole[], jobs: RosterStoreJob[], storeId: string): ShiftRole[] {
  const available = roles.filter((role) => role.isActive !== false && (role.storeId === null || role.storeId === storeId));
  const activeJobs = jobs.filter((job) => job.isActive && job.storeId === storeId);
  const selected = new Set<string>();
  const matched = new Map<string, ShiftRole>();
  const choose = (matches: ShiftRole[]) => matches.find((role) => role.storeId === storeId && !selected.has(role.id))
    ?? matches.find((role) => !selected.has(role.id));

  // Reserve code matches across the full catalog before considering legacy name matches.
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
  return activeJobs.flatMap((job) => {
    const role = matched.get(job.id);
    return role ? [{ ...role, nameZh: job.name, colorToken: evaluateJobColor(job.colorToken) ?? role.colorToken,
      displayOrder: job.displayOrder, formalJobId: job.id }] : [];
  });
}
