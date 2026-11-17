export type EmployeeStatus = "Active" | "Archived";
export type EmployeeType = "TRAINING" | "REGULAR";

export type ScoringPolicySnapshotV1 = {
  policyId?: "REGULAR_V1" | "REGULAR_V2" | "REGULAR_V3" | "TRAINING_LEGACY" | "TRAINING_V1" | "TRAINING_V2";
  tierPolicyVersion?: 1 | 2;
  skillWeight: number;
  speedWeight: number;
  initiativeWeight: number;
  attitudeWeight: number;
  availabilityWeight: number;
  textWeight: number;
};

export type Store = {
  id: string;
  name: string;
  region: string;
  managerName: string;
  city: string;
  isActive?: boolean;
  archivedAt?: string | null;
};

export type Employee = {
  id: string;
  storeId: string;
  storeName?: string;
  displayName: string;
  employmentType: "Full-time" | "Part-time" | "Casual";
  employmentCommencementDate: string | null;
  tenureMonths: number | null;
  status: EmployeeStatus;
  employeeType: EmployeeType;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  evaluationCount?: number;
  jobs: StoreJob[];
};

export type StoreJobColorToken = "rose" | "teal" | "violet" | "amber" | "blue" | "slate";
export type StoreJob = {
  id: string;
  storeId: string;
  name: string;
  code: string | null;
  colorToken: StoreJobColorToken;
  displayOrder: number;
  isActive: boolean;
};

export type EmployeeSensitiveProfile = Employee & {
  surname: string | null; givenName: string | null; englishName: string | null; legalName: string | null;
  gender: "MALE" | "FEMALE" | null; dateOfBirth: string | null;
  emailAddress: string | null; mobileTelephoneNumber: string | null;
  addressLine: string | null; suburb: string | null; state: string | null; postcode: string | null;
  bankAccountName: string | null; bsbNumber: string | null; bankAccountNumber: string | null;
  taxFileNumber: string | null; abn: string | null; holdsWorkingHolidayVisa: boolean | null; visaType: string | null;
  superannuationCompany: string | null; superannuationAccountNumber: string | null;
  uniqueSuperannuationIdentifier: string | null;
};

export type PerformanceNoteType = "Positive" | "Negative" | "Neutral" | "Coaching";

export type PerformanceNoteDimension =
  | "skill"
  | "speed"
  | "initiative"
  | "attitude"
  | "availability"
  | "text";

export type PerformanceNote = {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeStatus?: EmployeeStatus;
  storeId: string;
  storeName: string;
  authorId: string;
  noteDate: string;
  noteType: PerformanceNoteType;
  dimensions: PerformanceNoteDimension[];
  scoreImpact?: number | null;
  noteText: string;
  createdAt: string;
  updatedAt: string;
};

export type SkillStatusV1 = "NotTrained" | "Training" | "Independent" | "Proficient" | "CannotDo" | "CanDo";
export type SkillPresentationStatus = SkillStatusV1 | "Unknown";
export type SkillModeV1 = "PROGRESSIVE" | "BINARY";
export type TierV1 = "T1" | "T2" | "T3" | "T4" | "T5";
type EvaluationV1Status = "Unsubmitted" | "Submitted" | "Completed";
type TextScoreSourceV1 = "Ai" | "NoTextFallback" | "AiFailureFallback";

export type EvaluationV1Ratings = {
  speed: number | null;
  initiative: number | null;
  attitude: number | null;
  availability: number | null;
};

export type EvaluationV1Skill = {
  skillDefinitionId: string | null;
  skillCode: string;
  skillNameZh: string;
  skillNameEn: string;
  category: string;
  skillMode?: SkillModeV1;
  status: SkillPresentationStatus;
  weight: number;
  statusFactor?: number;
  contribution?: number;
};

export type EvaluationV1Scores = {
  skillScore: number;
  speedScore: number;
  initiativeScore: number;
  attitudeScore: number;
  availabilityScore: number;
  textScore: number;
  overallScore: number;
  tier: TierV1;
};

type SkillCategoryMetricV1 = {
  ratio: number | null;
  percentage: number | null;
  weightedRaw: number;
  weightedMax: number;
  confirmedCount: number;
  totalCount: number;
  capableCount: number;
};

export type SkillCategoryBreakdownV1 = {
  backOfHouse: SkillCategoryMetricV1;
  waterBar: SkillCategoryMetricV1;
  frontOfHouse: SkillCategoryMetricV1;
  operations: SkillCategoryMetricV1;
};

type EvaluationV1AiEvidence = {
  type: "Positive" | "Concern" | "PossibleSkillUpdate";
  dimension: string | null;
  skillCode: string | null;
  message: string;
  confidence: number | null;
};

type EvaluationV1Ai = {
  runId: string;
  status: "Success" | "Fallback";
  textScore: number;
  error: string | null;
  evidence: EvaluationV1AiEvidence[];
};

export type EvaluationV1 = {
  id: string;
  roundId: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  storeName: string;
  status: EvaluationV1Status;
  scoringVersion: "v1";
  employeeTypeSnapshot: EmployeeType;
  round: null | { id: string; status: "OPEN" | "CLOSED"; eligibleCount: number; completedCount: number };
  policy: ScoringPolicySnapshotV1;
  ratings: EvaluationV1Ratings;
  textFeedback: string | null;
  textScoreSource: TextScoreSourceV1 | null;
  scores: EvaluationV1Scores | null;
  skillCoverage: number | null;
  skillCategories?: SkillCategoryBreakdownV1;
  skill?: { componentScore: number | null; maxScore: number; overallRatio: number | null; categories: SkillCategoryBreakdownV1 };
  skills: EvaluationV1Skill[];
  ai: EvaluationV1Ai | null;
  evaluatorId: string;
  evaluatorNameSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  completedAt: string | null;
  version: number;
};

export type EvaluationV1ScorePreview = EvaluationV1Scores & {
  scoringVersion: "v1";
  employeeType: EmployeeType;
  policy: ScoringPolicySnapshotV1;
  skillCoverage: {
    capableSkills: number;
    activeSkills: number;
    ratio: number;
    percentage: number;
  };
  skillCategories?: SkillCategoryBreakdownV1;
  skill?: { componentScore: number; maxScore: number; overallRatio: number; categories: SkillCategoryBreakdownV1 };
};

export type EvaluationV1SkillPreview = {
  componentScore: number | null;
  maxScore: number;
  overallRatio: number | null;
  skillCoverage: {
    capableSkills: number;
    activeSkills: number;
    ratio: number;
    percentage: number;
  };
  skillCategories: SkillCategoryBreakdownV1;
};

export type EvaluationV1TextAnalysis = {
  runId: string;
  status: "Success" | "Fallback";
  textScore: number;
  positiveEvidence: string[];
  concernEvidence: string[];
  possibleSkillUpdates: Array<{
    skillCode: string;
    suggestedStatus: SkillStatusV1;
    message: string;
    confidence?: number;
  }>;
  error?: string;
};

type CurrentEmployeeSkill = Omit<EvaluationV1Skill, "status"> & {
  skillDefinitionId: string;
  status: SkillStatusV1;
  updatedAt: string;
};

export type EvaluationHistorySummaryV1 = {
  id: string;
  scoringVersion: "v1";
  employeeId: string;
  employeeName: string;
  storeId: string;
  storeName: string;
  completedAt: string;
  employeeTypeSnapshot: EmployeeType;
  policy?: ScoringPolicySnapshotV1;
  overallScore: number | null;
  tier: TierV1 | null;
  skillScore: number | null;
  skillCoverage: number | null;
  roundId?: string;
  roundNumber?: number;
  completedCount?: number;
  eligibleCount?: number;
  aggregateStatus?: "PROVISIONAL" | "FINAL";
};

export type HistoricalIdentitySources = {
  employeeName: "ROUND_CLOSE_SNAPSHOT" | "EVALUATION_SNAPSHOT" | "CURRENT_PROFILE_FALLBACK";
  storeName: "ROUND_CLOSE_SNAPSHOT" | "EVALUATION_SNAPSHOT" | "CURRENT_PROFILE_FALLBACK";
};

export type EvaluationRoundAggregate = {
  id: string;
  roundNumber?: number;
  employee: { id: string; displayName: string };
  store: { id: string; name: string };
  identitySources?: HistoricalIdentitySources | null;
  jobsSnapshot?: Array<Pick<StoreJob, "id" | "name" | "colorToken" | "displayOrder">> | null;
  employeeTypeSnapshot: EmployeeType;
  scoringVersion: string;
  policy: ScoringPolicySnapshotV1;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  openedAt?: string;
  closedAt: string | null;
  completedCount: number;
  eligibleCount: number;
  isComplete: boolean;
  aggregateStatus: "PROVISIONAL" | "FINAL";
  aggregateOverall: number | null;
  aggregateTier: TierV1 | null;
  aggregateSkillCoverage: number | null;
  skillCategories?: SkillCategoryBreakdownV1 | null;
  components: null | {
    skill: number; speed: number; initiative: number; attitude: number; availability: number; text: number;
    normalized: { skill: number; speed: number; initiative: number; attitude: number; availability: number; text: number };
  };
  itemAverages?: null | {
    basis: "SUBMITTED_STORE_EVALUATORS";
    submittedEvaluatorCount: number;
    components: Record<"skill" | "speed" | "initiative" | "attitude" | "availability" | "text", EvaluationRoundItemAverage>;
    categories: Record<"backOfHouse" | "waterBar" | "frontOfHouse" | "operations", EvaluationRoundItemAverage>;
  };
  distribution: null | { highest: number; lowest: number; spread: number };
  evaluators: EvaluationRoundEvaluator[];
  myEvaluation?: null | { id: string; status: "Submitted"; submittedAt: string; completedAt: string | null; overallScore?: number | null; tier?: TierV1 | null };
  adminEvaluation?: null | { id: string; status: "Submitted"; submittedAt: string; completedAt: string | null; overallScore?: number | null; tier?: TierV1 | null };
};

export type EvaluationRoundItemAverage = {
  average: number | null;
  maximum: number;
  unit: "points" | "percent";
};

export type EvaluationRoundEvaluator = {
  membershipId: string;
  evaluatorAccountId: string | null;
  evaluatorDisplayName: string;
  accountActive: boolean;
  status: "NotSubmitted" | "Submitted" | "NotStarted" | "Completed";
  evaluation?: {
    id: string;
    status: "Submitted" | "Completed";
    submittedAt?: string;
    completedAt: string | null;
    overallScore: number | null;
    tier: TierV1 | null;
    components: { skill: number | null; speed: number | null; initiative: number | null; attitude: number | null; availability: number | null; text: number | null };
    textFeedback: string | null;
    skillCategories?: SkillCategoryBreakdownV1;
    skills?: Array<{ skillCode: string; skillNameZh: string; skillNameEn: string; category: string; skillMode: SkillModeV1; status: SkillStatusV1; weight: number; contribution: number }>;
  };
};

export type EmployeeEvaluationSummary = {
  employee: Employee;
  officialScore: { score: number | null; tier: TierV1 | null; roundId: string; closedAt: string; employeeTypeSnapshot: EmployeeType; skillCoverage: number | null } | null;
  currentSkillProfileInitialized: boolean;
  currentSkillsUpdatedAt: string | null;
  currentSkills: CurrentEmployeeSkill[];
  currentSkillCategories?: SkillCategoryBreakdownV1;
  currentSkillOverallRatio?: number | null;
  latestEvaluation: EvaluationV1 | null;
  latestRound: EvaluationRoundAggregate | null;
  history: EvaluationHistorySummaryV1[];
};

export type StoreEvaluationStatus = "NotEvaluated" | "Submitted" | "Completed";

export type StoreEvaluationRosterItem = {
  employee: {
    id: string;
    displayName: string;
    employmentType: Employee["employmentType"];
    status: EmployeeStatus;
    employeeType: EmployeeType;
  };
  evaluationStatus: StoreEvaluationStatus;
  eligibleEvaluatorCount?: number;
  latestCompletedEvaluation: null | {
    id: string;
    overallScore: number | null;
    tier: TierV1 | null;
    skillCoverage: number | null;
    completedAt: string;
    employeeTypeSnapshot: EmployeeType;
    roundId?: string;
    aggregateStatus?: "PROVISIONAL" | "FINAL";
    completedCount?: number;
    eligibleCount?: number;
  };
  currentRound: null | {
    id: string;
    status: "OPEN";
    completedCount: number;
    eligibleCount: number;
    provisionalOverall?: number | null;
    myEvaluation: null | { id: string; status: "Submitted" | "Completed"; overallScore?: number | null; submittedAt?: string };
  };
};

export type StoreEvaluationRosterResponse = {
  store: Store;
  summary: {
    totalEmployees: number;
    evaluatedEmployees: number;
    submittedEmployees: number;
    averageScore: number | null;
  };
  items: StoreEvaluationRosterItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type EvaluationHistoryIndexV1 = {
  id: string;
  employeeId: string;
  employeeName: string;
  storeId: string;
  storeName: string;
  identitySources?: HistoricalIdentitySources | null;
  evaluatorId: string | null;
  evaluatorName: string | null;
  overallScore: number | null;
  tier: TierV1 | null;
  skillCoverage: number | null;
  completedAt: string;
  employeeTypeSnapshot: EmployeeType;
  roundId?: string;
  roundNumber?: number;
  completedCount?: number;
  eligibleCount?: number;
  aggregateStatus?: "PROVISIONAL" | "FINAL";
  closedAt?: string;
  jobsSnapshot?: Array<Pick<StoreJob, "id" | "name" | "colorToken" | "displayOrder">> | null;
  adminScore?: number | null;
  adminEvaluatorName?: string | null;
  scoringVersion?: string;
  policySnapshot?: ScoringPolicySnapshotV1;
};

export type EvaluationHistoryResponse = {
  items: EvaluationHistoryIndexV1[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type RosterSkillStatus = SkillStatusV1;
export type RosterSkillViewMode = "training" | "roster";

export type RosterSkillBoardSkillDefinition = {
  id: string;
  code: string;
  nameZh: string;
  nameEn: string;
  category: string;
  skillMode?: SkillModeV1;
  displayOrder: number;
  isActive: boolean;
};

type RosterSkillBoardLatestEvaluation = {
  id: string;
  overallScore: number | null;
  tier: TierV1 | null;
  speedRating: number | null;
  initiativeRating: number | null;
  attitudeRating: number | null;
  availabilityRating: number | null;
  skillCoverage: number | null;
  completedAt: string | null;
  employeeTypeSnapshot: EmployeeType;
};

type RosterSkillBoardEmployeeSkill = {
  skillDefinitionId: string;
  skillCode: string;
  category: string;
  skillMode?: SkillModeV1;
  status: RosterSkillStatus;
  updatedAt: string;
};

export type RosterSkillBoardEmployee = {
  employeeId: string;
  displayName: string;
  storeId: string;
  storeName: string;
  employmentType: "FullTime" | "PartTime" | "Casual";
  status: EmployeeStatus;
  employeeType: EmployeeType;
  latestEvaluation: RosterSkillBoardLatestEvaluation | null;
  skills: RosterSkillBoardEmployeeSkill[];
};

export type RosterSkillBoardResponse = {
  stores: Store[];
  selectedStoreId: string | null;
  skillDefinitions: RosterSkillBoardSkillDefinition[];
  employees: RosterSkillBoardEmployee[];
};
