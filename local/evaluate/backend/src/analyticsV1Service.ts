import type { EmployeeType, PrismaClient, SkillStatus, TierV1 } from "@prisma/client";
import { createAuthError, type AuthContext } from "./auth.js";
import { loadLatestValidClosedAggregates, loadRoundAggregates } from "./roundAggregateRead.js";

type StoreScope = string[] | undefined;
type RatingKey = "speed" | "initiative" | "attitude" | "availability";

const ratingFields = {
  speed: "speedRating",
  initiative: "initiativeRating",
  attitude: "attitudeRating",
  availability: "availabilityRating",
} as const;

export class AnalyticsV1Service {
  constructor(private readonly db: PrismaClient) {}

  async getDashboard(storeIds?: StoreScope, selectedStoreId?: string, actor?: AuthContext) {
    const population = await this.loadPopulation(storeIds, selectedStoreId, undefined, actor, false);
    const current = buildCurrentPopulation(population.employees, population.evaluations, population.activeSkills);
    return {
      stores: population.stores,
      summary: buildSummary(population.employees, current),
      tierDistribution: buildTierDistribution(current.evaluated),
      skillGaps: buildSkillCoverage(population.employees, population.activeSkills).skills.slice(0, 3),
      topEmployees: buildTopEmployees(current.evaluated, 5),
      needsAttention: buildAttention(current.evaluated, current.employeeSkillCoverage, 6),
      notEvaluatedEmployees: current.notEvaluated.map((employee) => ({
        employeeId: employee.id,
        employeeName: employee.displayName,
        employeeType: employee.employeeType,
        storeId: employee.storeId,
        storeName: employee.store.name,
      })),
    };
  }

  async getAnalytics(storeIds?: StoreScope, selectedStoreId?: string, employeeType?: EmployeeType, actor?: AuthContext) {
    const population = await this.loadPopulation(storeIds, selectedStoreId, employeeType, actor, true);
    const current = buildCurrentPopulation(population.employees, population.evaluations, population.activeSkills);
    const skills = buildSkillCoverage(population.employees, population.activeSkills);
    const ratings = buildAverageRatings(current.evaluated);
    const movement = buildMovement(population.evaluations, population.employees);
    return {
      stores: population.stores,
      summary: buildSummary(population.employees, current),
      selectedEmployeeType: employeeType ?? null,
      tierDistribution: buildTierDistribution(current.evaluated),
      averageRatings: ratings.values,
      weakestDimension: ratings.weakest,
      skillProfiles: {
        initializedEmployees: current.initializedProfileCount,
        totalEmployees: population.employees.length,
      },
      skillCoverage: skills.skills,
      categoryCoverage: skills.categories,
      scoreTrend: buildMonthlyTrend(population.evaluations),
      mostImproved: movement.filter((item) => item.delta > 0).sort(sortDeltaDesc).slice(0, 5),
      scoreDecreased: movement.filter((item) => item.delta < 0).sort(sortDeltaAsc).slice(0, 5),
      employees: current.evaluated
        .map(({ employee, evaluation }) => ({
          employeeId: employee.id,
          employeeName: employee.displayName,
          employeeType: employee.employeeType,
          evaluationEmployeeType: evaluation.employeeTypeSnapshot,
          storeId: employee.storeId,
          storeName: employee.store.name,
          overallScore: Number(evaluation.overallScoreV1),
          tier: evaluation.tierV1!,
          skillCoverage: current.employeeSkillCoverage.get(employee.id)?.ratio ?? null,
          completedAt: evaluation.completedAt!.toISOString(),
        }))
        .sort((left, right) => right.overallScore - left.overallScore || left.employeeName.localeCompare(right.employeeName)),
    };
  }

  private async loadPopulation(storeIds?: StoreScope, selectedStoreId?: string, employeeType?: EmployeeType, _actor?: AuthContext, includeHistory = false) {
    if (selectedStoreId && storeIds && !storeIds.includes(selectedStoreId)) throw createAuthError(403, "Store access denied.");
    const effectiveStoreIds = selectedStoreId ? [selectedStoreId] : storeIds;
    const storeWhere = { isActive: true, ...(storeIds ? { id: { in: storeIds } } : {}) };
    const employeeWhere = {
      status: "Active" as const,
      store: { isActive: true },
      ...(effectiveStoreIds ? { storeId: { in: effectiveStoreIds } } : {}),
      ...(employeeType ? { employeeType } : {}),
    };
    const [stores, activeSkills, employees] = await Promise.all([
      this.db.store.findMany({ where: storeWhere, orderBy: [{ name: "asc" }, { id: "asc" }] }),
      this.db.skillDefinition.findMany({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { displayOrder: "asc" }, { id: "asc" }],
      }),
      this.db.employee.findMany({
        where: employeeWhere,
        include: {
          store: true,
          skills: {
            where: { skillDefinition: { isActive: true } },
            select: { skillDefinitionId: true, status: true },
          },
        },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
      }),
    ]);

    const employeeIds = employees.map((employee) => employee.id);
    const aggregateRounds = includeHistory
      ? await loadRoundAggregates(this.db, { employeeIds, includeOpen: false })
      : await loadLatestValidClosedAggregates(this.db, employeeIds);
    // A CLOSED round without a formal aggregate is not a zero score or a trend point.
    const evaluations = aggregateRounds.filter((round) => round.aggregateOverall != null).map((round) => ({
      id: round.id,
      employeeId: round.employee.id,
      storeId: round.store.id,
      overallScoreV1: round.aggregateOverall!,
      tierV1: round.aggregateTier!,
      skillScoreV1: round.components?.skill ?? null,
      employeeTypeSnapshot: round.employeeTypeSnapshot,
      speedRating: componentToRating(round.components?.speed, round.policy.speedWeight),
      initiativeRating: componentToRating(round.components?.initiative, round.policy.initiativeWeight),
      attitudeRating: componentToRating(round.components?.attitude, round.policy.attitudeWeight),
      availabilityRating: componentToRating(round.components?.availability, round.policy.availabilityWeight),
      completedAt: new Date(round.closedAt ?? round.createdAt),
      createdAt: new Date(round.createdAt),
    }));
    return {
      stores: stores.map((store) => ({ id: store.id, name: store.name })),
      activeSkills,
      employees,
      evaluations,
    };
  }
}

type Population = Awaited<ReturnType<AnalyticsV1Service["loadPopulation"]>>;
type EmployeeRow = Population["employees"][number];
type EvaluationRow = Population["evaluations"][number];
type SkillDefinitionRow = Population["activeSkills"][number];
type CurrentEvaluation = { employee: EmployeeRow; evaluation: EvaluationRow };

function buildCurrentPopulation(
  employees: EmployeeRow[],
  evaluations: EvaluationRow[],
  activeSkills: SkillDefinitionRow[],
) {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const latestByEmployee = new Map<string, EvaluationRow>();
  evaluations.forEach((evaluation) => {
    if (!latestByEmployee.has(evaluation.employeeId)) latestByEmployee.set(evaluation.employeeId, evaluation);
  });
  const evaluated = [...latestByEmployee.entries()].flatMap(([employeeId, evaluation]) => {
    const employee = employeeById.get(employeeId);
    return employee ? [{ employee, evaluation }] : [];
  });
  const notEvaluated = employees.filter((employee) => !latestByEmployee.has(employee.id));
  const activeSkillIds = new Set(activeSkills.map((skill) => skill.id));
  const employeeSkillCoverage = new Map<string, { qualified: number; known: number; ratio: number; initialized: boolean }>();
  employees.forEach((employee) => {
    const knownSkills = employee.skills.filter((skill) => activeSkillIds.has(skill.skillDefinitionId));
    const qualified = knownSkills.filter((skill) => isQualified(skill.status)).length;
    employeeSkillCoverage.set(employee.id, {
      qualified,
      known: knownSkills.length,
      ratio: knownSkills.length ? round4(qualified / knownSkills.length) : 0,
      initialized: activeSkills.length > 0 && knownSkills.length === activeSkills.length,
    });
  });

  return {
    evaluated,
    notEvaluated,
    employeeSkillCoverage,
    initializedProfileCount: [...employeeSkillCoverage.values()].filter((profile) => profile.initialized).length,
  };
}

function buildSummary(employees: EmployeeRow[], current: ReturnType<typeof buildCurrentPopulation>) {
  const employeeCount = employees.length;
  const scores = current.evaluated.map(({ evaluation }) => Number(evaluation.overallScoreV1));
  const skillScores = current.evaluated.flatMap(({ evaluation }) => evaluation.skillScoreV1 == null ? [] : [Number(evaluation.skillScoreV1)]);
  const initializedCoverage = [...current.employeeSkillCoverage.values()].filter((profile) => profile.initialized);
  return {
    employees: employeeCount,
    regularEmployees: employees.filter((employee) => employee.employeeType === "REGULAR").length,
    trainingEmployees: employees.filter((employee) => employee.employeeType === "TRAINING").length,
    evaluatedEmployees: current.evaluated.length,
    notEvaluatedEmployees: current.notEvaluated.length,
    evaluationCoverage: employeeCount ? round4(current.evaluated.length / employeeCount) : 0,
    averageScore: scores.length ? round1(average(scores)) : null,
    averageSkillScore: skillScores.length ? round1(average(skillScores)) : null,
    averageCurrentSkillCoverage: initializedCoverage.length
      ? round4(average(initializedCoverage.map((profile) => profile.ratio)))
      : null,
    initializedSkillProfiles: initializedCoverage.length,
  };
}

function buildTierDistribution(current: CurrentEvaluation[]) {
  const total = current.length;
  return (["T1", "T2", "T3", "T4", "T5"] as TierV1[]).map((tier) => {
    const count = current.filter(({ evaluation }) => evaluation.tierV1 === tier).length;
    return { tier, count, percentage: total ? round1((count / total) * 100) : 0 };
  });
}

function buildSkillCoverage(employees: EmployeeRow[], activeSkills: SkillDefinitionRow[]) {
  const skills = activeSkills.map((definition) => {
    const known = employees.flatMap((employee) => {
      const skill = employee.skills.find((item) => item.skillDefinitionId === definition.id);
      return skill && skill.status !== "Unknown" ? [skill] : [];
    });
    const qualifiedEmployees = known.filter((skill) => isQualified(skill.status)).length;
    return {
      skillDefinitionId: definition.id,
      skillCode: definition.code,
      skillNameZh: definition.nameZh,
      skillNameEn: definition.nameEn,
      category: definition.category,
      qualifiedEmployees,
      knownEmployees: known.length,
      totalEmployees: employees.length,
      coverage: known.length ? round4(average(known.map((skill) => skillFactor(skill.status)))) : null,
      profileCompletion: employees.length ? round4(known.length / employees.length) : 0,
    };
  }).sort((left, right) => compareNullable(left.coverage, right.coverage) || left.skillNameEn.localeCompare(right.skillNameEn));

  const categoryMap = new Map<string, Array<{ coverage: number; weight: number }>>();
  skills.forEach((skill) => {
    if (skill.coverage == null) return;
    const values = categoryMap.get(skill.category) ?? [];
    const definition = activeSkills.find((item) => item.id === skill.skillDefinitionId);
    values.push({ coverage: skill.coverage, weight: definition ? Number(definition.weight) : 1 });
    categoryMap.set(skill.category, values);
  });
  const categories = [...new Set(activeSkills.map((skill) => skill.category))].map((category) => {
    const values = categoryMap.get(category) ?? [];
    const totalWeight = values.reduce((sum, value) => sum + value.weight, 0);
    return { category, coverage: values.length && totalWeight > 0 ? round4(values.reduce((sum, value) => sum + value.coverage * value.weight, 0) / totalWeight) : null, activeSkills: activeSkills.filter((skill) => skill.category === category).length };
  });
  return { skills, categories };
}

function buildTopEmployees(current: CurrentEvaluation[], limit: number) {
  return current.map(toEmployeeScore)
    .sort((left, right) => right.overallScore - left.overallScore || right.completedAt.localeCompare(left.completedAt) || left.employeeName.localeCompare(right.employeeName))
    .slice(0, limit);
}

function buildAttention(
  current: CurrentEvaluation[],
  skillCoverage: Map<string, { ratio: number; initialized: boolean }>,
  limit: number,
) {
  return current.flatMap((entry) => {
    const profile = skillCoverage.get(entry.employee.id);
    const reasons: Array<"LowOverallScore" | "LowSkillCoverage"> = [];
    if (Number(entry.evaluation.overallScoreV1) < 55) reasons.push("LowOverallScore");
    if (profile?.initialized && profile.ratio < 0.5) reasons.push("LowSkillCoverage");
    return reasons.length ? [{ ...toEmployeeScore(entry), skillCoverage: profile?.ratio ?? null, reasons }] : [];
  }).sort((left, right) => left.overallScore - right.overallScore || left.employeeName.localeCompare(right.employeeName)).slice(0, limit);
}

function buildAverageRatings(current: CurrentEvaluation[]) {
  const values = (Object.keys(ratingFields) as RatingKey[]).map((dimension) => {
    const field = ratingFields[dimension];
    const ratings = current.flatMap(({ evaluation }) => evaluation[field] == null ? [] : [evaluation[field]!]);
    return { dimension, average: ratings.length ? round1(average(ratings)) : null, sampleSize: ratings.length };
  });
  const weakest = values.filter((value) => value.average != null).sort((left, right) => left.average! - right.average!)[0] ?? null;
  return { values, weakest };
}

function buildMonthlyTrend(evaluations: EvaluationRow[]) {
  const byMonth = new Map<string, number[]>();
  evaluations.forEach((evaluation) => {
    const month = evaluation.completedAt!.toISOString().slice(0, 7);
    const values = byMonth.get(month) ?? [];
    values.push(Number(evaluation.overallScoreV1));
    byMonth.set(month, values);
  });
  return [...byMonth.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([month, scores]) => ({
    month,
    averageCompletedEvaluationScore: round1(average(scores)),
    completedEvaluations: scores.length,
  }));
}

function buildMovement(evaluations: EvaluationRow[], employees: EmployeeRow[]) {
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const byEmployee = new Map<string, EvaluationRow[]>();
  evaluations.forEach((evaluation) => {
    const values = byEmployee.get(evaluation.employeeId) ?? [];
    values.push(evaluation);
    byEmployee.set(evaluation.employeeId, values);
  });
  return [...byEmployee.values()].flatMap((rows) => {
    if (rows.length < 2) return [];
    const latest = rows[0];
    const previous = rows[1];
    const employee = employeeById.get(latest.employeeId);
    if (!employee) return [];
    return [{
      employeeId: latest.employeeId,
      employeeName: employee.displayName,
      employeeType: employee.employeeType,
      storeId: employee.storeId,
      storeName: employee.store.name,
      latestScore: Number(latest.overallScoreV1),
      previousScore: Number(previous.overallScoreV1),
      delta: round1(Number(latest.overallScoreV1) - Number(previous.overallScoreV1)),
      latestCompletedAt: latest.completedAt!.toISOString(),
      latestEvaluationEmployeeType: latest.employeeTypeSnapshot,
    }];
  });
}

function toEmployeeScore({ employee, evaluation }: CurrentEvaluation) {
  return {
    employeeId: employee.id,
    employeeName: employee.displayName,
    employeeType: employee.employeeType,
    evaluationEmployeeType: evaluation.employeeTypeSnapshot,
    storeId: employee.storeId,
    storeName: employee.store.name,
    overallScore: Number(evaluation.overallScoreV1),
    tier: evaluation.tierV1!,
    completedAt: evaluation.completedAt!.toISOString(),
  };
}

function isQualified(status: SkillStatus) {
  return status === "Independent" || status === "Proficient" || status === "CanDo";
}

function skillFactor(status: SkillStatus) {
  if (status === "Training") return 0.3;
  if (status === "Independent") return 0.7;
  if (status === "Proficient" || status === "CanDo") return 1;
  return 0;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round1(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function round4(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function compareNullable(left: number | null, right: number | null) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return left - right;
}

function sortDeltaDesc(left: { delta: number }, right: { delta: number }) {
  return right.delta - left.delta;
}

function sortDeltaAsc(left: { delta: number }, right: { delta: number }) {
  return left.delta - right.delta;
}

function componentToRating(value: number | undefined, maximum: number) {
  return value == null || maximum <= 0 ? null : Math.round((value / maximum) * 50) / 10;
}
