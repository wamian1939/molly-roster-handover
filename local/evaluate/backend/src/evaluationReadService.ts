import { Prisma, type EmployeeType, type PrismaClient, type TierV1 } from "@prisma/client";
import type { AuthContext } from "./auth.js";
import { createHttpError } from "./httpError.js";
import { resolveHistoricalIdentity } from "./historicalIdentity.js";
import { latestAggregateByEmployee, loadLatestValidClosedAggregates, loadRoundAggregates } from "./roundAggregateRead.js";

type StoreScope = string[] | undefined;

export type StoreEvaluationReadQuery = {
  page?: number;
  pageSize?: number;
  status?: "NotEvaluated" | "Submitted" | "Completed";
  employmentType?: "Full-time" | "Part-time" | "Casual";
  employeeType?: EmployeeType;
  search?: string;
};

export type EvaluationHistoryQuery = {
  storeId?: string;
  employeeType?: EmployeeType;
  employeeId?: string;
  tier?: TierV1;
  jobId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  pageSize?: number;
};

export class EvaluationReadService {
  constructor(private readonly db: PrismaClient) {}

  async getStoreRoster(storeId: string, query: StoreEvaluationReadQuery = {}, actor?: AuthContext) {
    const store = await this.db.store.findUnique({ where: { id: storeId } });
    if (!store) throw createHttpError(404, "Store does not exist.");
    if (!store.isActive) throw createHttpError(409, "门店已归档，不能进入当前员工评价页面。");
    const employees = await this.db.employee.findMany({
      where: {
        storeId, status: "Active",
        ...(query.employmentType ? { employmentType: toBackendEmploymentType(query.employmentType) } : {}),
        ...(query.employeeType ? { employeeType: query.employeeType } : {}),
        ...(query.search ? { OR: [
          { displayName: { contains: query.search, mode: "insensitive" as const } },
        ] } : {}),
      },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    });
    const employeeIds = employees.map((employee) => employee.id);
    const [aggregates, openRounds, liveEvaluators] = employeeIds.length === 0 ? [[], [], []] : await Promise.all([
      loadLatestValidClosedAggregates(this.db, employeeIds),
      this.db.evaluationRound.findMany({
        where: { employeeId: { in: employeeIds }, storeId, status: "OPEN" },
        include: {
          evaluations: { select: { id: true, evaluatorAccountId: true, evaluationStatus: true, updatedAt: true, submittedAt: true, employeeTypeSnapshot: true, overallScoreV1: true, tierV1: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      (this.db as PrismaClient & { userAccount?: PrismaClient["userAccount"] }).userAccount?.findMany({
        where: { role: "STORE_EVALUATOR", isActive: true, deletedAt: null, storeAccesses: { some: { storeId } } },
        select: { id: true },
      }) ?? Promise.resolve([]),
    ]);
    const liveEvaluatorIds = new Set(liveEvaluators.map((account) => account.id));
    const latestByEmployee = latestAggregateByEmployee(aggregates);
    const openByEmployee = new Map(openRounds.map((round) => [round.employeeId, round]));
    const rows = employees.map((employee) => {
      const latest = latestByEmployee.get(employee.id);
      const open = openByEmployee.get(employee.id);
      const myEvaluation = actor ? open?.evaluations.find((evaluation) => evaluation.evaluatorAccountId === actor.accountId && evaluation.evaluationStatus === "Submitted") : undefined;
      const storeSubmissions = open?.evaluations.filter((evaluation) => evaluation.evaluatorAccountId != null && liveEvaluatorIds.has(evaluation.evaluatorAccountId) && evaluation.evaluationStatus === "Submitted") ?? [];
      const completedCount = storeSubmissions.length;
      const eligibleCount = liveEvaluatorIds.size;
      const provisionalScores = storeSubmissions.flatMap((evaluation) => evaluation.overallScoreV1 == null ? [] : [Number(evaluation.overallScoreV1)]);
      const provisionalOverall = provisionalScores.length ? round(provisionalScores.reduce((sum, value) => sum + value, 0) / provisionalScores.length) : null;
      const evaluationStatus = myEvaluation ? "Submitted" as const : latest ? "Completed" as const : "NotEvaluated" as const;
      return {
        employee: { id: employee.id, displayName: employee.displayName, employmentType: toFrontendEmploymentType(employee.employmentType), status: employee.status, employeeType: employee.employeeType },
        evaluationStatus,
        latestCompletedEvaluation: latest ? {
          id: latest.id, roundId: latest.id, overallScore: latest.aggregateOverall, tier: latest.aggregateTier,
          skillCoverage: latest.aggregateSkillCoverage, completedAt: latest.closedAt ?? latest.createdAt,
          employeeTypeSnapshot: latest.employeeTypeSnapshot, aggregateStatus: latest.aggregateStatus,
          completedCount: latest.completedCount, eligibleCount: latest.eligibleCount,
        } : null,
        eligibleEvaluatorCount: liveEvaluatorIds.size,
        currentRound: open ? { id: open.id, status: open.status, completedCount, eligibleCount, provisionalOverall: actor?.role === "ADMIN" ? provisionalOverall : undefined, myEvaluation: myEvaluation ? { id: myEvaluation.id, status: "Submitted" as const, overallScore: myEvaluation.overallScoreV1 == null ? null : Number(myEvaluation.overallScoreV1), submittedAt: (myEvaluation.submittedAt ?? myEvaluation.updatedAt).toISOString() } : null } : null,
      };
    });
    const filteredRows = query.status ? rows.filter((row) => row.evaluationStatus === query.status) : rows;
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const scored = rows.flatMap((row) => row.latestCompletedEvaluation?.overallScore ?? []);
    return {
      store: { id: store.id, name: store.name, region: store.region, managerName: store.managerName, city: store.city },
      summary: {
        totalEmployees: rows.length,
        evaluatedEmployees: rows.filter((row) => row.latestCompletedEvaluation !== null).length,
        submittedEmployees: rows.filter((row) => row.evaluationStatus === "Submitted").length,
        averageScore: scored.length ? round(scored.reduce((sum, score) => sum + score, 0) / scored.length) : null,
      },
      items: filteredRows.slice((page - 1) * pageSize, page * pageSize),
      page, pageSize, total: filteredRows.length, totalPages: Math.max(1, Math.ceil(filteredRows.length / pageSize)),
    };
  }

  async listCompletedHistory(storeIds?: StoreScope) {
    const rounds = await loadRoundAggregates(this.db, { storeIds, includeOpen: false });
    return rounds.map((round) => ({
      id: round.id, roundId: round.id, employeeId: round.employee.id, employeeName: round.employee.displayName,
      storeId: round.store.id, storeName: round.store.name,
      evaluatorId: null, evaluatorName: null, overallScore: round.aggregateOverall, tier: round.aggregateTier,
      skillCoverage: round.aggregateSkillCoverage, completedAt: round.closedAt ?? round.createdAt,
      employeeTypeSnapshot: round.employeeTypeSnapshot, completedCount: round.completedCount,
      eligibleCount: round.eligibleCount, roundNumber: round.roundNumber, aggregateStatus: round.aggregateStatus,
      identitySources: round.identitySources,
    }));
  }

  async listClosedRoundHistory(query: EvaluationHistoryQuery, storeIds: StoreScope, actor: AuthContext) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;
    if (dateTo) dateTo.setUTCHours(23, 59, 59, 999);
    const where = {
      status: "CLOSED" as const,
      ...(query.storeId ? { storeId: query.storeId } : storeIds ? { storeId: { in: storeIds } } : {}),
      ...(query.employeeType ? { employeeTypeSnapshot: query.employeeType } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.tier ? { finalAggregateTier: query.tier } : {}),
      ...(query.jobId ? { employeeJobsSnapshot: { array_contains: [{ id: query.jobId }] } } : {}),
      ...(query.dateFrom || dateTo ? { closedAt: { ...(query.dateFrom ? { gte: query.dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) } } : {}),
    } satisfies Prisma.EvaluationRoundWhereInput;
    const [total, pageRounds] = await Promise.all([this.db.evaluationRound.count({ where }), this.db.evaluationRound.findMany({
      where,
      select: {
        id: true, employeeId: true, storeId: true, roundNumber: true, closedAt: true, createdAt: true,
        employeeTypeSnapshot: true, employeeDisplayNameSnapshot: true, storeNameSnapshot: true,
        scoringVersion: true, scoringPolicySnapshot: true, employeeJobsSnapshot: true,
        closedSubmittedCount: true, closedEligibleCount: true, finalAggregateOverall: true,
        finalAggregateTier: true, finalAggregateComponents: true, finalAggregateSkillCoverage: true,
        employee: { select: { displayName: true } }, store: { select: { name: true } },
        evaluations: { where: { evaluationStatus: "Completed" }, select: { employeeNameSnapshot: true, storeNameSnapshot: true } },
      },
      orderBy: [{ closedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    })]);
    const adminByRound = new Map<string, { overallScoreV1: Prisma.Decimal | null; evaluatorAccount: { displayName: string } | null }>();
    if (actor.role === "ADMIN" && pageRounds.length) {
      const adminEvaluations = await this.db.evaluation.findMany({
        where: { roundId: { in: pageRounds.map((round) => round.id) }, evaluatorRoleSnapshot: "ADMIN", evaluationStatus: "Completed" },
        select: { roundId: true, overallScoreV1: true, evaluatorAccount: { select: { displayName: true } } },
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      });
      for (const evaluation of adminEvaluations) {
        if (!adminByRound.has(evaluation.roundId)) adminByRound.set(evaluation.roundId, evaluation);
      }
    }
    const items = pageRounds.map((round) => {
      const identity = resolveHistoricalIdentity(round);
      return {
      id: round.id,
      roundId: round.id,
      employeeId: round.employeeId,
      employeeName: identity.employeeName,
      storeId: round.storeId,
      storeName: identity.storeName,
      identitySources: identity.identitySources,
      employeeTypeSnapshot: round.employeeTypeSnapshot,
      roundNumber: round.roundNumber,
      closedAt: (round.closedAt ?? round.createdAt).toISOString(),
      completedAt: (round.closedAt ?? round.createdAt).toISOString(),
      completedCount: round.closedSubmittedCount ?? 0,
      eligibleCount: round.closedEligibleCount ?? 0,
      overallScore: decimalNumber(round.finalAggregateOverall),
      tier: round.finalAggregateTier,
      components: round.finalAggregateComponents,
      skillCoverage: decimalNumber(round.finalAggregateSkillCoverage),
      scoringVersion: round.scoringVersion,
      policySnapshot: round.scoringPolicySnapshot,
      jobsSnapshot: parseJobSnapshot(round.employeeJobsSnapshot),
      ...(actor.role === "ADMIN" ? {
        adminScore: decimalNumber(adminByRound.get(round.id)?.overallScoreV1),
        adminEvaluatorName: adminByRound.get(round.id)?.evaluatorAccount?.displayName ?? null,
      } : {}),
      aggregateStatus: "FINAL" as const,
      };
    });
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }
}

type JobSnapshot = { id: string; name: string; colorToken: string; displayOrder: number };
function parseJobSnapshot(value: Prisma.JsonValue | null): JobSnapshot[] | null {
  if (!Array.isArray(value)) return null;
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const job = entry as Record<string, unknown>;
    return typeof job.id === "string" && typeof job.name === "string"
      ? [{ id: job.id, name: job.name, colorToken: typeof job.colorToken === "string" ? job.colorToken : "slate", displayOrder: typeof job.displayOrder === "number" ? job.displayOrder : 0 }]
      : [];
  });
}

function decimalNumber(value: Prisma.Decimal | null | undefined) { return value == null ? null : Number(value); }

function round(value: number) { return Math.round(value * 10) / 10; }
function toBackendEmploymentType(value: "Full-time" | "Part-time" | "Casual") { return value === "Full-time" ? "FullTime" as const : value === "Part-time" ? "PartTime" as const : "Casual" as const; }
function toFrontendEmploymentType(value: "FullTime" | "PartTime" | "Casual") { return value === "FullTime" ? "Full-time" as const : value === "PartTime" ? "Part-time" as const : "Casual" as const; }
