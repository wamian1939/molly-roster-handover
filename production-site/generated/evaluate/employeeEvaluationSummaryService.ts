import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import { toFrontendEmployee, type EmployeeWithStore } from "./domain.js";
import { EvaluationV1Service } from "./evaluationV1Service.js";
import { createHttpError } from "./httpError.js";
import type { AuthContext } from "./auth.js";
import { loadLatestValidClosedAggregates, loadRoundAggregates } from "./roundAggregateRead.js";
import { calculateSkillCategoryBreakdownV1 } from "./scoringPolicyV1.js";

type StoreScope = string[] | undefined;

const employeeSummaryInclude = {
  store: true,
  jobAssignments: { include: { job: true }, orderBy: { job: { displayOrder: "asc" } } },
  _count: { select: { evaluations: true } },
  skills: {
    include: { skillDefinition: true },
    orderBy: { skillDefinition: { displayOrder: "asc" } },
  },
} satisfies Prisma.EmployeeInclude;

export class EmployeeEvaluationSummaryService {
  private readonly evaluationV1Service: EvaluationV1Service;

  constructor(private readonly db: PrismaClient, evaluationV1Service?: EvaluationV1Service) {
    this.evaluationV1Service = evaluationV1Service ?? new EvaluationV1Service(db);
  }

  async getSummary(employeeId: string, storeIds?: StoreScope, actor?: AuthContext) {
    const employee = await this.db.employee.findUnique({
      where: { id: employeeId },
      include: employeeSummaryInclude,
    });
    if (!employee) throw createHttpError(404, "员工不存在。");

    const [completed, roundHistory, officialRounds] = await Promise.all([this.db.evaluation.findMany({
      where: {
        employeeId,
        evaluationStatus: "Completed",
        scoringVersion: "v1",
        completedAt: { not: null },
        ...(storeIds ? { storeId: { in: storeIds } } : {}),
        ...(actor?.role === "STORE_EVALUATOR" ? { evaluatorAccountId: actor.accountId } : {}),
      },
      select: { id: true },
      orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }), loadRoundAggregates(this.db, { employeeIds: [employeeId], storeIds, includeOpen: false }),
    storeIds ? loadLatestValidClosedAggregates(this.db, [employeeId]) : Promise.resolve(null)]);
    const latestEvaluation = completed[0];
    const latestRound = roundHistory[0] ?? null;
    const officialRound = (officialRounds ?? roundHistory).find((round) => round.aggregateOverall != null) ?? null;
    const currentSkillsUpdatedAt = employee.skills.reduce<Date | null>(
      (latest, skill) => !latest || skill.updatedAt > latest ? skill.updatedAt : latest,
      null,
    );
    const currentSkillCategories = calculateSkillCategoryBreakdownV1(
      employee.skills.map((skill) => ({ id: skill.skillDefinitionId, weight: Number(skill.skillDefinition.weight), isActive: skill.skillDefinition.isActive, category: skill.skillDefinition.category, skillMode: skill.skillDefinition.skillMode })),
      employee.skills.map((skill) => ({ skillDefinitionId: skill.skillDefinitionId, status: skill.status })),
    );
    const categoryMetrics = Object.values(currentSkillCategories);
    const currentSkillWeightedMax = categoryMetrics.reduce((sum, category) => sum + category.weightedMax, 0);
    const currentSkillOverallRatio = currentSkillWeightedMax > 0
      ? Math.round((categoryMetrics.reduce((sum, category) => sum + category.weightedRaw, 0) / currentSkillWeightedMax) * 10000) / 10000
      : null;

    return {
      employee: toFrontendEmployee(employee as EmployeeWithStore),
      currentSkillProfileInitialized: employee.skills.length > 0,
      currentSkillsUpdatedAt: currentSkillsUpdatedAt?.toISOString() ?? null,
      currentSkillCategories,
      currentSkillOverallRatio,
      currentSkills: employee.skills.map((skill) => ({
        skillDefinitionId: skill.skillDefinitionId,
        skillCode: skill.skillDefinition.code,
        skillNameZh: skill.skillDefinition.nameZh,
        skillNameEn: skill.skillDefinition.nameEn,
        category: skill.skillDefinition.category,
        skillMode: skill.skillDefinition.skillMode,
        status: skill.status,
        weight: Number(skill.skillDefinition.weight),
        updatedAt: skill.updatedAt.toISOString(),
      })),
      latestEvaluation: latestEvaluation ? await this.evaluationV1Service.getEvaluation(latestEvaluation.id) : null,
      latestRound,
      officialScore: officialRound ? {
        score: officialRound.aggregateOverall,
        tier: officialRound.aggregateTier,
        roundId: officialRound.id,
        closedAt: officialRound.closedAt ?? officialRound.createdAt,
        employeeTypeSnapshot: officialRound.employeeTypeSnapshot,
        skillCoverage: officialRound.aggregateSkillCoverage,
      } : null,
      history: roundHistory.filter((round) => round.completedCount > 0).map((round) => ({
        id: round.id,
        roundId: round.id,
        roundNumber: round.roundNumber,
        scoringVersion: round.scoringVersion,
        employeeId: round.employee.id,
        employeeName: round.employee.displayName,
        storeId: round.store.id,
        storeName: round.store.name,
        completedAt: round.closedAt ?? round.createdAt,
        overallScore: round.aggregateOverall,
        tier: round.aggregateTier,
        skillScore: round.components?.skill ?? null,
        skillCoverage: round.aggregateSkillCoverage,
        employeeTypeSnapshot: round.employeeTypeSnapshot,
        policy: round.policy,
        completedCount: round.completedCount,
        eligibleCount: round.eligibleCount,
        aggregateStatus: round.aggregateStatus,
      })),
    };
  }
}
