export const SCORING_VERSION_V1 = "v1" as const;

export const skillStatusFactors = {
  NotTrained: 0,
  Training: 0.3,
  Independent: 0.7,
  Proficient: 1,
  CannotDo: 0,
  CanDo: 1,
} as const;

export type SkillStatusV1 = keyof typeof skillStatusFactors;
export type SkillInputStatusV1 = SkillStatusV1 | "Unknown";
export type SkillModeV1 = "PROGRESSIVE" | "BINARY";
export type TierV1 = "T1" | "T2" | "T3" | "T4" | "T5";
export type EmployeeTypeV1 = "TRAINING" | "REGULAR";

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

export type SkillDefinitionForScoring = {
  id: string;
  weight: number;
  isActive: boolean;
  category?: string;
  skillMode?: SkillModeV1;
};

export type EmployeeSkillForScoring = {
  skillDefinitionId: string;
  status: SkillStatusV1;
};

export type ManualRatingsV1 = {
  speed: number;
  initiative: number;
  attitude: number;
  availability: number;
};

export type ScoringInputV1 = {
  skillDefinitions: SkillDefinitionForScoring[];
  employeeSkills: EmployeeSkillForScoring[];
  ratings: ManualRatingsV1;
  textScore?: number | null;
  employeeType?: EmployeeTypeV1;
  policy?: ScoringPolicySnapshotV1;
};

export type ScoreBreakdownV1 = {
  scoringVersion: typeof SCORING_VERSION_V1;
  employeeType: EmployeeTypeV1;
  policy: ScoringPolicySnapshotV1;
  skillScore: number;
  speedScore: number;
  initiativeScore: number;
  attitudeScore: number;
  availabilityScore: number;
  textScore: number;
  overallScore: number;
  tier: TierV1;
  skillCoverage: {
    capableSkills: number;
    activeSkills: number;
    ratio: number;
    percentage: number;
  };
  skillCategories: SkillCategoryBreakdownV1;
  skill: {
    componentScore: number;
    maxScore: number;
    overallRatio: number;
    categories: SkillCategoryBreakdownV1;
  };
};

export type SkillCategoryMetricV1 = {
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

const REGULAR_POLICY_V1 = {
  policyId: "REGULAR_V3",
  tierPolicyVersion: 2,
  skillWeight: 60,
  speedWeight: 15,
  initiativeWeight: 5,
  attitudeWeight: 5,
  availabilityWeight: 10,
  textWeight: 5,
} as const satisfies ScoringPolicySnapshotV1;

const TRAINING_POLICY_V1 = {
  policyId: "TRAINING_V2",
  tierPolicyVersion: 2,
  skillWeight: 40,
  speedWeight: 10,
  initiativeWeight: 15,
  attitudeWeight: 15,
  availabilityWeight: 5,
  textWeight: 15,
} as const satisfies ScoringPolicySnapshotV1;

export const scoringPolicyV1 = {
  version: SCORING_VERSION_V1,
  ratingMinimum: 1,
  ratingMaximum: 5,
  defaultTextScoreRaw: 5,
  getPolicy(employeeType: EmployeeTypeV1): ScoringPolicySnapshotV1 {
    return employeeType === "TRAINING" ? { ...TRAINING_POLICY_V1 } : { ...REGULAR_POLICY_V1 };
  },
  skillStatusFactors,
} as const;

export function assertPolicyV1(policy: ScoringPolicySnapshotV1) {
  const weights = [policy.skillWeight, policy.speedWeight, policy.initiativeWeight, policy.attitudeWeight, policy.availabilityWeight, policy.textWeight];
  if (weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new RangeError("Scoring policy weights must be finite non-negative numbers.");
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - 100) > 0.0001) throw new RangeError("Scoring policy weights must total 100.");
  return policy;
}

export function parsePolicySnapshotV1(value: unknown): ScoringPolicySnapshotV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RangeError("Scoring policy snapshot is invalid.");
  }
  const record = value as Record<string, unknown>;
  const skillWeight = Number(record.skillWeight);
  const initiativeWeight = Number(record.initiativeWeight);
  return assertPolicyV1({
    policyId: record.policyId === "REGULAR_V3" || record.policyId === "TRAINING_V2" || record.policyId === "REGULAR_V2" || record.policyId === "TRAINING_V1" || record.policyId === "TRAINING_LEGACY" || record.policyId === "REGULAR_V1"
      ? record.policyId
      : skillWeight === 40 && Number(record.speedWeight) === 10 && initiativeWeight === 15 ? "TRAINING_V2"
        : skillWeight === 20 && initiativeWeight === 25 ? "TRAINING_V1"
        : skillWeight === 40 && Number(record.speedWeight) === 20 ? "TRAINING_LEGACY"
          : skillWeight === 60 && Number(record.speedWeight) === 15 ? "REGULAR_V3"
            : skillWeight === 60 ? "REGULAR_V2" : "REGULAR_V1",
    tierPolicyVersion: record.tierPolicyVersion === 2 ? 2 : 1,
    skillWeight,
    speedWeight: Number(record.speedWeight),
    initiativeWeight,
    attitudeWeight: Number(record.attitudeWeight),
    availabilityWeight: Number(record.availabilityWeight),
    textWeight: Number(record.textWeight),
  });
}

export function calculateScoreV1(input: ScoringInputV1): ScoreBreakdownV1 {
  validateRatings(input.ratings);
  const employeeType = input.employeeType ?? "REGULAR";
  const policy = assertPolicyV1(input.policy ? { ...input.policy } : scoringPolicyV1.getPolicy(employeeType));

  const activeDefinitions = input.skillDefinitions.filter((definition) => definition.isActive);
  if (activeDefinitions.length === 0) {
    throw new RangeError("At least one active skill definition is required.");
  }

  const activeDefinitionIds = new Set<string>();
  let activeSkillWeight = 0;
  for (const definition of activeDefinitions) {
    if (!definition.id.trim()) throw new RangeError("Skill definition id is required.");
    if (activeDefinitionIds.has(definition.id)) {
      throw new RangeError(`Duplicate active skill definition: ${definition.id}`);
    }
    if (!Number.isFinite(definition.weight) || definition.weight <= 0) {
      throw new RangeError(`Active skill weight must be greater than zero: ${definition.id}`);
    }
    activeDefinitionIds.add(definition.id);
    activeSkillWeight += definition.weight;
  }

  const skillsByDefinitionId = new Map<string, SkillStatusV1>();
  for (const skill of input.employeeSkills) {
    if (skillsByDefinitionId.has(skill.skillDefinitionId)) {
      throw new RangeError(`Duplicate employee skill: ${skill.skillDefinitionId}`);
    }
    if (!(skill.status in skillStatusFactors)) {
      throw new RangeError(`Unsupported skill status: ${String(skill.status)}`);
    }
    skillsByDefinitionId.set(skill.skillDefinitionId, skill.status);
  }

  let weightedSkillValue = 0;
  let capableSkills = 0;
  const categoryAccumulators = emptyCategoryAccumulators();
  for (const definition of activeDefinitions) {
    const status = skillsByDefinitionId.get(definition.id);
    if (!status) {
      throw new RangeError(`Missing employee skill status for active skill: ${definition.id}`);
    }
    const mode = definition.skillMode ?? "PROGRESSIVE";
    if (mode === "BINARY" && status !== "CanDo" && status !== "CannotDo") {
      throw new RangeError(`Binary skill requires CanDo or CannotDo: ${definition.id}`);
    }
    if (mode === "PROGRESSIVE" && (status === "CanDo" || status === "CannotDo")) {
      throw new RangeError(`Progressive skill requires a progressive status: ${definition.id}`);
    }
    const factor = skillStatusFactors[status];
    weightedSkillValue += factor * definition.weight;
    if (status === "Independent" || status === "Proficient" || status === "CanDo") capableSkills += 1;
    const bucket = categoryAccumulators[categoryKey(definition.category)];
    bucket.weightedRaw += factor * definition.weight;
    bucket.weightedMax += definition.weight;
    bucket.confirmedCount += 1;
    bucket.totalCount += 1;
    if (status === "Independent" || status === "Proficient" || status === "CanDo") bucket.capableCount += 1;
  }

  const textScoreRaw = input.textScore == null ? scoringPolicyV1.defaultTextScoreRaw : input.textScore;
  assertInRange("Text score", textScoreRaw, 0, 10);

  const skillScore = round1((weightedSkillValue / activeSkillWeight) * policy.skillWeight);
  const speedScore = ratingToScore(input.ratings.speed, policy.speedWeight);
  const initiativeScore = ratingToScore(input.ratings.initiative, policy.initiativeWeight);
  const attitudeScore = ratingToScore(input.ratings.attitude, policy.attitudeWeight);
  const availabilityScore = ratingToScore(input.ratings.availability, policy.availabilityWeight);
  const normalizedTextScore = round1((textScoreRaw / 10) * policy.textWeight);
  const overallScore = clamp(
    round1(skillScore + speedScore + initiativeScore + attitudeScore + availabilityScore + normalizedTextScore),
    0,
    100,
  );

  const skillCategories = finalizeCategories(categoryAccumulators);
  const skillRatio = round4(weightedSkillValue / activeSkillWeight);
  return {
    scoringVersion: SCORING_VERSION_V1,
    employeeType,
    policy,
    skillScore,
    speedScore,
    initiativeScore,
    attitudeScore,
    availabilityScore,
    textScore: normalizedTextScore,
    overallScore,
    tier: getTierV1(overallScore, policy.tierPolicyVersion ?? 1),
    skillCoverage: {
      capableSkills,
      activeSkills: activeDefinitions.length,
      ratio: round4(capableSkills / activeDefinitions.length),
      percentage: round1((capableSkills / activeDefinitions.length) * 100),
    },
    skillCategories,
    skill: { componentScore: skillScore, maxScore: policy.skillWeight, overallRatio: skillRatio, categories: skillCategories },
  };
}

type CategoryKey = keyof SkillCategoryBreakdownV1;
type CategoryAccumulator = Omit<SkillCategoryMetricV1, "ratio" | "percentage">;

function emptyCategoryAccumulators(): Record<CategoryKey, CategoryAccumulator> {
  const empty = (): CategoryAccumulator => ({ weightedRaw: 0, weightedMax: 0, confirmedCount: 0, totalCount: 0, capableCount: 0 });
  return { backOfHouse: empty(), waterBar: empty(), frontOfHouse: empty(), operations: empty() };
}

function categoryKey(category?: string): CategoryKey {
  const normalized = category?.replace(/[\s_-]/g, "").toLowerCase();
  if (normalized === "backkitchen" || normalized === "backofhouse") return "backOfHouse";
  if (normalized === "bar" || normalized === "waterbar") return "waterBar";
  if (normalized === "operations" || normalized === "operation") return "operations";
  return "frontOfHouse";
}

function finalizeCategories(accumulators: Record<CategoryKey, CategoryAccumulator>): SkillCategoryBreakdownV1 {
  return Object.fromEntries(Object.entries(accumulators).map(([key, value]) => {
    const ratio = value.weightedMax > 0 ? round4(value.weightedRaw / value.weightedMax) : null;
    return [key, { ...value, weightedRaw: round4(value.weightedRaw), weightedMax: round4(value.weightedMax), ratio, percentage: ratio == null ? null : round1(ratio * 100) }];
  })) as SkillCategoryBreakdownV1;
}

export function getTierV1(overallScore: number, tierPolicyVersion: 1 | 2 = 2): TierV1 {
  assertInRange("Overall score", overallScore, 0, 100);
  if (overallScore >= 85) return "T1";
  if (overallScore >= 70) return "T2";
  if (tierPolicyVersion === 1) return overallScore >= 55 ? "T3" : "T4";
  if (overallScore >= 60) return "T3";
  if (overallScore >= 40) return "T4";
  return "T5";
}

export function calculateSkillCategoryBreakdownV1(
  definitions: SkillDefinitionForScoring[],
  skills: Array<{ skillDefinitionId: string; status: SkillInputStatusV1 }>,
): SkillCategoryBreakdownV1 {
  const statuses = new Map(skills.map((skill) => [skill.skillDefinitionId, skill.status]));
  const accumulators = emptyCategoryAccumulators();
  for (const definition of definitions.filter((item) => item.isActive)) {
    const bucket = accumulators[categoryKey(definition.category)];
    bucket.totalCount += 1;
    const status = statuses.get(definition.id);
    if (!status || status === "Unknown") continue;
    const mode = definition.skillMode ?? "PROGRESSIVE";
    const compatible = mode === "BINARY"
      ? status === "CanDo" || status === "CannotDo"
      : status !== "CanDo" && status !== "CannotDo";
    if (!compatible) continue;
    const factor = skillStatusFactors[status];
    bucket.weightedRaw += factor * definition.weight;
    bucket.weightedMax += definition.weight;
    bucket.confirmedCount += 1;
    if (status === "Independent" || status === "Proficient" || status === "CanDo") bucket.capableCount += 1;
  }
  return finalizeCategories(accumulators);
}

function validateRatings(ratings: ManualRatingsV1) {
  for (const [name, rating] of Object.entries(ratings)) {
    if (!Number.isInteger(rating)) throw new RangeError(`${name} rating must be an integer.`);
    assertInRange(`${name} rating`, rating, scoringPolicyV1.ratingMinimum, scoringPolicyV1.ratingMaximum);
  }
}

function ratingToScore(rating: number, maximum: number) {
  return round1((rating / scoringPolicyV1.ratingMaximum) * maximum);
}

function assertInRange(name: string, value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}.`);
  }
}

function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function round4(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
