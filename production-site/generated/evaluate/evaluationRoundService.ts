import { Prisma, type PrismaClient } from "@prisma/client";
import { requireStoreAccess, type AuthContext } from "./auth.js";
import { createHttpError } from "./httpError.js";
import { resolveHistoricalIdentity } from "./historicalIdentity.js";
import { calculateSkillCategoryBreakdownV1, getTierV1, parsePolicySnapshotV1, scoringPolicyV1, type SkillCategoryMetricV1 } from "./scoringPolicyV1.js";

export const roundAggregateInclude = {
  employee: { select: { id: true, displayName: true } },
  store: { select: { id: true, name: true } },
  evaluators: { include: { evaluatorAccount: { select: { isActive: true, role: true } } }, orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] },
  evaluations: {
    include: { evaluatorAccount: { select: { id: true, displayName: true, isActive: true, role: true, deletedAt: true } }, skillSnapshots: { orderBy: { createdAt: "asc" as const } } },
    orderBy: [{ submittedAt: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.EvaluationRoundInclude;

export type LiveEligibleEvaluator = { id: string; displayName: string; isActive?: boolean; role?: "STORE_EVALUATOR" };
type RoundWithAggregate = Prisma.EvaluationRoundGetPayload<{ include: typeof roundAggregateInclude }>;

export class EvaluationRoundService {
  constructor(private readonly db: PrismaClient) {}

  async getOrCreateOpenRound(employeeId: string, actor: AuthContext) {
    const employee = await this.db.employee.findFirst({ where: { id: employeeId, status: "Active", store: { isActive: true } }, select: { id: true, storeId: true } });
    if (!employee) throw createHttpError(409, "Employee is inactive, archived, or belongs to an archived store.");
    requireStoreAccess(actor, employee.storeId);
    await this.assertScoringActor(actor, employee.storeId);
    const existing = await this.db.evaluationRound.findFirst({ where: { employeeId, status: "OPEN" }, select: { id: true } });
    if (existing) return this.getRound(existing.id, actor);
    try {
      const roundId = await this.db.$transaction(async (tx) => {
        if (typeof tx.$executeRaw === "function") await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evaluation-open-round:${employeeId}`}))`;
        const activeStore = await tx.$queryRaw<Array<{ isActive: boolean }>>`
          SELECT "isActive" FROM "stores" WHERE "id" = ${employee.storeId} FOR SHARE
        `;
        if (!activeStore[0]?.isActive) throw createHttpError(409, "Employee is inactive, archived, or belongs to an archived store.");
        const concurrent = await tx.evaluationRound.findFirst({ where: { employeeId, status: "OPEN" }, select: { id: true } });
        if (concurrent) return concurrent.id;
        const current = await tx.employee.findFirst({ where: { id: employeeId, status: "Active", store: { isActive: true } }, select: { id: true, storeId: true, employeeType: true, displayName: true, store: { select: { name: true } } } });
        if (!current) throw createHttpError(409, "Employee is inactive, archived, or belongs to an archived store.");
        requireStoreAccess(actor, current.storeId);
        const [definitions, currentSkills, previous] = await Promise.all([
          tx.skillDefinition.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" } }),
          tx.employeeSkill.findMany({ where: { employeeId } }),
          tx.evaluationRound.aggregate({ where: { employeeId }, _max: { roundNumber: true } }),
        ]);
        if (!definitions.length) throw createHttpError(409, "No active skill definitions are configured.");
        const statusById = new Map(currentSkills.map((skill) => [skill.skillDefinitionId, skill.status]));
        const created = await tx.evaluationRound.create({ data: {
          employeeId, storeId: current.storeId, roundNumber: (previous._max.roundNumber ?? 0) + 1,
          employeeTypeSnapshot: current.employeeType, employeeDisplayNameSnapshot: current.displayName,
          storeNameSnapshot: current.store.name, scoringVersion: scoringPolicyV1.version,
          scoringPolicySnapshot: toJson(scoringPolicyV1.getPolicy(current.employeeType)),
          skillBaselineSnapshot: toJson(definitions.map((definition) => ({
            skillDefinitionId: definition.id, skillCode: definition.code, skillNameZh: definition.nameZh, skillNameEn: definition.nameEn,
            category: definition.category, skillMode: definition.skillMode, weight: Number(definition.weight), displayOrder: definition.displayOrder,
            status: statusById.get(definition.id) ?? null,
          }))), createdByAccountId: actor.accountId,
        }, select: { id: true } });
        return created.id;
      });
      return this.getRound(roundId, actor);
    } catch (error) {
      if (isUniqueConflict(error) || isSerializationConflict(error)) {
        const concurrent = await this.db.evaluationRound.findFirst({ where: { employeeId, status: "OPEN" }, select: { id: true } });
        if (concurrent) return this.getRound(concurrent.id, actor);
      }
      if (isSerializationConflict(error)) throw createHttpError(409, "Employee or store changed while opening the round. Refresh and retry.");
      throw error;
    }
  }

  async getCurrentRound(employeeId: string, actor: AuthContext) {
    const round = await this.db.evaluationRound.findFirst({ where: { employeeId, status: "OPEN" }, include: roundAggregateInclude, orderBy: [{ openedAt: "desc" }, { id: "desc" }] });
    if (!round) return null;
    this.assertVisibleRound(round, actor);
    return this.toRoundDto(round, actor);
  }

  async getRound(roundId: string, actor: AuthContext) { return this.toRoundDto(await this.getRoundForActor(roundId, actor), actor, true); }

  async ensureEvaluatorMembership(roundId: string, actor: AuthContext, _allowAuthorizedJoin = false) {
    const round = await this.db.evaluationRound.findUnique({ where: { id: roundId }, select: { id: true, employeeId: true, storeId: true, status: true } });
    if (!round) throw createHttpError(404, "Evaluation round does not exist.");
    requireStoreAccess(actor, round.storeId);
    if (round.status !== "OPEN") throw createHttpError(409, "This round is closed.");
    await this.assertScoringActor(actor, round.storeId);
    return { id: round.id, employeeId: round.employeeId, storeId: round.storeId };
  }

  async getAggregate(roundId: string, actor: AuthContext) {
    if (actor.role !== "ADMIN") throw createHttpError(403, "Only administrators can view round aggregates.");
    return this.toRoundDto(await this.getRoundForActor(roundId, actor), actor, true);
  }

  async listEvaluations(roundId: string, actor: AuthContext) {
    if (actor.role !== "ADMIN") throw createHttpError(403, "Only administrators can view evaluator details.");
    return (await this.getAggregate(roundId, actor)).evaluators;
  }

  async closeRound(roundId: string, actor: AuthContext) {
    if (actor.role !== "ADMIN") throw createHttpError(403, "Only administrators can close a round.");
    try {
      await this.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`evaluation-round:${roundId}`}))`;
        const round = await tx.evaluationRound.findUnique({ where: { id: roundId }, include: roundAggregateInclude });
        if (!round) throw createHttpError(404, "Evaluation round does not exist.");
        requireStoreAccess(actor, round.storeId);
        if (round.status !== "OPEN") throw createHttpError(409, "This round is already closed.");
        const activeStore = await tx.$queryRaw<Array<{ isActive: boolean }>>`
          SELECT "isActive" FROM "stores" WHERE "id" = ${round.storeId} FOR SHARE
        `;
        if (!activeStore[0]?.isActive) throw createHttpError(409, "Archived stores cannot close an OPEN evaluation round.");
        const eligible = await tx.userAccount.findMany({
          where: { role: "STORE_EVALUATOR", isActive: true, deletedAt: null, storeAccesses: { some: { storeId: round.storeId } } },
          select: { id: true, displayName: true },
          orderBy: [{ displayName: "asc" }, { id: "asc" }],
        });
        const aggregate = computeRoundAggregate(round, true, eligible);
        const employeeJobs = await tx.employeeJobAssignment.findMany({
          where: { employeeId: round.employeeId },
          select: { job: { select: { id: true, name: true, colorToken: true, displayOrder: true } } },
          orderBy: { job: { displayOrder: "asc" } },
        });
        const closedAt = new Date();
        await tx.evaluationRoundEvaluator.deleteMany({ where: { roundId } });
        if (eligible.length) await tx.evaluationRoundEvaluator.createMany({ data: eligible.map((account) => ({ roundId, evaluatorAccountId: account.id, evaluatorDisplayNameSnapshot: account.displayName })) });
        await tx.evaluation.updateMany({
          where: { roundId, evaluationStatus: "Submitted" },
          data: { evaluationStatus: "Completed", completedAt: closedAt },
        });
        const updated = await tx.evaluationRound.updateMany({ where: { id: roundId, status: "OPEN" }, data: {
          status: "CLOSED", closedAt, closedEligibleCount: aggregate.eligibleCount, closedSubmittedCount: aggregate.completedCount,
          employeeDisplayNameSnapshot: round.employeeDisplayNameSnapshot ?? round.employee.displayName,
          storeNameSnapshot: round.storeNameSnapshot ?? round.store.name,
          finalAggregateOverall: aggregate.aggregateOverall == null ? null : decimal(aggregate.aggregateOverall), finalAggregateTier: aggregate.aggregateTier,
          finalAggregateComponents: aggregate.components == null ? Prisma.JsonNull : toJson(aggregate.components),
          finalAggregateSkillCoverage: aggregate.aggregateSkillCoverage == null ? null : decimal(aggregate.aggregateSkillCoverage),
          employeeJobsSnapshot: toJson(employeeJobs.map(({ job }) => job)),
        } });
        if (updated.count !== 1) throw createHttpError(409, "Round state changed while it was being closed.");
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (isSerializationConflict(error)) throw createHttpError(409, "Store or round changed while closing. Refresh and retry.");
      throw error;
    }
    return this.getAggregate(roundId, actor);
  }

  async getRoundForActor(roundId: string, actor: AuthContext) {
    const round = await this.db.evaluationRound.findUnique({ where: { id: roundId }, include: roundAggregateInclude });
    if (!round) throw createHttpError(404, "Evaluation round does not exist.");
    return this.assertVisibleRound(round, actor);
  }

  private assertVisibleRound<T extends { storeId: string }>(round: T, actor: AuthContext) { requireStoreAccess(actor, round.storeId); return round; }

  private async assertScoringActor(actor: AuthContext, storeId: string) {
    if (actor.role === "ADMIN") return;
    const account = await this.db.userAccount.findFirst({
      where: { id: actor.accountId, role: "STORE_EVALUATOR", isActive: true, deletedAt: null, storeAccesses: { some: { storeId } } },
      select: { id: true },
    });
    if (!account) throw createHttpError(403, "The current account is not an active evaluator for this store.");
  }

  private liveEligible(storeId: string) {
    const accountModel = (this.db as PrismaClient & { userAccount?: PrismaClient["userAccount"] }).userAccount;
    if (!accountModel) return Promise.resolve([]);
    return accountModel.findMany({
      where: { role: "STORE_EVALUATOR", isActive: true, deletedAt: null, storeAccesses: { some: { storeId } } },
      select: { id: true, displayName: true },
      orderBy: [{ displayName: "asc" as const }, { id: "asc" as const }],
    });
  }

  private async toRoundDto(round: RoundWithAggregate, actor: AuthContext, includePrivate = false) {
    const eligible = round.status === "OPEN" ? await this.liveEligible(round.storeId) : undefined;
    const aggregate = computeRoundAggregate(round, actor.role === "ADMIN" && includePrivate, eligible);
    const mine = round.evaluations.find((item) => item.evaluatorAccountId === actor.accountId);
    const myEvaluation = mine ? evaluationSummary(mine, actor.role === "ADMIN") : null;
    if (actor.role === "STORE_EVALUATOR") {
      if (round.status === "OPEN") return { ...aggregate, aggregateOverall: null, aggregateTier: null, aggregateSkillCoverage: null, components: null, itemAverages: null, distribution: null, evaluators: [], adminEvaluation: null, myEvaluation };
      return { ...aggregate, evaluators: [], adminEvaluation: null, myEvaluation };
    }
    return { ...aggregate, adminEvaluation: mine?.evaluatorAccount?.role === "ADMIN" ? evaluationSummary(mine, true) : null, myEvaluation };
  }
}

export function computeRoundAggregate(round: RoundWithAggregate, includePrivate = false, liveEligible?: LiveEligibleEvaluator[]) {
  const identity = round.status === "CLOSED" ? resolveHistoricalIdentity({ ...round, evaluations: round.evaluations.filter((evaluation) => evaluation.evaluationStatus === "Completed") }) : null;
  const eligible = round.status === "OPEN" ? (liveEligible ?? []) : round.evaluators.filter((item) => item.excludedAt == null).map((item) => ({ id: item.evaluatorAccountId ?? "", displayName: item.evaluatorDisplayNameSnapshot, isActive: true }));
  const eligibleIds = new Set(eligible.map((item) => item.id).filter(Boolean));
  const submitted = round.evaluations.filter((item) =>
    (round.status === "OPEN" ? item.evaluationStatus === "Submitted" : item.evaluationStatus === "Completed")
    && item.evaluatorAccountId != null
    && eligibleIds.has(item.evaluatorAccountId));
  const policy = parsePolicySnapshotV1(round.scoringPolicySnapshot);
  const components = submitted.length ? {
    skill: averageDecimal(submitted.map((item) => item.skillScoreV1)), speed: averageDecimal(submitted.map((item) => item.speedScoreV1)), initiative: averageDecimal(submitted.map((item) => item.initiativeScoreV1)),
    attitude: averageDecimal(submitted.map((item) => item.attitudeScoreV1)), availability: averageDecimal(submitted.map((item) => item.availabilityScoreV1)), text: averageDecimal(submitted.map((item) => item.textScoreV1)),
  } : null;
  const calculatedOverall = submitted.length ? averageDecimal(submitted.map((item) => item.overallScoreV1)) : null;
  const overall = round.status === "CLOSED" && round.finalAggregateOverall != null ? Number(round.finalAggregateOverall) : calculatedOverall;
  const skillCoverage = round.status === "CLOSED" && round.finalAggregateSkillCoverage != null ? Number(round.finalAggregateSkillCoverage) : submitted.length ? averageDecimal(submitted.map((item) => item.skillCoverageV1)) : null;
  const byAccount = new Map(round.evaluations.map((item) => [item.evaluatorAccountId, item]));
  const categories = submitted.map((item) => categoriesFromSnapshots(item.skillSnapshots ?? []));
  const skillCategories = submitted.length ? {
    backOfHouse: averageCategory(categories.map((item) => item.backOfHouse)),
    waterBar: averageCategory(categories.map((item) => item.waterBar)),
    frontOfHouse: averageCategory(categories.map((item) => item.frontOfHouse)),
    operations: averageCategory(categories.map((item) => item.operations)),
  } : null;
  const resolvedComponents = components && { ...components, normalized: { skill: normalize(components.skill, policy.skillWeight), speed: normalize(components.speed, policy.speedWeight), initiative: normalize(components.initiative, policy.initiativeWeight), attitude: normalize(components.attitude, policy.attitudeWeight), availability: normalize(components.availability, policy.availabilityWeight), text: normalize(components.text, policy.textWeight) } };
  const itemAverages = {
    basis: "SUBMITTED_STORE_EVALUATORS" as const,
    submittedEvaluatorCount: submitted.length,
    components: {
      skill: itemAverage(components?.skill, policy.skillWeight),
      speed: itemAverage(components?.speed, policy.speedWeight),
      initiative: itemAverage(components?.initiative, policy.initiativeWeight),
      attitude: itemAverage(components?.attitude, policy.attitudeWeight),
      availability: itemAverage(components?.availability, policy.availabilityWeight),
      text: itemAverage(components?.text, policy.textWeight),
    },
    categories: {
      backOfHouse: percentageAverage(skillCategories?.backOfHouse.percentage),
      waterBar: percentageAverage(skillCategories?.waterBar.percentage),
      frontOfHouse: percentageAverage(skillCategories?.frontOfHouse.percentage),
      operations: percentageAverage(skillCategories?.operations.percentage),
    },
  };
  const scores = submitted.flatMap((item) => item.overallScoreV1 == null ? [] : [Number(item.overallScoreV1)]);
  const completedCount = round.status === "CLOSED" && round.closedSubmittedCount != null ? round.closedSubmittedCount : submitted.length;
  const eligibleCount = round.status === "CLOSED" && round.closedEligibleCount != null ? round.closedEligibleCount : eligible.length;
  return {
    id: round.id, roundNumber: round.roundNumber ?? 1,
    employee: { id: round.employee.id, displayName: identity?.employeeName ?? round.employee.displayName },
    store: { ...round.store, name: identity?.storeName ?? round.store.name },
    identitySources: identity?.identitySources ?? null,
    jobsSnapshot: parseRoundJobsSnapshot(round.employeeJobsSnapshot),
    employeeTypeSnapshot: round.employeeTypeSnapshot, scoringVersion: round.scoringVersion, policy,
    status: round.status, openedAt: (round.openedAt ?? round.createdAt).toISOString(), createdAt: round.createdAt.toISOString(), closedAt: round.closedAt?.toISOString() ?? null,
    completedCount, eligibleCount, isComplete: eligibleCount > 0 && completedCount === eligibleCount, aggregateStatus: round.status === "CLOSED" ? "FINAL" as const : "PROVISIONAL" as const,
    aggregateOverall: overall, aggregateTier: overall == null ? null : round.status === "CLOSED" && round.finalAggregateTier ? round.finalAggregateTier : getTierV1(overall, policy.tierPolicyVersion ?? 1),
    aggregateSkillCoverage: skillCoverage, skillCategories, components: resolvedComponents, itemAverages,
    distribution: scores.length ? { highest: Math.max(...scores), lowest: Math.min(...scores), spread: round1(Math.max(...scores) - Math.min(...scores)) } : null,
    evaluators: eligible.map((member) => { const evaluation = byAccount.get(member.id); return {
      membershipId: round.status === "CLOSED" ? round.evaluators.find((item) => item.evaluatorAccountId === member.id)?.id ?? member.id : `live:${member.id}`,
      evaluatorAccountId: member.id, evaluatorDisplayName: member.displayName, accountActive: round.status === "OPEN" ? true : (member.isActive ?? true),
      status: evaluation ? "Submitted" as const : "NotSubmitted" as const,
      ...(includePrivate && evaluation ? { evaluation: evaluationSummary(evaluation, true) } : {}),
    }; }),
  };
}

function evaluationSummary(evaluation: RoundWithAggregate["evaluations"][number], includePrivate: boolean) {
  return { id: evaluation.id, status: "Submitted" as const, submittedAt: (evaluation.submittedAt ?? evaluation.updatedAt).toISOString(), completedAt: evaluation.completedAt?.toISOString() ?? null,
    ...(includePrivate ? { overallScore: numberOrNull(evaluation.overallScoreV1), tier: evaluation.tierV1, components: { skill: numberOrNull(evaluation.skillScoreV1), speed: numberOrNull(evaluation.speedScoreV1), initiative: numberOrNull(evaluation.initiativeScoreV1), attitude: numberOrNull(evaluation.attitudeScoreV1), availability: numberOrNull(evaluation.availabilityScoreV1), text: numberOrNull(evaluation.textScoreV1) }, textFeedback: evaluation.textFeedback, skillCategories: categoriesFromSnapshots(evaluation.skillSnapshots) } : {}) };
}

function categoriesFromSnapshots(snapshots: RoundWithAggregate["evaluations"][number]["skillSnapshots"]) { return calculateSkillCategoryBreakdownV1(snapshots.map((item) => ({ id: item.skillDefinitionId ?? item.skillCode, weight: Number(item.weight), isActive: true, category: item.category, skillMode: item.skillMode })), snapshots.map((item) => ({ skillDefinitionId: item.skillDefinitionId ?? item.skillCode, status: item.status }))); }
function averageCategory(values: SkillCategoryMetricV1[]): SkillCategoryMetricV1 { const ratios = values.flatMap((value) => value.ratio == null ? [] : [value.ratio]); const ratio = ratios.length ? Math.round((ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 10000) / 10000 : null; const divisor = Math.max(values.length, 1); return { ratio, percentage: ratio == null ? null : round1(ratio * 100), weightedRaw: round1(values.reduce((sum, value) => sum + value.weightedRaw, 0) / divisor), weightedMax: round1(values.reduce((sum, value) => sum + value.weightedMax, 0) / divisor), confirmedCount: Math.round(values.reduce((sum, value) => sum + value.confirmedCount, 0) / divisor), totalCount: Math.round(values.reduce((sum, value) => sum + value.totalCount, 0) / divisor), capableCount: Math.round(values.reduce((sum, value) => sum + value.capableCount, 0) / divisor) }; }
function averageDecimal(values: Array<Prisma.Decimal | null>) { const present = values.filter((value): value is Prisma.Decimal => value != null); return present.length ? Number(present.reduce((sum, value) => sum.add(value), new Prisma.Decimal(0)).div(present.length).toDecimalPlaces(2)) : 0; }
function itemAverage(average: number | undefined, maximum: number) { return { average: average ?? null, maximum, unit: "points" as const }; }
function percentageAverage(average: number | null | undefined) { return { average: average ?? null, maximum: 100, unit: "percent" as const }; }
function normalize(value: number, maximum: number) { return maximum === 0 ? 0 : round1((value / maximum) * 100); }
function numberOrNull(value: Prisma.Decimal | null) { return value == null ? null : Number(value); }
function round1(value: number) { return Math.round((value + Number.EPSILON) * 10) / 10; }
function decimal(value: number) { return new Prisma.Decimal(value); }
function parseRoundJobsSnapshot(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const job = entry as Record<string, unknown>;
    return typeof job.id === "string" && typeof job.name === "string"
      ? [{ id: job.id, name: job.name, colorToken: typeof job.colorToken === "string" ? job.colorToken : "slate", displayOrder: typeof job.displayOrder === "number" ? job.displayOrder : 0 }]
      : [];
  });
}
function toJson(value: unknown): Prisma.InputJsonValue { return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue; }
function isUniqueConflict(error: unknown) { return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"; }
function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === "P2034" || (error.code === "P2010" && error.meta?.code === "40001"));
}
