import { apiRequest } from "../lib/apiClient";
import type { RosterEmployee, RosterSkillDefinition, RosterStore, RosterStoreJob, WorkforceEnvelope } from "../types/workforce";

export const workforceRepository = {
  stores() { return apiRequest<WorkforceEnvelope<{ stores: RosterStore[] }>>("/workforce/stores"); },
  skillDefinitions() { return apiRequest<{ skills: RosterSkillDefinition[] }>("/workforce/skill-definitions"); },
  jobs(storeId: string) { return apiRequest<{ jobs: RosterStoreJob[] }>(`/workforce/stores/${encodeURIComponent(storeId)}/jobs`); },
  employees(storeId: string) { return apiRequest<WorkforceEnvelope<{ employees: RosterEmployee[] }>>(`/workforce/stores/${encodeURIComponent(storeId)}/employees`); },
  employee(employeeId: string) { return apiRequest<WorkforceEnvelope<{ employee: RosterEmployee }>>(`/workforce/employees/${encodeURIComponent(employeeId)}`); },
};

