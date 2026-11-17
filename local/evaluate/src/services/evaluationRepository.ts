import type {
  EvaluationHistoryResponse,
  EvaluationV1,
  EvaluationV1ScorePreview,
  EvaluationV1SkillPreview,
  EvaluationV1TextAnalysis,
  EmployeeEvaluationSummary,
  RosterSkillBoardResponse,
  SkillPresentationStatus,
  StoreEvaluationRosterResponse,
  StoreEvaluationStatus,
  EvaluationRoundAggregate,
} from "../types/evaluation";
import type { AnalyticsV1Data, DashboardV1Data } from "../types/analyticsV1";
import { apiRequest } from "./apiClient";

export type LiveEvaluationSubmissionPayload = {
  speedRating: number;
  initiativeRating: number;
  attitudeRating: number;
  availabilityRating: number;
  textFeedback: string;
  skills: Array<{ skillDefinitionId: string; status: Exclude<SkillPresentationStatus, "Unknown"> }>;
};

export type LiveSkillPreviewPayload = {
  skills: Array<{ skillDefinitionId: string; status: SkillPresentationStatus }>;
};

export type StoreEvaluationQueryParams = {
  page?: number;
  pageSize?: number;
  status?: StoreEvaluationStatus | "all";
  employmentType?: string;
  employeeType?: import("../types/evaluation").EmployeeType | "all";
  search?: string;
};

export const evaluationRepository = {
  async fetchStores() {
    return apiRequest<import("../types/evaluation").Store[]>("/stores");
  },
  async fetchDashboard(storeId?: string) {
    const params = new URLSearchParams();
    if (storeId) params.set("storeId", storeId);
    return apiRequest<DashboardV1Data>(`/evaluations/dashboard?${params.toString()}`);
  },
  async fetchStoreEvaluations(storeId: string, params: StoreEvaluationQueryParams = {}) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "all" && `${value}`.trim().length > 0) {
        searchParams.set(key, `${value}`);
      }
    });
    return apiRequest<StoreEvaluationRosterResponse>(
      `/stores/${encodeURIComponent(storeId)}/evaluations?${searchParams.toString()}`,
    );
  },
  async fetchHistoryIndex(input: { storeId?: string; employeeType?: string; employeeId?: string; tier?: string; jobId?: string; dateFrom?: string; dateTo?: string; page?: number; pageSize?: number } = {}) {
    const params = new URLSearchParams();
    Object.entries(input).forEach(([key, value]) => { if (value !== undefined && value !== "") params.set(key, String(value)); });
    return apiRequest<EvaluationHistoryResponse>(`/evaluation-rounds/history?${params.toString()}`);
  },
  async fetchAnalytics(storeId?: string, employeeType?: import("../types/evaluation").EmployeeType) {
    const params = new URLSearchParams();
    if (storeId) params.set("storeId", storeId);
    if (employeeType) params.set("employeeType", employeeType);
    return apiRequest<AnalyticsV1Data>(`/evaluations/analytics?${params.toString()}`);
  },
  async fetchRosterSkillBoard(storeId?: string) {
    const params = new URLSearchParams();
    if (storeId) params.set("storeId", storeId);
    return apiRequest<RosterSkillBoardResponse>(`/roster-skill-board?${params.toString()}`);
  },
  async fetchCurrentEvaluationRound(employeeId: string) {
    return apiRequest<EvaluationRoundAggregate | null>(`/employees/${encodeURIComponent(employeeId)}/evaluation-rounds/current`);
  },
  async startLiveScoring(employeeId: string) {
    return apiRequest<EvaluationV1>(`/employees/${encodeURIComponent(employeeId)}/scoring-context`, { method: "POST" });
  },
  async fetchLiveScoringContext(roundId: string) {
    return apiRequest<EvaluationV1>(`/evaluation-rounds/${encodeURIComponent(roundId)}/scoring-context`);
  },
  async previewLiveEvaluation(roundId: string, payload: LiveEvaluationSubmissionPayload) {
    return apiRequest<EvaluationV1ScorePreview>(`/evaluation-rounds/${encodeURIComponent(roundId)}/preview-my-evaluation`, { method: "POST", body: JSON.stringify(payload) });
  },
  async previewLiveSkills(roundId: string, payload: LiveSkillPreviewPayload) {
    return apiRequest<EvaluationV1SkillPreview>(`/evaluation-rounds/${encodeURIComponent(roundId)}/preview-my-skills`, { method: "POST", body: JSON.stringify(payload) });
  },
  async analyzeLiveEvaluationText(roundId: string, textFeedback: string) {
    return apiRequest<EvaluationV1TextAnalysis>(`/evaluation-rounds/${encodeURIComponent(roundId)}/analyze-my-evaluation`, { method: "POST", body: JSON.stringify({ textFeedback }) });
  },
  async submitLiveEvaluation(roundId: string, payload: LiveEvaluationSubmissionPayload) {
    return apiRequest<EvaluationV1>(`/evaluation-rounds/${encodeURIComponent(roundId)}/my-evaluation`, { method: "PUT", body: JSON.stringify(payload) });
  },
  async fetchEvaluationRound(roundId: string) {
    return apiRequest<EvaluationRoundAggregate>(`/evaluation-rounds/${encodeURIComponent(roundId)}`);
  },
  async fetchEvaluationRoundAggregate(roundId: string) {
    return apiRequest<EvaluationRoundAggregate>(`/evaluation-rounds/${encodeURIComponent(roundId)}/aggregate`);
  },
  async fetchMyEvaluation(roundId: string) {
    return apiRequest<EvaluationV1 | null>(`/evaluation-rounds/${encodeURIComponent(roundId)}/my-evaluation`);
  },
  async closeEvaluationRound(roundId: string) {
    return apiRequest<EvaluationRoundAggregate>(`/evaluation-rounds/${encodeURIComponent(roundId)}/close`, { method: "POST" });
  },
  async getEvaluationV1(evaluationId: string) {
    return apiRequest<EvaluationV1>(`/evaluations/v1/${encodeURIComponent(evaluationId)}`);
  },
  async fetchEmployeeEvaluationSummary(employeeId: string) {
    return apiRequest<EmployeeEvaluationSummary>(
      `/employees/${encodeURIComponent(employeeId)}/evaluation-summary`,
    );
  },
};
