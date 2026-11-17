import { Prisma } from "@prisma/client";

const policy = { skillWeight: 50, speedWeight: 12, initiativeWeight: 10, attitudeWeight: 10, availabilityWeight: 8, textWeight: 10 };

export function roundFromEvaluation(evaluation: Record<string, any>, options: { status?: "OPEN" | "CLOSED"; employee?: Record<string, any>; store?: Record<string, any>; evaluatorId?: string } = {}) {
  const evaluatorId = options.evaluatorId ?? evaluation.evaluatorAccountId ?? "manager-1";
  const roundStatus = options.status ?? "CLOSED";
  const submitted = evaluation.evaluationStatus === "Submitted" || evaluation.evaluationStatus === "Completed";
  const row = {
    evaluationStatus: evaluation.evaluationStatus ?? (roundStatus === "OPEN" ? "Submitted" : "Completed"),
    evaluatorAccountId: evaluatorId,
    skillScoreV1: decimal(evaluation.skillScoreV1),
    speedScoreV1: decimal(evaluation.speedScoreV1 ?? ratingScore(evaluation.speedRating, 12)),
    initiativeScoreV1: decimal(evaluation.initiativeScoreV1 ?? ratingScore(evaluation.initiativeRating, 10)),
    attitudeScoreV1: decimal(evaluation.attitudeScoreV1 ?? ratingScore(evaluation.attitudeRating, 10)),
    availabilityScoreV1: decimal(evaluation.availabilityScoreV1 ?? ratingScore(evaluation.availabilityRating, 8)),
    textScoreV1: decimal(evaluation.textScoreV1 ?? 0),
    overallScoreV1: decimal(evaluation.overallScoreV1),
    skillCoverageV1: decimal(evaluation.skillCoverageV1),
    completedAt: roundStatus === "CLOSED" && submitted ? evaluation.completedAt ?? new Date() : null,
    submittedAt: evaluation.submittedAt ?? evaluation.completedAt ?? evaluation.updatedAt ?? new Date(),
    updatedAt: evaluation.updatedAt ?? evaluation.completedAt ?? new Date(),
    evaluatorAccount: evaluation.evaluatorAccount ?? { id: evaluatorId, displayName: evaluation.evaluatorNameSnapshot ?? "Evaluator", role: "STORE_EVALUATOR", isActive: true },
    skillSnapshots: evaluation.skillSnapshots ?? [],
    ...evaluation,
  };
  return {
    id: evaluation.roundId ?? `round-${evaluation.id}`,
    employeeId: evaluation.employeeId,
    storeId: evaluation.storeId ?? "store-1",
    employeeTypeSnapshot: evaluation.employeeTypeSnapshot ?? "REGULAR",
    scoringVersion: "v1",
    scoringPolicySnapshot: policy,
    skillBaselineSnapshot: [],
    status: roundStatus,
    createdByAccountId: evaluatorId,
    createdAt: evaluation.createdAt ?? evaluation.completedAt ?? new Date(),
    openedAt: evaluation.createdAt ?? evaluation.completedAt ?? new Date(),
    roundNumber: evaluation.roundNumber ?? 1,
    closedAt: roundStatus === "OPEN" ? null : evaluation.completedAt ?? new Date(),
    closedEligibleCount: null,
    closedSubmittedCount: null,
    finalAggregateOverall: null,
    finalAggregateTier: null,
    finalAggregateComponents: null,
    finalAggregateSkillCoverage: null,
    employee: options.employee ?? { id: evaluation.employeeId, displayName: evaluation.employeeNameSnapshot ?? "Employee", skills: [] },
    store: options.store ?? { id: evaluation.storeId ?? "store-1", name: evaluation.storeNameSnapshot ?? "Hurstville" },
    evaluators: [{ id: `member-${evaluation.id}`, evaluatorAccountId: evaluatorId, evaluatorDisplayNameSnapshot: evaluation.evaluatorNameSnapshot ?? "Evaluator", excludedAt: null, evaluatorAccount: { isActive: true, role: "STORE_EVALUATOR" }, createdAt: new Date() }],
    evaluations: [row],
  };
}

function decimal(value: unknown) {
  return value == null ? null : value instanceof Prisma.Decimal ? value : new Prisma.Decimal(Number(value));
}

function ratingScore(value: unknown, maximum: number) {
  return value == null ? null : Number(value) / 5 * maximum;
}
