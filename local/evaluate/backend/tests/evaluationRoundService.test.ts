import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { computeRoundAggregate, EvaluationRoundService } from "../src/evaluationRoundService.js";
import { roundFromEvaluation } from "./roundTestFixtures.js";

const eligible = ["a", "b", "c"].map((id) => ({ id, displayName: `Evaluator ${id}` }));

describe("live round aggregate authority", () => {
  it("uses the current active store evaluators as the OPEN denominator", () => {
    const round = openRound([evaluation("a", 80), evaluation("b", 70), evaluation("admin", 85, "ADMIN")]);
    const aggregate = computeRoundAggregate(round as never, true, eligible);
    expect(aggregate).toMatchObject({ completedCount: 2, eligibleCount: 3, aggregateOverall: 75, aggregateTier: "T2", aggregateStatus: "PROVISIONAL" });
    expect(aggregate.evaluators.map((item) => item.status)).toEqual(["Submitted", "Submitted", "NotSubmitted"]);
  });

  it("does not add ADMIN to progress or the store aggregate", () => {
    const round = openRound([evaluation("a", 80), evaluation("b", 70), evaluation("admin", 100, "ADMIN")]);
    const aggregate = computeRoundAggregate(round as never, true, eligible);
    expect(aggregate.completedCount).toBe(2);
    expect(aggregate.eligibleCount).toBe(3);
    expect(aggregate.aggregateOverall).toBe(75);
    expect(aggregate.evaluators.some((item) => item.evaluatorAccountId === "admin")).toBe(false);
  });

  it("returns no numeric aggregate when nobody has submitted", () => {
    const aggregate = computeRoundAggregate(openRound([]) as never, true, eligible);
    expect(aggregate.aggregateOverall).toBeNull();
    expect(aggregate.aggregateTier).toBeNull();
    expect(aggregate.components).toBeNull();
    expect(aggregate.itemAverages).toMatchObject({
      submittedEvaluatorCount: 0,
      components: { skill: { average: null, maximum: 50 }, speed: { average: null, maximum: 12 } },
      categories: { operations: { average: null, maximum: 100 } },
    });
    expect(aggregate.completedCount).toBe(0);
  });

  it("uses the close-time membership and frozen aggregate for CLOSED history", () => {
    const round = openRound([evaluation("a", 80), evaluation("b", 70)]);
    round.status = "CLOSED";
    round.closedAt = new Date("2026-09-05T08:00:00.000Z");
    round.closedEligibleCount = 3;
    round.closedSubmittedCount = 2;
    round.finalAggregateOverall = new Prisma.Decimal(75);
    round.finalAggregateTier = "T2";
    round.evaluators = eligible.map((item) => ({ id: `member-${item.id}`, evaluatorAccountId: item.id, evaluatorDisplayNameSnapshot: item.displayName, excludedAt: null, evaluatorAccount: { isActive: true, role: "STORE_EVALUATOR" }, createdAt: new Date() }));
    const aggregate = computeRoundAggregate(round as never, true);
    expect(aggregate).toMatchObject({ completedCount: 2, eligibleCount: 3, aggregateOverall: 75, aggregateStatus: "FINAL" });
  });

  it("does not attach mutable current skills to a CLOSED round", () => {
    const round = openRound([evaluation("a", 80)]);
    round.status = "CLOSED";
    round.employee.id = "employee-1";
    round.employee.skills = [{ status: "Proficient", skillDefinitionId: "skill-1" }] as never;
    const aggregate = computeRoundAggregate(round as never, true);

    expect(aggregate.employee).toEqual({ id: round.employee.id, displayName: round.employee.displayName });
  });

  it("keeps a legacy CLOSED label stable after current employee and store rename", () => {
    const submitted = { ...evaluation("a", 80), evaluationStatus: "Completed" as const, employeeNameSnapshot: "Recorded Employee", storeNameSnapshot: "Recorded Store" };
    const round = Object.assign(openRound([submitted]), { employeeDisplayNameSnapshot: null, storeNameSnapshot: null });
    round.status = "CLOSED";
    round.employee.displayName = "Renamed Employee";
    round.store.name = "Renamed Store";
    const aggregate = computeRoundAggregate(round as never, true);

    expect(aggregate.employee.displayName).toBe("Recorded Employee");
    expect(aggregate.store.name).toBe("Recorded Store");
    expect(aggregate.identitySources).toEqual({ employeeName: "EVALUATION_SNAPSHOT", storeName: "EVALUATION_SNAPSHOT" });
  });

  it("allows an authorized evaluator to read a redacted CLOSED summary", async () => {
    const round = openRound([evaluation("a", 80), evaluation("b", 70), evaluation("admin", 85, "ADMIN")]);
    round.status = "CLOSED";
    round.closedAt = new Date("2026-09-05T08:00:00.000Z");
    round.closedEligibleCount = 3;
    round.closedSubmittedCount = 2;
    round.finalAggregateOverall = new Prisma.Decimal(75);
    round.finalAggregateTier = "T2";
    round.evaluators = eligible.map((item) => ({ id: `member-${item.id}`, evaluatorAccountId: item.id, evaluatorDisplayNameSnapshot: item.displayName, excludedAt: null, evaluatorAccount: { isActive: true, role: "STORE_EVALUATOR" }, createdAt: new Date() }));
    const db = { evaluationRound: { findUnique: async () => round } };
    const service = new EvaluationRoundService(db as never);
    const result = await service.getRound("round-1", {
      accountId: "a", userId: "a", username: "a", displayName: "Evaluator a",
      role: "STORE_EVALUATOR", storeIds: [round.storeId], canAccessAllStores: false,
    });

    expect(result).toMatchObject({ aggregateOverall: 75, aggregateTier: "T2", completedCount: 2, eligibleCount: 3 });
    expect(result.evaluators).toEqual([]);
    expect(result.adminEvaluation).toBeNull();
  });

  it("does not expose qualification voting fields", () => {
    const aggregate = computeRoundAggregate(openRound([evaluation("a", 80)]) as never, true, eligible);
    expect(aggregate).not.toHaveProperty("qualifications");
    expect(aggregate).not.toHaveProperty("qualificationConsensus");
  });

  it("returns denominator-aware component and category averages from submitted snapshots", () => {
    const first = evaluation("a", 80);
    first.skillSnapshots = [skillSnapshot("boh-a", "BACK_OF_HOUSE", "PROGRESSIVE", "Proficient"), skillSnapshot("ops-a", "OPERATIONS", "BINARY", "CanDo")];
    const second = evaluation("b", 70);
    second.skillSnapshots = [skillSnapshot("boh-b", "BACK_OF_HOUSE", "PROGRESSIVE", "NotTrained"), skillSnapshot("ops-b", "OPERATIONS", "BINARY", "CannotDo")];
    const aggregate = computeRoundAggregate(openRound([first, second]) as never, true, eligible);

    expect(aggregate.itemAverages).toMatchObject({
      basis: "SUBMITTED_STORE_EVALUATORS",
      submittedEvaluatorCount: 2,
      components: { skill: { average: 45, maximum: 50 }, speed: { average: 5, maximum: 12 } },
      categories: { backOfHouse: { average: 50, maximum: 100 }, operations: { average: 50, maximum: 100 } },
    });
    expect(aggregate.skillCategories?.operations.percentage).toBe(50);
  });
});

function openRound(evaluations: ReturnType<typeof evaluation>[]) {
  const seed = evaluation("seed", 50);
  const base = roundFromEvaluation(seed, { status: "OPEN" });
  return { ...base, id: "round-1", status: "OPEN" as const, closedAt: null, employee: { ...base.employee, skills: [] }, evaluators: [], evaluations };
}

function skillSnapshot(skillCode: string, category: "BACK_OF_HOUSE" | "OPERATIONS", skillMode: "PROGRESSIVE" | "BINARY", status: "Proficient" | "NotTrained" | "CanDo" | "CannotDo") {
  const factor = status === "Proficient" || status === "CanDo" ? 1 : 0;
  return { id: `snapshot-${skillCode}`, skillDefinitionId: skillCode, skillCode, skillNameZh: skillCode, skillNameEn: skillCode, category, skillMode, status, weight: new Prisma.Decimal(1), statusFactor: new Prisma.Decimal(factor), contribution: new Prisma.Decimal(factor), createdAt: new Date() };
}

function evaluation(evaluatorAccountId: string, overall: number, role: "STORE_EVALUATOR" | "ADMIN" = "STORE_EVALUATOR") {
  const value = new Prisma.Decimal(overall);
  return {
    id: `eval-${evaluatorAccountId}`, evaluatorAccountId, evaluatorRoleSnapshot: role, evaluationStatus: "Submitted" as const,
    overallScoreV1: value, skillScoreV1: new Prisma.Decimal(overall * 0.6), speedScoreV1: new Prisma.Decimal(5), initiativeScoreV1: new Prisma.Decimal(5), attitudeScoreV1: new Prisma.Decimal(5), availabilityScoreV1: new Prisma.Decimal(2.5), textScoreV1: new Prisma.Decimal(2.5),
    skillCoverageV1: new Prisma.Decimal(overall / 100), tierV1: null, textFeedback: null, submittedAt: new Date("2026-09-05T07:00:00.000Z"), updatedAt: new Date("2026-09-05T07:00:00.000Z"), completedAt: null,
    evaluatorAccount: { id: evaluatorAccountId, displayName: evaluatorAccountId, role, isActive: true, deletedAt: null }, skillSnapshots: [],
  };
}
