import { describe, expect, it, vi } from "vitest";
import { EvaluationReadService } from "../src/evaluationReadService.js";

describe("CLOSED Round history query", () => {
  it("uses persisted final snapshots, server Store scope, filters, and stable pagination", async () => {
    const findMany = vi.fn(async () => [{
      id: "round-1", employeeId: "employee-1", storeId: "store-1", roundNumber: 2,
      closedAt: new Date("2026-09-01T10:00:00.000Z"), createdAt: new Date("2026-08-20T00:00:00.000Z"),
      employeeTypeSnapshot: "REGULAR", employeeDisplayNameSnapshot: "HandoverEmployee006 Snapshot", storeNameSnapshot: "Hurstville Snapshot",
      scoringVersion: "REGULAR_V3", scoringPolicySnapshot: { skillWeight: 60 },
      employeeJobsSnapshot: [{ id: "job-1", name: "带训员", colorToken: "violet", displayOrder: 20 }],
      closedSubmittedCount: 2, closedEligibleCount: 3, finalAggregateOverall: 81.25, finalAggregateTier: "T2",
      finalAggregateComponents: { skill: 50 }, finalAggregateSkillCoverage: 0.8,
      employee: { displayName: "Current Name" }, store: { name: "Current Store" },
      evaluations: [{ employeeNameSnapshot: "HandoverEmployee006 Evaluation", storeNameSnapshot: "Hurstville Evaluation" }],
    }]);
    const adminFindMany = vi.fn(async () => [{ roundId: "round-1", overallScoreV1: 84, evaluatorAccount: { displayName: "Admin" } }]);
    const count = vi.fn(async () => 27);
    const service = new EvaluationReadService({ evaluationRound: { findMany, count }, evaluation: { findMany: adminFindMany } } as never);
    const actor = { accountId: "admin-1", userId: "admin-1", username: "admin-1", displayName: "Admin", role: "ADMIN" as const, storeIds: [], canAccessAllStores: true };
    const result = await service.listClosedRoundHistory({ storeId: "store-1", employeeType: "REGULAR", tier: "T2", jobId: "job-1", page: 1, pageSize: 25 }, ["store-1"], actor);
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({ where: { status: "CLOSED", storeId: "store-1", employeeTypeSnapshot: "REGULAR", finalAggregateTier: "T2", employeeJobsSnapshot: { array_contains: [{ id: "job-1" }] } }, orderBy: [{ closedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }], skip: 0, take: 25 });
    expect(count).toHaveBeenCalledWith({ where: findMany.mock.calls[0]?.[0].where });
    expect(result).toMatchObject({ total: 27, totalPages: 2 });
    expect(result.items[0]).toMatchObject({ employeeName: "HandoverEmployee006 Snapshot", storeName: "Hurstville Snapshot", overallScore: 81.25, tier: "T2", completedCount: 2, eligibleCount: 3, adminScore: 84, jobsSnapshot: [{ id: "job-1", name: "带训员" }] });
    expect(adminFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ roundId: { in: ["round-1"] }, evaluatorRoleSnapshot: "ADMIN" }) }));
  });

  it("never returns OPEN rounds", async () => {
    const findMany = vi.fn(async () => []);
    await new EvaluationReadService({ evaluationRound: { findMany, count: vi.fn(async () => 0) } } as never).listClosedRoundHistory({}, ["store-1"], { accountId: "evaluator-1", userId: "evaluator-1", username: "evaluator-1", displayName: "Evaluator", role: "STORE_EVALUATOR", storeIds: ["store-1"], canAccessAllStores: false });
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({ status: "CLOSED", storeId: { in: ["store-1"] } });
  });

  it("omits ADMIN personal score fields from a STORE_EVALUATOR history response", async () => {
    const findMany = vi.fn(async () => [{
      id: "round-1", employeeId: "employee-1", storeId: "store-1", roundNumber: 1,
      closedAt: new Date("2026-09-01T10:00:00.000Z"), createdAt: new Date("2026-08-20T00:00:00.000Z"),
      employeeTypeSnapshot: "REGULAR", employeeDisplayNameSnapshot: null, storeNameSnapshot: null,
      scoringVersion: "REGULAR_V3", scoringPolicySnapshot: {}, employeeJobsSnapshot: null,
      closedSubmittedCount: 1, closedEligibleCount: 1, finalAggregateOverall: 80, finalAggregateTier: "T2",
      finalAggregateComponents: null, finalAggregateSkillCoverage: null,
      employee: { displayName: "Current Employee" }, store: { name: "Current Store" },
      evaluations: [{ employeeNameSnapshot: "Historical Employee", storeNameSnapshot: "Historical Store" }],
    }]);
    const actor = { accountId: "evaluator-1", userId: "evaluator-1", username: "evaluator-1", displayName: "Evaluator", role: "STORE_EVALUATOR" as const, storeIds: ["store-1"], canAccessAllStores: false };
    const adminFindMany = vi.fn();
    const result = await new EvaluationReadService({ evaluationRound: { findMany, count: vi.fn(async () => 1) }, evaluation: { findMany: adminFindMany } } as never).listClosedRoundHistory({}, ["store-1"], actor);
    expect(result.items[0]).not.toHaveProperty("adminScore");
    expect(result.items[0]).not.toHaveProperty("adminEvaluatorName");
    expect(result.items[0]).toMatchObject({ employeeName: "Historical Employee", storeName: "Historical Store", identitySources: { employeeName: "EVALUATION_SNAPSHOT", storeName: "EVALUATION_SNAPSHOT" } });
    expect(adminFindMany).not.toHaveBeenCalled();
  });
});
