import type { PerformanceNote, PerformanceNoteDimension, PerformanceNoteType } from "../types/evaluation";
import { apiRequest } from "./apiClient";

export type PerformanceNoteListParams = {
  employeeId?: string;
  storeId?: string;
  noteType?: PerformanceNoteType | "all";
  dimension?: PerformanceNoteDimension | "all";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type PerformanceNoteMutationPayload = {
  employeeId: string;
  storeId: string;
  noteDate?: string;
  noteType: PerformanceNoteType;
  dimensions: PerformanceNoteDimension[];
  scoreImpact?: number | null;
  noteText: string;
};

export type PaginatedPerformanceNoteResponse = {
  items: PerformanceNote[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export const performanceNoteRepository = {
  async listPerformanceNotes(params: PerformanceNoteListParams = {}) {
    const searchParams = buildSearchParams(params);
    return apiRequest<PaginatedPerformanceNoteResponse>(`/performance-notes?${searchParams.toString()}`);
  },
  async getPerformanceNotesForEmployee(employeeId: string, params: Omit<PerformanceNoteListParams, "employeeId"> = {}) {
    const searchParams = buildSearchParams(params);
    return apiRequest<PaginatedPerformanceNoteResponse>(
      `/employees/${encodeURIComponent(employeeId)}/performance-notes?${searchParams.toString()}`,
    );
  },
  async createPerformanceNote(payload: PerformanceNoteMutationPayload) {
    return apiRequest<PerformanceNote>("/performance-notes", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

function buildSearchParams(params: PerformanceNoteListParams) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "all" && `${value}`.trim().length > 0) {
      searchParams.set(key, `${value}`);
    }
  });
  return searchParams;
}
