import { describe, expect, it, vi } from "vitest";
import { EvaluationReadService } from "../src/evaluationReadService.js";
import { roundFromEvaluation } from "./roundTestFixtures.js";

const actor = { accountId: "manager-1", id: "manager-1", userId: "manager-1", username: "manager-1", displayName: "Winnie", role: "STORE_EVALUATOR", storeId: "store-1", store: null } as const;

function setup(options: {
  completed?: Array<Record<string, unknown>>;
  submissions?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
} = {}) {
  const store = { id: "store-1", name: "Hurstville", region: "Sydney", managerName: "Winnie", city: "Sydney", isActive: true };
  const employees = [{
    id: "employee-1",
    storeId: "store-1",
    displayName: "HandoverEmployee016",
    employmentType: "PartTime",
    employeeType: "REGULAR",
    employmentCommencementDate: null,
    status: "Active",
  }];
  const evaluationFindMany = vi.fn(async (query: { where?: { id?: unknown; evaluationStatus?: string } }) =>
    query.where?.id ? (options.completed ?? []) : []);
  const db = {
    $queryRaw: vi.fn(async () => (options.completed ?? []).map((row) => ({ id: row.id as string }))),
    store: { findUnique: vi.fn(async () => store) },
    employee: { findMany: vi.fn(async () => employees) },
    evaluation: { findMany: evaluationFindMany },
    evaluationRound: { findMany: vi.fn(async (query: { where?: { status?: string } }) => {
      if (query.where?.status === "OPEN") return (options.submissions ?? []).map((row) => roundFromEvaluation({ ...row, evaluationStatus: "Submitted", evaluatorAccountId: "manager-1", employeeTypeSnapshot: "REGULAR" }, { status: "OPEN", employee: { id: "employee-1", displayName: "HandoverEmployee016" }, store }));
      return (options.history ?? options.completed ?? []).map((row) => roundFromEvaluation({ ...row, evaluationStatus: "Completed", employeeTypeSnapshot: "REGULAR" }, { employee: { id: "employee-1", displayName: String(row.employeeNameSnapshot ?? "HandoverEmployee016") }, store: { id: "store-1", name: String(row.storeNameSnapshot ?? "Hurstville") } }));
    }) },
  };
  return { service: new EvaluationReadService(db as never), db, evaluationFindMany };
}

describe("EvaluationReadService", () => {
  it("uses only the latest CLOSED round as the formal score", async () => {
    const completed = [{
      id: "completed-1",
      employeeId: "employee-1",
      evaluationPeriod: "2026 Q3",
      overallScoreV1: 82.4,
      tierV1: "T2",
      skillCoverageV1: 0.8,
      completedAt: new Date("2026-08-12T10:00:00.000Z"),
    }];
    const { service, evaluationFindMany } = setup({ completed });

    const result = await service.getStoreRoster("store-1", {}, actor);

    expect(result.items[0]).toMatchObject({
      evaluationStatus: "Completed",
      latestCompletedEvaluation: {
        id: "round-completed-1",
        overallScore: 82.4,
        tier: "T2",
        skillCoverage: 0.8,
      },
    });
    expect(evaluationFindMany).not.toHaveBeenCalled();
  });

  it("returns NotEvaluated without fabricating an Evaluation", async () => {
    const { service } = setup();
    const result = await service.getStoreRoster("store-1");
    expect(result.items[0]).toMatchObject({
      evaluationStatus: "NotEvaluated",
      latestCompletedEvaluation: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/synthetic|grade|aiRiskScore|manualWeightedScore/i);
  });

  it("does not mark ADMIN as submitted because another evaluator has a current submission", async () => {
    const submissions = [{
      id: "submission-store-evaluator",
      employeeId: "employee-1",
      updatedAt: new Date("2026-08-13T10:00:00.000Z"),
    }];
    const admin = { ...actor, accountId: "admin", id: "admin", userId: "admin", role: "ADMIN" as const, storeId: null };
    const { service } = setup({ submissions });

    const result = await service.getStoreRoster("store-1", {}, admin);

    expect(result.items[0]).toMatchObject({
      evaluationStatus: "NotEvaluated",
      currentRound: { id: "round-submission-store-evaluator", myEvaluation: null },
    });
  });

  it("lists only immutable Completed V1 history using snapshots", async () => {
    const history = [{
      id: "completed-1",
      roundNumber: 4,
      employeeId: "employee-1",
      storeId: "store-1",
      employeeNameSnapshot: "HandoverEmployee016 Before Rename",
      storeNameSnapshot: "Hurstville Before Rename",
      evaluatorId: "manager-1",
      evaluatorNameSnapshot: "Winnie",
      evaluationPeriod: "2026 Q3",
      overallScoreV1: 82.4,
      tierV1: "T2",
      skillCoverageV1: 0.8,
      completedAt: new Date("2026-08-12T10:00:00.000Z"),
    }];
    const { service, db } = setup({ history });

    const result = await service.listCompletedHistory(["store-1"]);

    expect(db.evaluationRound.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: { in: ["store-1"] }, status: "CLOSED" }) }));
    expect(result[0]).toMatchObject({
      employeeName: "HandoverEmployee016 Before Rename",
      storeName: "Hurstville Before Rename",
      overallScore: 82.4,
      tier: "T2",
      roundNumber: 4,
    });
  });
});
