import type { Employee, EmployeeSensitiveProfile, EmployeeStatus, EmployeeType, SkillModeV1, SkillPresentationStatus, StoreJob, StoreJobColorToken } from "../types/evaluation";
import { apiRequest } from "./apiClient";

export type EmployeeListParams = {
  storeId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
  employmentType?: Employee["employmentType"] | "all";
  employeeType?: EmployeeType | "all";
  status?: EmployeeStatus | "all";
  jobId?: string | "all";
};

export type EmployeeMutationPayload = {
  id?: string;
  storeId: string;
  displayName: string;
  employmentType: Employee["employmentType"];
  employeeType: EmployeeType;
  status?: EmployeeStatus;
  surname?: string | null; givenName?: string | null; englishName?: string | null;
  gender?: "MALE" | "FEMALE" | null; dateOfBirth?: string | null;
  emailAddress?: string | null; mobileTelephoneNumber?: string | null;
  addressLine?: string | null; suburb?: string | null; state?: string | null; postcode?: string | null;
  employmentCommencementDate?: string | null; bankAccountName?: string | null; bsbNumber?: string | null;
  bankAccountNumber?: string | null; taxFileNumber?: string | null; abn?: string | null;
  holdsWorkingHolidayVisa?: boolean | null; visaType?: string | null; superannuationCompany?: string | null;
  superannuationAccountNumber?: string | null; uniqueSuperannuationIdentifier?: string | null;
  jobIds?: string[];
};

export type EmployeeUpdatePayload = Partial<Omit<EmployeeMutationPayload, "id">> & { expectedUpdatedAt?: string };

export type PaginatedEmployeeResponse = {
  items: Employee[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CurrentSkillDefinition = {
  id: string;
  code: string;
  nameZh: string;
  category: string;
  skillMode: SkillModeV1;
  status: SkillPresentationStatus;
  updatedAt: string | null;
};

export type CurrentSkillConfirmation = {
  id: string;
  previousStatus: SkillPresentationStatus | null;
  confirmedStatus: SkillPresentationStatus;
  confirmedByAccountId: string;
  confirmedByName: string;
  reason: string | null;
  confirmedAt: string;
};

export const employeeRepository = {
  async fetchEmployees(params: EmployeeListParams = {}) {
    const searchParams = buildEmployeeSearchParams(params);
    return apiRequest<PaginatedEmployeeResponse>(`/employees?${searchParams.toString()}`);
  },
  async fetchEmployeesByStore(storeId: string, params: Omit<EmployeeListParams, "storeId"> = {}) {
    const searchParams = buildEmployeeSearchParams(params);
    return apiRequest<PaginatedEmployeeResponse>(
      `/stores/${encodeURIComponent(storeId)}/employees?${searchParams.toString()}`,
    );
  },
  async fetchEmployee(employeeId: string) {
    return apiRequest<Employee>(`/employees/${encodeURIComponent(employeeId)}`);
  },
  async fetchEmployeeProfile(employeeId: string) {
    return apiRequest<EmployeeSensitiveProfile>(`/employees/${encodeURIComponent(employeeId)}/profile`);
  },
  async fetchCurrentSkills(employeeId: string) {
    return apiRequest<{ skills: CurrentSkillDefinition[] }>(`/employees/${encodeURIComponent(employeeId)}/current-skills`);
  },
  async fetchCurrentSkillConfirmations(employeeId: string, skillDefinitionId: string, page = 1) {
    return apiRequest<{ items: CurrentSkillConfirmation[]; page: number; pageSize: number; total: number; totalPages: number }>(
      `/employees/${encodeURIComponent(employeeId)}/current-skills/${encodeURIComponent(skillDefinitionId)}/confirmations?page=${page}&pageSize=5`,
    );
  },
  async confirmCurrentSkill(employeeId: string, skill: CurrentSkillDefinition, status: SkillPresentationStatus, reason: string) {
    return apiRequest<{ skills: CurrentSkillDefinition[] }>(`/employees/${encodeURIComponent(employeeId)}/current-skills/${encodeURIComponent(skill.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status, expectedUpdatedAt: skill.updatedAt, reason }),
    });
  },
  async createEmployee(payload: EmployeeMutationPayload) {
    return apiRequest<Employee>("/employees", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async updateEmployee(employeeId: string, payload: EmployeeUpdatePayload) {
    return apiRequest<Employee>(`/employees/${encodeURIComponent(employeeId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },
  async promoteToRegular(employeeId: string) {
    return apiRequest<Employee>(`/employees/${encodeURIComponent(employeeId)}/promote-to-regular`, { method: "POST" });
  },
  async archiveEmployee(employeeId: string) {
    return apiRequest<Employee>(`/employees/${encodeURIComponent(employeeId)}/archive`, {
      method: "POST",
    });
  },
  async restoreEmployee(employeeId: string) {
    return apiRequest<Employee>(`/employees/${encodeURIComponent(employeeId)}/restore`, {
      method: "POST",
    });
  },
  async fetchStoreJobs(storeId?: string, includeInactive = false) {
    const params = new URLSearchParams();
    if (storeId) params.set("storeId", storeId);
    if (includeInactive) params.set("includeInactive", "true");
    return apiRequest<StoreJob[]>(`/store-jobs?${params.toString()}`);
  },
  async createStoreJob(storeId: string, payload: { name: string; code?: string | null; colorToken: StoreJobColorToken; displayOrder: number }) {
    return apiRequest<StoreJob>(`/stores/${encodeURIComponent(storeId)}/jobs`, { method: "POST", body: JSON.stringify(payload) });
  },
  async updateStoreJob(jobId: string, payload: Partial<Pick<StoreJob, "name" | "code" | "colorToken" | "displayOrder" | "isActive">>) {
    return apiRequest<StoreJob>(`/store-jobs/${encodeURIComponent(jobId)}`, { method: "PATCH", body: JSON.stringify(payload) });
  },
};

function buildEmployeeSearchParams(params: EmployeeListParams) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "all" && `${value}`.trim().length > 0) {
      searchParams.set(key, `${value}`);
    }
  });
  return searchParams;
}
