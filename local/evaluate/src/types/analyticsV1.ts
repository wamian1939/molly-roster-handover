import type { EmployeeType, TierV1 } from "./evaluation";

type AnalyticsStoreOption = { id: string; name: string };

type AnalyticsSummaryV1 = {
  employees: number;
  regularEmployees: number;
  trainingEmployees: number;
  evaluatedEmployees: number;
  notEvaluatedEmployees: number;
  evaluationCoverage: number;
  averageScore: number | null;
  averageSkillScore: number | null;
  averageCurrentSkillCoverage: number | null;
  initializedSkillProfiles: number;
};

type TierDistributionV1 = {
  tier: TierV1;
  count: number;
  percentage: number;
};

export type EmployeeScoreV1 = {
  employeeId: string;
  employeeName: string;
  employeeType: EmployeeType;
  evaluationEmployeeType: EmployeeType;
  storeId: string;
  storeName: string;
  overallScore: number;
  tier: TierV1;
  completedAt: string;
};

type SkillCoverageV1 = {
  skillDefinitionId: string;
  skillCode: string;
  skillNameZh: string;
  skillNameEn: string;
  category: string;
  qualifiedEmployees: number;
  knownEmployees: number;
  totalEmployees: number;
  coverage: number | null;
  profileCompletion: number;
};

export type DashboardV1Data = {
  stores: AnalyticsStoreOption[];
  summary: AnalyticsSummaryV1;
  tierDistribution: TierDistributionV1[];
  skillGaps: SkillCoverageV1[];
  topEmployees: EmployeeScoreV1[];
  needsAttention: Array<EmployeeScoreV1 & {
    skillCoverage: number | null;
    reasons: Array<"LowOverallScore" | "LowSkillCoverage">;
  }>;
  notEvaluatedEmployees: Array<{
    employeeId: string;
    employeeName: string;
    employeeType: EmployeeType;
    storeId: string;
    storeName: string;
  }>;
};

export type AnalyticsV1Data = {
  stores: AnalyticsStoreOption[];
  selectedEmployeeType: EmployeeType | null;
  summary: AnalyticsSummaryV1;
  tierDistribution: TierDistributionV1[];
  averageRatings: Array<{
    dimension: "speed" | "initiative" | "attitude" | "availability";
    average: number | null;
    sampleSize: number;
  }>;
  weakestDimension: {
    dimension: "speed" | "initiative" | "attitude" | "availability";
    average: number;
    sampleSize: number;
  } | null;
  skillProfiles: { initializedEmployees: number; totalEmployees: number };
  skillCoverage: SkillCoverageV1[];
  categoryCoverage: Array<{ category: string; coverage: number | null; activeSkills: number }>;
  scoreTrend: Array<{
    month: string;
    averageCompletedEvaluationScore: number;
    completedEvaluations: number;
  }>;
  mostImproved: EmployeeMovementV1[];
  scoreDecreased: EmployeeMovementV1[];
  employees: Array<EmployeeScoreV1 & { skillCoverage: number | null }>;
};

export type EmployeeMovementV1 = {
  employeeId: string;
  employeeName: string;
  employeeType: EmployeeType;
  storeId: string;
  storeName: string;
  latestScore: number;
  previousScore: number;
  delta: number;
  latestCompletedAt: string;
  latestEvaluationEmployeeType: EmployeeType;
};
